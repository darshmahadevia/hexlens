import './styles.css';
import type { ByteSpan, Inspection } from './domain/inspection.ts';
import {
  BYTES_PER_ROW,
  asciiLabel,
  copyText,
  createOwnershipIndex,
  fieldValueText,
  formatByte,
  formatDecimalOffset,
  formatOffset,
  getRow,
  normalizeSelection,
  ownershipAt,
  parseOffset,
  resolveSelection,
  rowCount,
  selectionHex,
  type OffsetMode,
  type SelectionResolution,
} from './domain/byte-grid.ts';
import { spanIntersects, spanLabel } from './domain/inspection.ts';
import { sampleInspection, PNG_SAMPLE_BASE64 } from './sample.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('HexLens mount point is missing.');
const mount = app;

const sample = sampleInspection();
const GRID_ROW_HEIGHT = 48;
const GRID_OVERSCAN = 5;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

function sourceDataUrl(): string {
  return `data:image/png;base64,${PNG_SAMPLE_BASE64}`;
}

function renderByteStrip(inspection: Inspection, selection?: ByteSpan, interactive = false): string {
  const visibleBytes = interactive ? inspection.bytes : inspection.bytes.slice(0, 24);
  const limitNote = interactive ? '' : '<span class="plate-caption">first 24 bytes</span>';
  const rows = [];
  for (let start = 0; start < visibleBytes.length; start += BYTES_PER_ROW) {
    const rowEnd = Math.min(start + BYTES_PER_ROW, visibleBytes.length);
    const selectedStart = selection ? Math.max(start, selection.offset) : start;
    const selectedEnd = selection ? Math.min(rowEnd, selection.offset + selection.length) : start;
    const selectedLength = Math.max(0, selectedEnd - selectedStart);
    const bracket = selectedLength > 0
      ? `<span class="span-bracket" style="--selection-start: ${selectedStart - start}; --selection-length: ${selectedLength}" aria-hidden="true"></span>`
      : '';
    const cells = Array.from(visibleBytes.slice(start, start + BYTES_PER_ROW), (value, index) => {
      const offset = start + index;
      const isSelected = selection ? offset >= selection.offset && offset < selection.offset + selection.length : false;
      const label = `${formatByte(value)} at offset ${formatOffset(offset, inspection.bytes.length)}; ${asciiLabel(value)}`;
      return interactive
        ? `<button class="byte-cell${isSelected ? ' is-selected' : ''}" type="button" data-byte-offset="${offset}" aria-label="${escapeHtml(label)}" aria-pressed="${isSelected}">${formatByte(value)}</button>`
        : `<span class="byte-cell${isSelected ? ' is-selected' : ''}" aria-label="${escapeHtml(label)}">${formatByte(value)}</span>`;
    }).join('');
    rows.push(`<div class="byte-row"><span class="byte-offset">${formatOffset(start, inspection.bytes.length)}</span><div class="byte-cells${selectedLength > 0 ? ' has-selection' : ''}">${bracket}${cells}</div><span class="ascii-gutter" aria-label="ASCII for offsets ${formatOffset(start, inspection.bytes.length)}–${formatOffset(rowEnd - 1, inspection.bytes.length)}">${Array.from(visibleBytes.slice(start, start + BYTES_PER_ROW), (value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : '·').join('')}</span></div>`);
  }
  return `<div class="byte-strip" data-testid="byte-strip">${rows.join('')}</div>${limitNote}`;
}

function renderStructureLabels(inspection: Inspection, selection?: ByteSpan, interactive = false): string {
  return inspection.structures.map((structure) => {
    const active = selection ? spanIntersects(structure.span, selection) : false;
    const tag = structure.kind === 'payload' ? 'Payload' : structure.kind === 'header' ? 'Header' : 'Structure';
    const content = `<span class="structure-index">${spanLabel(structure.span)}</span><span class="structure-copy"><strong>${escapeHtml(structure.label)}</strong><small>${tag} · ${structure.span.length} bytes</small></span>`;
    return interactive
      ? `<button class="structure-row${active ? ' is-selected' : ''}" type="button" data-structure-id="${escapeHtml(structure.id)}" aria-pressed="${active}">${content}</button>`
      : `<div class="structure-row${active ? ' is-selected' : ''}">${content}</div>`;
  }).join('');
}

function renderLanding(inspection: Inspection): void {
  mount.innerHTML = `
    <main class="app-shell landing-shell">
      <section class="sheet-frame landing-sheet" aria-labelledby="landing-title">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <div class="masthead">
          <a class="wordmark" href="/" aria-label="HexLens home">HexLens</a>
          <span class="masthead-rule" aria-hidden="true"></span>
          <span class="masthead-label">Local binary structure inspector</span>
          <dl class="accession-meta">
            <div><dt>Acc. no.</dt><dd>HL-2025-001</dd></div>
            <div><dt>Catalog</dt><dd>Binary / Inspection</dd></div>
          </dl>
        </div>

        <div class="landing-grid">
          <div class="landing-copy">
            <h1 id="landing-title"><span>Read the file.</span><span>See the structure.</span></h1>
            <span class="short-rule" aria-hidden="true"></span>
            <p class="lead-copy">HexLens opens a binary file on your machine and ties its named Structures to the bytes that form them.</p>
            <p class="support-copy">No uploads. No guesswork.<br />Just bytes, offsets, and meaning.</p>
            <div class="landing-actions">
              <a class="button button-primary" href="/inspect?sample=png" data-testid="try-sample">Try the sample <span aria-hidden="true">→</span></a>
              <button class="button button-secondary" type="button" disabled aria-disabled="true">Open a file</button>
            </div>
            <p class="local-note"><span class="lock-mark" aria-hidden="true"><span></span></span><span><strong>100% local.</strong><br />Your files never leave your machine.</span></p>
          </div>

          <div class="sample-plate" aria-labelledby="sample-title">
            <div class="sample-plate-heading"><h2 id="sample-title">Sample: PNG <span>(first 24 bytes)</span></h2><span class="plate-line" aria-hidden="true"></span></div>
            <div class="sample-offsets" aria-hidden="true"><span>Offset</span><span>00</span><span>04</span><span>08</span><span>0C</span><span>14</span><span>18</span></div>
            ${renderByteStrip(inspection, inspection.structures[0]?.span)}
            <div class="landing-structure-map">${renderStructureLabels(inspection, inspection.structures[0]?.span)}</div>
            <figure class="source-preview-mini"><figcaption>Source preview · original-file rendering</figcaption><img src="${sourceDataUrl()}" alt="A one-pixel PNG Sample rendered as a tiny transparent image" /></figure>
          </div>
        </div>

        <footer class="sheet-footer"><span>Method: <strong>visual byte inspection</strong></span><span>Medium: <strong>hexadecimal</strong></span><span>Tool: <strong>HexLens (local)</strong></span><span class="stamp" aria-label="HexLens sample mark">HL<br />25</span></footer>
      </section>
    </main>
  `;
}

type GridFocusTarget = { kind: 'byte'; offset: number } | { kind: 'structure'; id: string } | { kind: 'field'; id: string };

interface VirtualGridOptions {
  inspection: Inspection;
  selection: ByteSpan;
  anchor?: number;
  scrollTop?: number;
  onSelect: (selection: ByteSpan, focusTarget: GridFocusTarget, scrollTop: number, anchor: number) => void;
}

/**
 * A small dependency-free virtualizer. Rows are absolute byte offsets; the
 * Selection and anchor live outside the mounted DOM so scrolling cannot erase
 * them. The visible window is intentionally bounded by overscan rows.
 */
class VirtualByteGrid {
  private readonly viewport: HTMLDivElement;
  private readonly rowsRoot: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly inspection: Inspection;
  private readonly ownership;
  private readonly onSelect: VirtualGridOptions['onSelect'];
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
    this.selection = normalizeSelection(options.selection, options.inspection.bytes.length);
    this.anchor = options.anchor ?? this.selection.offset;
    this.activeOffset = this.selection.offset;
    this.spacer.style.height = `${rowCount(this.inspection.bytes.length) * GRID_ROW_HEIGHT}px`;
    this.viewport.addEventListener('scroll', this.handleScroll, { passive: true });
    this.viewport.addEventListener('click', this.handleClick);
    this.viewport.addEventListener('keydown', this.handleKeyDown);
    if (options.scrollTop !== undefined) this.viewport.scrollTop = options.scrollTop;
    this.render();
  }

  get scrollTop(): number {
    return this.viewport.scrollTop;
  }

  scrollToOffset(offset: number, focus = true): void {
    const safeOffset = Math.max(0, Math.min(this.inspection.bytes.length - 1, offset));
    const row = Math.floor(safeOffset / BYTES_PER_ROW);
    const top = row * GRID_ROW_HEIGHT;
    const bottom = top + GRID_ROW_HEIGHT;
    if (top < this.viewport.scrollTop) this.viewport.scrollTop = top;
    else if (bottom > this.viewport.scrollTop + this.viewport.clientHeight) this.viewport.scrollTop = Math.max(0, bottom - this.viewport.clientHeight);
    this.activeOffset = safeOffset;
    this.render();
    if (focus) this.focusOffset(safeOffset);
  }

  private handleScroll = (): void => {
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
  };

  private handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLButtonElement>('[data-byte-offset]');
    if (!cell) return;
    const offset = Number(cell.dataset.byteOffset);
    if (!Number.isInteger(offset)) return;
    const selection = event.shiftKey ? this.extendSelection(offset) : { offset, length: 1 };
    if (!event.shiftKey) this.anchor = offset;
    this.activeOffset = offset;
    this.onSelect(selection, { kind: 'byte', offset }, this.scrollTop, this.anchor);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLButtonElement>('[data-byte-offset]');
    if (!cell) return;
    const current = Number(cell.dataset.byteOffset);
    if (!Number.isInteger(current)) return;
    let next = current;
    if (event.key === 'ArrowLeft') next -= 1;
    else if (event.key === 'ArrowRight') next += 1;
    else if (event.key === 'ArrowUp') next -= BYTES_PER_ROW;
    else if (event.key === 'ArrowDown') next += BYTES_PER_ROW;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.inspection.bytes.length - 1;
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(this.inspection.bytes.length - 1, next));
    const selection = event.shiftKey ? this.extendSelection(next) : { offset: next, length: 1 };
    if (!event.shiftKey) this.anchor = next;
    this.activeOffset = next;
    this.onSelect(selection, { kind: 'byte', offset: next }, this.scrollTop, this.anchor);
  };

  private extendSelection(offset: number): ByteSpan {
    const start = Math.min(this.anchor, offset);
    return { offset: start, length: Math.abs(offset - this.anchor) + 1 };
  }

  private render(): void {
    const rowTotal = rowCount(this.inspection.bytes.length);
    const viewportHeight = this.viewport.clientHeight || GRID_ROW_HEIGHT * 10;
    const firstRow = Math.max(0, Math.floor(this.viewport.scrollTop / GRID_ROW_HEIGHT) - GRID_OVERSCAN);
    const lastRow = Math.min(rowTotal, Math.ceil((this.viewport.scrollTop + viewportHeight) / GRID_ROW_HEIGHT) + GRID_OVERSCAN);
    if (firstRow === this.renderedFirstRow && lastRow === this.renderedLastRow) return;
    this.renderedFirstRow = firstRow;
    this.renderedLastRow = lastRow;
    const fragment = document.createDocumentFragment();
    for (let rowIndex = firstRow; rowIndex < lastRow; rowIndex += 1) fragment.appendChild(this.renderRow(rowIndex));
    this.rowsRoot.replaceChildren(fragment);
  }

  private renderRow(rowIndex: number): HTMLDivElement {
    const row = getRow(this.inspection.bytes, rowIndex);
    const rowElement = document.createElement('div');
    rowElement.className = 'byte-grid-row';
    rowElement.setAttribute('role', 'row');
    rowElement.dataset.rowIndex = String(rowIndex);
    rowElement.style.transform = `translateY(${row.index * GRID_ROW_HEIGHT}px)`;
    rowElement.style.height = `${GRID_ROW_HEIGHT}px`;

    const offset = document.createElement('span');
    offset.className = 'byte-offset';
    offset.textContent = formatOffset(row.offset, this.inspection.bytes.length);
    offset.setAttribute('aria-label', `Row offset hexadecimal ${formatOffset(row.offset, this.inspection.bytes.length)}, decimal ${formatDecimalOffset(row.offset)}`);
    rowElement.appendChild(offset);

    const cells = document.createElement('div');
    cells.className = 'byte-grid-cells';
    cells.setAttribute('role', 'group');
    cells.setAttribute('aria-label', `Hexadecimal bytes at offset ${formatOffset(row.offset, this.inspection.bytes.length)}`);
    row.values.forEach((value, index) => {
      const byteOffset = row.offset + index;
      const owner = ownershipAt(this.ownership, byteOffset);
      const previous = byteOffset > 0 ? ownershipAt(this.ownership, byteOffset - 1) : undefined;
      const next = byteOffset + 1 < this.inspection.bytes.length ? ownershipAt(this.ownership, byteOffset + 1) : undefined;
      const isSelected = byteOffset >= this.selection.offset && byteOffset < this.selection.offset + this.selection.length;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `byte-cell ownership-${owner.kind}${isSelected ? ' is-selected' : ''}${!previous || previous.id !== owner.id ? ' owner-start' : ''}${!next || next.id !== owner.id ? ' owner-end' : ''}`;
      cell.dataset.byteOffset = String(byteOffset);
      cell.dataset.ownership = owner.kind;
      cell.dataset.ownershipLabel = owner.label;
      cell.setAttribute('aria-pressed', String(isSelected));
      const ownershipDescription = owner.kind === 'unmapped' || owner.kind === 'unowned'
        ? 'Unmapped span'
        : owner.kind === 'field' ? 'Structure-owned Field' : 'Structure-owned byte';
      const paddedOffset = formatOffset(byteOffset, this.inspection.bytes.length);
      const compactOffset = byteOffset.toString(16).toUpperCase().padStart(2, '0');
      cell.setAttribute('aria-label', `${formatByte(value)} at offset ${compactOffset}`);
      cell.setAttribute('aria-description', `${ownershipDescription}; hexadecimal offset ${paddedOffset}; decimal offset ${formatDecimalOffset(byteOffset)}; ${asciiLabel(value)}`);
      cell.title = `${owner.label} · ${asciiLabel(value)}`;
      cell.textContent = formatByte(value);
      cells.appendChild(cell);
    });
    rowElement.appendChild(cells);

    const ascii = document.createElement('span');
    ascii.className = 'ascii-gutter';
    ascii.textContent = row.ascii;
    ascii.setAttribute('aria-label', `Printable ASCII for row ${formatOffset(row.offset, this.inspection.bytes.length)}: ${row.values.map(asciiLabel).join(', ')}`);
    rowElement.appendChild(ascii);
    return rowElement;
  }

  private focusOffset(offset: number): void {
    queueMicrotask(() => {
      const cell = Array.from(this.rowsRoot.querySelectorAll<HTMLButtonElement>('[data-byte-offset]')).find((item) => Number(item.dataset.byteOffset) === offset);
      cell?.focus({ preventScroll: true });
    });
  }
}

function renderSemanticDetail(inspection: Inspection, resolution: SelectionResolution): string {
  const structure = resolution.structure;
  const selectedLabel = resolution.field?.label ?? structure?.label ?? resolution.unmapped?.label ?? 'Unmapped span';
  const intersecting = resolution.intersectingFields.length > 0
    ? `<p class="related-fields"><strong>Intersecting Fields</strong> ${resolution.intersectingFields.map((field) => escapeHtml(field.label)).join(' · ')}</p>`
    : '';
  const bitDetails = resolution.bitFields.length > 0
    ? `<div class="semantic-subsection"><strong>Bit fields</strong>${resolution.bitFields.map((bitField) => `<span>${escapeHtml(bitField.label)} · mask 0x${bitField.mask.toString(16).toUpperCase().padStart(2, '0')}</span>`).join('')}</div>`
    : '';
  const derivedDetails = resolution.derivedValues.length > 0
    ? `<div class="semantic-subsection"><strong>Derived values</strong>${resolution.derivedValues.map((derived) => `<span>${escapeHtml(derived.label)} = ${escapeHtml(formatValue(derived.value))}; sources: ${escapeHtml(derived.sourceFieldIds.join(', '))}</span>`).join('')}</div>`
    : '';
  const unmappedDetails = resolution.unmapped
    ? `<div class="semantic-subsection unmapped-note"><strong>Unmapped span</strong><span>${escapeHtml(resolution.unmapped.reason ?? 'No parsed Structure or Field claims these bytes.')}</span></div>`
    : '';
  const diagnostics = inspection.diagnostics.filter((diagnostic) => spanIntersects(diagnostic.span, resolution.selection));
  const diagnosticDetails = diagnostics.length > 0
    ? `<div class="semantic-subsection diagnostic-list"><strong>Diagnostics</strong>${diagnostics.map((diagnostic) => `<span><button class="inline-copy" type="button" data-copy-kind="diagnostic" data-diagnostic-code="${escapeHtml(diagnostic.code)}">Copy ${escapeHtml(diagnostic.code)}</button> ${escapeHtml(diagnostic.message)}</span>`).join('')}</div>`
    : '';
  return `<div class="field-detail" data-testid="field-detail">
      <div class="detail-kicker">Selected ${resolution.field ? 'Field' : 'Structure'}</div>
      <h3>${escapeHtml(selectedLabel)}</h3>
      ${resolution.field ? `<p class="detail-explanation">${escapeHtml(resolution.field.explanation)}</p>` : `<p class="detail-explanation">${escapeHtml(structure?.description ?? 'This Byte span is not claimed by a parsed Structure.')}</p>`}
      ${intersecting}
      <dl class="field-facts">
        <div><dt>Byte span</dt><dd>${spanLabel(resolution.selection)} <span>(offset ${resolution.selection.offset}, ${resolution.selection.length} bytes)</span></dd></div>
        ${resolution.field ? `<div><dt>Encoded</dt><dd class="mono">${resolution.field.encodedBytes.map(formatByte).join(' ')} <button class="inline-copy" type="button" data-copy-kind="field-bytes" data-field-id="${escapeHtml(resolution.field.id)}">Copy</button></dd></div><div><dt>Interpreted</dt><dd>${escapeHtml(formatValue(resolution.field.value))} <button class="inline-copy" type="button" data-copy-kind="field-value" data-field-id="${escapeHtml(resolution.field.id)}">Copy</button></dd></div><div><dt>Representation</dt><dd>${escapeHtml(resolution.field.representation)}${resolution.field.endianness && resolution.field.endianness !== 'n/a' ? ` · ${resolution.field.endianness}` : ''}</dd></div><div><dt>Offset</dt><dd class="mono">0x${formatOffset(resolution.field.span.offset, inspection.bytes.length)} / ${formatDecimalOffset(resolution.field.span.offset)} <button class="inline-copy" type="button" data-copy-kind="field-offset" data-field-id="${escapeHtml(resolution.field.id)}">Copy</button></dd></div>` : `<div><dt>Ownership</dt><dd>${escapeHtml(resolution.unmapped ? 'Unmapped span' : 'Structure span')}</dd></div>`}
      </dl>
      ${bitDetails}${derivedDetails}${unmappedDetails}${diagnosticDetails}
    </div>`;
}

function renderFieldInspector(inspection: Inspection, resolution: SelectionResolution): string {
  const structure = resolution.structure ?? inspection.structures[0];
  const fields = structure?.fields.map((field) => {
    const active = resolution.field?.id === field.id || resolution.intersectingFields.some((item) => item.id === field.id);
    return `<button class="field-row${active ? ' is-selected' : ''}" type="button" data-field-id="${escapeHtml(field.id)}" aria-pressed="${active}"><span class="field-label"><strong>${escapeHtml(field.label)}</strong><small>${spanLabel(field.span)} · ${field.span.length} bytes</small></span><span class="field-value">${escapeHtml(formatValue(field.value))}</span></button>`;
  }).join('') ?? '';
  const heading = structure
    ? `<div class="field-structure-heading"><span class="plate-index">${spanLabel(structure.span)}</span><div><strong>${escapeHtml(structure.label)}</strong><small>${escapeHtml(structure.description)}</small></div></div>`
    : '<p class="field-empty">No parsed Structure claims this Selection.</p>';
  return `<div class="field-inspector"><div class="panel-heading"><span>Field inspector</span><span class="panel-rule" aria-hidden="true"></span></div>${heading}<div class="field-list">${fields}</div>${renderSemanticDetail(inspection, resolution)}</div>`;
}

function renderInspector(inspection: Inspection, requestedSelection: ByteSpan = { offset: 0, length: Math.min(8, inspection.bytes.length) }, focusTarget?: GridFocusTarget, gridScrollTop?: number, selectionAnchor?: number): void {
  const selection = normalizeSelection(requestedSelection, inspection.bytes.length);
  const resolution = resolveSelection(inspection, selection);
  const selectedLabel = resolution.field?.label ?? resolution.structure?.label ?? resolution.unmapped?.label ?? 'Unmapped span';
  const selectedSummary = `Selected ${selectedLabel}, offset ${selection.offset}, length ${selection.length} bytes.`;
  const formatLabel = inspection.format.toUpperCase();
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet" aria-labelledby="inspector-title">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <header class="inspector-toolbar">
          <a href="/" class="back-link">← Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">Sample Inspection</h1></div>
          <div class="file-identity"><strong title="${escapeHtml(inspection.sourceName)}">${escapeHtml(inspection.sourceName)}</strong><span>${inspection.bytes.length.toLocaleString('en-US')} bytes · ${formatLabel}</span></div>
        </header>
        <div class="inspector-status" role="status"><span class="status-dot" aria-hidden="true"></span>${inspection.state === 'ready' ? 'Ready' : 'Partial Inspection'} · Bytes are held in memory only</div>

        <div class="inspector-layout">
          <aside class="structure-panel" aria-labelledby="structure-heading"><div class="panel-heading"><span id="structure-heading">Structures</span><span class="panel-rule" aria-hidden="true"></span></div><p class="panel-intro">Named parts in source-file order.</p><nav class="structure-list" aria-label="${formatLabel} Structures">${renderStructureLabels(inspection, selection, true)}</nav><div class="structure-legend"><span class="legend-mark legend-structure" aria-hidden="true"></span><span>Structure boundary</span><span class="legend-mark legend-selection" aria-hidden="true"></span><span>Selected Byte span</span><span class="legend-mark legend-unmapped" aria-hidden="true"></span><span>Unmapped span</span></div></aside>

          <section class="byte-panel" aria-labelledby="bytes-heading"><div class="panel-heading"><span id="bytes-heading">Bytes</span><span class="panel-rule" aria-hidden="true"></span><span class="panel-meta">16 bytes / row · virtualized</span></div><p class="panel-intro">Select a byte to focus its smallest matching Field. Shift-select or use arrow keys to extend the exact Selection.</p>
            <form class="goto-form" data-testid="goto-form"><label for="goto-offset">Go to offset</label><select id="goto-mode" aria-label="Offset notation"><option value="hex">Hexadecimal</option><option value="decimal">Decimal (explicit)</option></select><input id="goto-offset" data-testid="offset-input" name="offset" inputmode="text" autocomplete="off" placeholder="e.g. 0030" aria-describedby="offset-help offset-error" /><button class="button button-secondary" type="submit">Go</button><span id="offset-help" class="sr-only">Hexadecimal is the default. Choose Decimal explicitly for base ten.</span></form><p class="offset-error" id="offset-error" data-testid="offset-error" role="alert" hidden></p>
            <div class="byte-grid" data-testid="byte-grid"><div class="byte-grid-header" aria-hidden="true"><span>Offset</span><span>Hex bytes</span><span>ASCII</span></div><div class="byte-grid-viewport" data-grid-viewport role="grid" aria-label="Virtualized byte grid"><div class="byte-grid-spacer" data-grid-spacer></div><div class="byte-grid-rows" data-grid-rows></div></div></div>
            <div class="selection-summary" data-testid="selection-summary"><span class="summary-mark" aria-hidden="true"></span><span>${escapeHtml(selectedSummary)} <span class="summary-secondary">hex ${formatOffset(selection.offset, inspection.bytes.length)}–${formatOffset(Math.max(selection.offset, selection.offset + selection.length - 1), inspection.bytes.length)} · decimal ${formatDecimalOffset(selection.offset)}</span></span><button class="inline-copy" type="button" data-copy-kind="selection">Copy selected bytes</button></div><div class="selection-announcement sr-only" aria-live="polite" data-testid="selection-announcement">${escapeHtml(selectedSummary)}</div><div class="ascii-note"><span class="mono">·</span> non-printable bytes use the <span class="mono">·</span> marker; each byte has an accessible value label</div><div class="copy-feedback" data-testid="copy-feedback" role="status" aria-live="polite"></div>
          </section>

          <aside class="field-panel" aria-labelledby="field-heading">${renderFieldInspector(inspection, resolution)}<figure class="source-preview"><figcaption id="field-heading">Source preview <span>· original-file rendering</span></figcaption><img src="${sourceDataUrl()}" alt="A one-pixel PNG Sample rendered as the original file" /></figure></aside>
        </div>
        <footer class="sheet-footer inspector-footer"><span>Inspection: <strong>${formatLabel} Sample</strong></span><span>Source preview is not parsed output.</span><span class="footer-local">Local only · no telemetry</span></footer>
      </section>
    </main>
  `;

  const viewport = mount.querySelector<HTMLDivElement>('[data-grid-viewport]');
  if (!viewport) return;
  const grid = new VirtualByteGrid(viewport, {
    inspection,
    selection,
    anchor: selectionAnchor,
    scrollTop: gridScrollTop,
    onSelect: (nextSelection, nextFocus, scrollTop, anchor) => renderInspector(inspection, nextSelection, nextFocus, scrollTop, anchor),
  });

  mount.querySelectorAll<HTMLElement>('[data-structure-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.structureId;
      const next = inspection.structures.find((item) => item.id === id);
      if (next) renderInspector(inspection, next.span, { kind: 'structure', id: next.id });
    });
  });
  mount.querySelectorAll<HTMLElement>('[data-field-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.fieldId;
      const next = inspection.structures.flatMap((item) => item.fields).find((item) => item.id === id);
      if (next) renderInspector(inspection, next.span, { kind: 'field', id: next.id });
    });
  });

  const offsetForm = mount.querySelector<HTMLFormElement>('[data-testid="goto-form"]');
  const offsetInput = mount.querySelector<HTMLInputElement>('#goto-offset');
  const offsetMode = mount.querySelector<HTMLSelectElement>('#goto-mode');
  const offsetError = mount.querySelector<HTMLElement>('[data-testid="offset-error"]');
  offsetForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = parseOffset(offsetInput?.value ?? '', (offsetMode?.value as OffsetMode) || 'hex', inspection.bytes.length);
    if (!result.ok) {
      if (offsetError) {
        offsetError.hidden = false;
        offsetError.textContent = result.message;
      }
      offsetInput?.setAttribute('aria-invalid', 'true');
      return;
    }
    if (offsetError) {
      offsetError.hidden = true;
      offsetError.textContent = '';
    }
    offsetInput?.removeAttribute('aria-invalid');
    grid.scrollToOffset(result.offset);
  });

  mount.querySelectorAll<HTMLButtonElement>('[data-copy-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const copyKind = button.dataset.copyKind;
      let value = '';
      if (copyKind === 'selection') value = selectionHex(inspection.bytes, selection);
      else if (copyKind === 'diagnostic') value = button.dataset.diagnosticCode ?? '';
      else {
        const field = inspection.structures.flatMap((item) => item.fields).find((item) => item.id === button.dataset.fieldId);
        if (!field) return;
        if (copyKind === 'field-bytes') value = field.encodedBytes.map(formatByte).join(' ');
        else if (copyKind === 'field-value') value = fieldValueText(field);
        else if (copyKind === 'field-offset') value = `0x${formatOffset(field.span.offset, inspection.bytes.length)} (${field.span.offset})`;
      }
      copyText(value).then((result) => {
        const feedback = mount.querySelector<HTMLElement>('[data-testid="copy-feedback"]');
        if (feedback) feedback.textContent = result.message;
      });
    });
  });

  if (focusTarget) {
    queueMicrotask(() => {
      let target: HTMLElement | undefined;
      if (focusTarget.kind === 'byte') target = Array.from(mount.querySelectorAll<HTMLElement>('[data-byte-offset]')).find((item) => Number(item.dataset.byteOffset) === focusTarget.offset);
      else if (focusTarget.kind === 'structure') target = mount.querySelector<HTMLElement>(`[data-structure-id="${CSS.escape(focusTarget.id)}"]`) ?? undefined;
      else target = mount.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(focusTarget.id)}"]`) ?? undefined;
      target?.focus({ preventScroll: true });
    });
  }
}

function renderRoute(): void {
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname === '/inspect' && params.get('sample') === 'png') {
    renderInspector(sample);
    return;
  }
  if (window.location.pathname === '/inspect') {
    mount.innerHTML = `<main class="app-shell"><section class="sheet-frame empty-sheet"><a class="back-link" href="/">← Back to landing</a><h1>No Inspection selected.</h1><p>Open the PNG Sample from the landing page to start a local Inspection.</p><a class="button button-primary" href="/inspect?sample=png">Try the sample</a></section></main>`;
    return;
  }
  renderLanding(sample);
}

window.addEventListener('popstate', renderRoute);
renderRoute();
