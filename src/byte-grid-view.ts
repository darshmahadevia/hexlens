import type { ByteSpan, Inspection } from './domain/inspection.ts';
import {
  BYTES_PER_ROW, asciiLabel, createOwnershipIndex, formatByte, formatDecimalOffset,
  formatOffset, getRow, normalizeSelection, ownershipAt, rowCount,
} from './domain/byte-grid.ts';

const ROW_HEIGHT = 48;
const OVERSCAN = 5;

export type GridFocusTarget =
  | { kind: 'byte'; offset: number } | { kind: 'structure'; id: string }
  | { kind: 'field'; id: string } | { kind: 'grid' } | { kind: 'enumeration' } | { kind: 'offset' };

export interface VirtualGridOptions {
  inspection: Inspection;
  selection: ByteSpan;
  enumerateRawBytes: boolean;
  anchor?: number;
  scrollTop?: number;
  onSelect: (selection: ByteSpan, focusTarget: GridFocusTarget, scrollTop: number, anchor: number) => void;
}

/** Owns the bounded DOM window and keyboard contract for the byte grid. */
export class VirtualByteGrid {
  private readonly viewport: HTMLDivElement;
  private readonly rowsRoot: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly inspection: Inspection;
  private readonly ownership;
  private readonly onSelect: VirtualGridOptions['onSelect'];
  private readonly enumerateRawBytes: boolean;
  private selection: ByteSpan;
  private anchor: number;
  private activeOffset: number;
  private frame: number | undefined;
  private renderedFirstRow = -1;
  private renderedLastRow = -1;

  constructor(root: HTMLDivElement, options: VirtualGridOptions) {
    this.viewport = root;
    this.rowsRoot = root.querySelector<HTMLDivElement>('[data-grid-rows]') ?? root;
    this.spacer = root.querySelector<HTMLDivElement>('[data-grid-spacer]') ?? root;
    this.inspection = options.inspection;
    this.ownership = createOwnershipIndex(options.inspection);
    this.onSelect = options.onSelect;
    this.enumerateRawBytes = options.enumerateRawBytes;
    this.selection = normalizeSelection(options.selection, options.inspection.bytes.length);
    this.anchor = options.anchor ?? this.selection.offset;
    this.activeOffset = this.selection.offset;
    this.spacer.style.height = `${rowCount(this.inspection.bytes.length) * ROW_HEIGHT}px`;
    this.viewport.tabIndex = this.enumerateRawBytes ? -1 : 0;
    this.viewport.setAttribute('aria-label', this.enumerateRawBytes ? 'Virtualized byte grid; raw bytes are individually keyboard reachable' : 'Virtualized byte grid; raw-byte enumeration is off, use go to offset or arrow keys');
    this.viewport.setAttribute('aria-rowcount', String(rowCount(this.inspection.bytes.length)));
    this.viewport.setAttribute('aria-colcount', String(BYTES_PER_ROW));
    this.viewport.setAttribute('aria-describedby', 'selection-summary byte-grid-help');
    this.viewport.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Shift');
    this.viewport.addEventListener('scroll', this.handleScroll, { passive: true });
    this.viewport.addEventListener('click', this.handleClick);
    this.viewport.addEventListener('keydown', this.handleKeyDown);
    if (options.scrollTop !== undefined) this.viewport.scrollTop = options.scrollTop;
    this.render();
  }
  get scrollTop(): number { return this.viewport.scrollTop; }
  scrollToOffset(offset: number, focus = true): void {
    const safe = Math.max(0, Math.min(this.inspection.bytes.length - 1, offset));
    const top = Math.floor(safe / BYTES_PER_ROW) * ROW_HEIGHT;
    if (top < this.viewport.scrollTop) this.viewport.scrollTop = top;
    else if (top + ROW_HEIGHT > this.viewport.scrollTop + this.viewport.clientHeight) this.viewport.scrollTop = Math.max(0, top + ROW_HEIGHT - this.viewport.clientHeight);
    this.activeOffset = safe; this.render(); if (focus) this.focusOffset(safe);
  }
  private handleScroll = (): void => { if (this.frame !== undefined) return; this.frame = requestAnimationFrame(() => { this.frame = undefined; this.render(); }); };
  private handleClick = (event: MouseEvent): void => {
    const target = event.target; if (!(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLButtonElement>('[data-byte-offset]'); if (!cell) return;
    const offset = Number(cell.dataset.byteOffset); if (!Number.isInteger(offset)) return;
    const selection = event.shiftKey ? this.extendSelection(offset) : { offset, length: 1 };
    if (!event.shiftKey) this.anchor = offset; this.activeOffset = offset;
    this.onSelect(selection, { kind: 'byte', offset }, this.scrollTop, this.anchor);
  };
  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target; if (!(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLButtonElement>('[data-byte-offset]'); if (!cell && target !== this.viewport) return;
    const current = cell ? Number(cell.dataset.byteOffset) : this.activeOffset; if (!Number.isInteger(current)) return;
    let next = current;
    if (event.key === 'ArrowLeft') next -= 1; else if (event.key === 'ArrowRight') next += 1; else if (event.key === 'ArrowUp') next -= BYTES_PER_ROW; else if (event.key === 'ArrowDown') next += BYTES_PER_ROW; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = this.inspection.bytes.length - 1;
    else if (cell && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.anchor = current; this.activeOffset = current; this.onSelect({ offset: current, length: 1 }, { kind: 'byte', offset: current }, this.scrollTop, this.anchor); return; } else return;
    event.preventDefault(); next = Math.max(0, Math.min(this.inspection.bytes.length - 1, next));
    const selection = event.shiftKey ? this.extendSelection(next) : { offset: next, length: 1 }; if (!event.shiftKey) this.anchor = next; this.activeOffset = next; this.scrollToOffset(next, false);
    this.onSelect(selection, cell ? { kind: 'byte', offset: next } : { kind: 'grid' }, this.scrollTop, this.anchor);
  };
  private extendSelection(offset: number): ByteSpan { return { offset: Math.min(this.anchor, offset), length: Math.abs(offset - this.anchor) + 1 }; }
  private render(): void {
    const total = rowCount(this.inspection.bytes.length), height = this.viewport.clientHeight || ROW_HEIGHT * 10;
    const first = Math.max(0, Math.floor(this.viewport.scrollTop / ROW_HEIGHT) - OVERSCAN), last = Math.min(total, Math.ceil((this.viewport.scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
    if (first === this.renderedFirstRow && last === this.renderedLastRow) return; this.renderedFirstRow = first; this.renderedLastRow = last;
    const fragment = document.createDocumentFragment(); for (let i = first; i < last; i += 1) fragment.appendChild(this.renderRow(i)); this.rowsRoot.replaceChildren(fragment);
    const active = this.rowsRoot.querySelector<HTMLElement>(`[data-byte-offset="${this.activeOffset}"]`); if (active) this.viewport.setAttribute('aria-activedescendant', active.id); else this.viewport.removeAttribute('aria-activedescendant');
  }
  private renderRow(rowIndex: number): HTMLDivElement {
    const row = getRow(this.inspection.bytes, rowIndex), element = document.createElement('div'); element.className = 'byte-grid-row'; element.setAttribute('role', 'row'); element.setAttribute('aria-rowindex', String(rowIndex + 1)); element.dataset.rowIndex = String(rowIndex); element.style.transform = `translateY(${row.index * ROW_HEIGHT}px)`; element.style.height = `${ROW_HEIGHT}px`;
    const offset = document.createElement('span'); offset.className = 'byte-offset'; offset.setAttribute('role', 'rowheader'); offset.textContent = formatOffset(row.offset, this.inspection.bytes.length); offset.setAttribute('aria-label', `Row offset hexadecimal ${formatOffset(row.offset, this.inspection.bytes.length)}, decimal ${formatDecimalOffset(row.offset)}`); element.appendChild(offset);
    const cells = document.createElement('div'); cells.className = 'byte-grid-cells'; cells.setAttribute('role', 'gridcell'); cells.setAttribute('aria-label', `Hexadecimal bytes at offset ${formatOffset(row.offset, this.inspection.bytes.length)}`);
    row.values.forEach((value, index) => { const byteOffset = row.offset + index, owner = ownershipAt(this.ownership, byteOffset), previous = byteOffset > 0 ? ownershipAt(this.ownership, byteOffset - 1) : undefined, next = byteOffset + 1 < this.inspection.bytes.length ? ownershipAt(this.ownership, byteOffset + 1) : undefined, selected = byteOffset >= this.selection.offset && byteOffset < this.selection.offset + this.selection.length, cell = document.createElement('button'); cell.type = 'button'; cell.className = `byte-cell ownership-${owner.kind}${selected ? ' is-selected' : ''}${!previous || previous.id !== owner.id ? ' owner-start' : ''}${!next || next.id !== owner.id ? ' owner-end' : ''}`; cell.dataset.byteOffset = String(byteOffset); cell.dataset.ownership = owner.kind; cell.dataset.ownershipLabel = owner.label; cell.id = `byte-cell-${byteOffset}`; cell.tabIndex = this.enumerateRawBytes ? 0 : -1; cell.setAttribute('aria-pressed', String(selected)); const description = owner.kind === 'unmapped' || owner.kind === 'unowned' ? 'Unmapped span' : owner.kind === 'field' ? 'Structure-owned Field' : 'Structure-owned byte'; cell.setAttribute('aria-label', `${formatByte(value)} at offset ${byteOffset.toString(16).toUpperCase().padStart(2, '0')}`); cell.setAttribute('aria-description', `${description}; hexadecimal offset ${formatOffset(byteOffset, this.inspection.bytes.length)}; decimal offset ${formatDecimalOffset(byteOffset)}; ${asciiLabel(value)}`); cell.title = `${owner.label} · ${asciiLabel(value)}`; cell.textContent = formatByte(value); cells.appendChild(cell); });
    element.appendChild(cells); const ascii = document.createElement('span'); ascii.className = 'ascii-gutter'; ascii.textContent = row.ascii; ascii.setAttribute('aria-label', `Printable ASCII for row ${formatOffset(row.offset, this.inspection.bytes.length)}: ${row.values.map(asciiLabel).join(', ')}`); element.appendChild(ascii); return element;
  }
  private focusOffset(offset: number): void { queueMicrotask(() => Array.from(this.rowsRoot.querySelectorAll<HTMLButtonElement>('[data-byte-offset]')).find((item) => Number(item.dataset.byteOffset) === offset)?.focus({ preventScroll: true })); }
}
