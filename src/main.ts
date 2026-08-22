import './styles.css';
import type { ByteSpan, FormatId, Inspection } from './domain/inspection.ts';
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
import { detectFormat, inspectDetected } from './format.ts';
import { FileJobController, type FileJobParseResult } from './file-session.ts';
import { sampleInspection, PNG_SAMPLE_BASE64, wavSampleInspection, WAV_SAMPLE_BASE64 } from './sample.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('HexLens mount point is missing.');
const mount = app;

const sample = sampleInspection();
const wavSample = wavSampleInspection();
const GRID_ROW_HEIGHT = 48;
const GRID_OVERSCAN = 5;
const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
const PNG_TYPED_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tEXt', 'iTXt', 'gAMA', 'sRGB', 'tRNS', 'pHYs']);
const SELECTION_ANNOUNCEMENT_DELAY = 180;

type View = 'landing' | 'inspect';
type SessionKind = 'sample' | 'local';
type NoticeKind = 'info' | 'success' | 'error';

interface Notice {
  kind: NoticeKind;
  message: string;
}

interface OperationState {
  phase: 'ready' | 'reading' | 'parsing';
  origin: View;
  notice?: Notice;
}

interface InspectionSession {
  kind: SessionKind;
  inspection: Inspection;
  previewUrl?: string;
  previewFailed?: boolean;
}

const currentView = (): View => window.location.pathname === '/inspect' ? 'inspect' : 'landing';
let view: View = currentView();
let session: InspectionSession | null = null;
let operation: OperationState = { phase: 'ready', origin: view };
let dragDepth = 0;
let enumerateRawBytes = false;
let selectionAnnouncementTimer: ReturnType<typeof setTimeout> | undefined;
let selectionAnnouncementSequence = 0;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function publishImmediateAnnouncement(message: string): void {
  queueMicrotask(() => {
    const region = mount.querySelector<HTMLElement>('[data-testid="operation-announcement"]');
    if (region) region.textContent = message;
  });
}

function queueSelectionAnnouncement(message: string): void {
  selectionAnnouncementSequence += 1;
  const sequence = selectionAnnouncementSequence;
  if (selectionAnnouncementTimer !== undefined) clearTimeout(selectionAnnouncementTimer);
  const region = mount.querySelector<HTMLElement>('[data-testid="selection-announcement"]');
  if (region) region.textContent = '';
  selectionAnnouncementTimer = setTimeout(() => {
    if (sequence !== selectionAnnouncementSequence) return;
    const current = mount.querySelector<HTMLElement>('[data-testid="selection-announcement"]');
    if (current) current.textContent = message;
    selectionAnnouncementTimer = undefined;
  }, SELECTION_ANNOUNCEMENT_DELAY);
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

function formatLabel(format: FormatId): string {
  return format === 'wav' ? 'WAV' : 'PNG';
}

function sourceDataUrl(format: FormatId): string {
  return format === 'wav'
    ? `data:audio/wav;base64,${WAV_SAMPLE_BASE64}`
    : `data:image/png;base64,${PNG_SAMPLE_BASE64}`;
}

function sampleSession(inspection: Inspection): InspectionSession {
  return { kind: 'sample', inspection, previewUrl: sourceDataUrl(inspection.format) };
}

function revokePreview(target: InspectionSession | null): void {
  if (target?.kind === 'local' && target.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(target.previewUrl);
    target.previewUrl = undefined;
  }
}

function renderEmptyInspector(): void {
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet empty-inspector" aria-labelledby="inspector-title" data-drop-target="inspector">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <header class="inspector-toolbar" aria-label="Inspection toolbar">
          <a href="/" class="back-link">← Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">Open an Inspection</h1></div>
          <div class="file-identity"><strong>No file selected</strong><span>Local PNG or WAV</span></div>
        </header>
        ${renderStatus()}
        <div class="empty-inspector-content"><span class="plate-mark">One file, one Inspection</span><h2>Bring a PNG or WAV to the workbench.</h2><p>Choose one local PNG or WAV, or drop it here. HexLens checks the bytes on this device and keeps the current file in memory only.</p>${renderFileIngress()}<p class="drop-hint">Drop one PNG or WAV file · directories and multiple files are not accepted.</p>${renderNotice()}</div>
      </section>
    </main>
  `;
}

function render(): void {
  if (view === 'landing') {
    if (session?.kind === 'local') revokePreview(session);
    renderLanding();
    return;
  }
  if (session) renderInspector(session);
  else renderEmptyInspector();
}

function setNotice(kind: NoticeKind, message: string, origin = view): void {
  operation = { phase: 'ready', origin, notice: { kind, message } };
  render();
  publishImmediateAnnouncement(message);
}

function rejectionMessage(code: 'unsupported_format' | 'limit_reached' | 'invalid_input'): string {
  if (code === 'limit_reached') return 'That file is larger than the local safety limit. Choose a PNG or WAV under 25 MiB; your current Inspection is still open.';
  if (code === 'unsupported_format') return 'This file does not have a PNG signature or RIFF/WAVE signature. Choose one supported file or try a Sample; your current Inspection is still open.';
  return 'That input could not be opened. Choose one PNG or WAV file; your current Inspection is still open.';
}

function initialSelection(inspection: Inspection): ByteSpan {
  const first = inspection.structures[0]?.span;
  const firstField = inspection.structures[0]?.fields[0]?.span;
  return firstField ? { ...firstField } : first ? { ...first } : { offset: 0, length: Math.min(8, inspection.bytes.length) };
}

type LocalParseResult = FileJobParseResult<Inspection>;

const fileJobs = new FileJobController<Inspection>(undefined, async (bytes, file): Promise<LocalParseResult> => {
  const detected = detectFormat(bytes);
  if (detected !== 'png' && detected !== 'wav') return { accepted: false, rejection: { code: 'unsupported_format' } };
  const inspection = inspectDetected(bytes, file.name, { mimeType: file.type });
  return inspection ? { accepted: true, value: inspection } : { accepted: false, rejection: { code: 'unsupported_format' } };
});

function startFileJob(file: File, origin: View): void {
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    setNotice('error', rejectionMessage('limit_reached'), origin);
    return;
  }

  operation = { phase: 'reading', origin };
  const jobId = fileJobs.start(file, {
    onPhase: (phase, callbackJobId) => {
      if (!fileJobs.isActive(callbackJobId)) return;
      operation = { phase, origin };
      render();
    },
    onAccepted: (inspection, acceptedFile, callbackJobId) => {
      if (!fileJobs.isActive(callbackJobId)) return;
      const previous = session;
      session = { kind: 'local', inspection, previewUrl: undefined };
      ensurePreview(session);
      view = 'inspect';
      if (origin === 'landing') window.history.pushState(null, '', '/inspect');
      else window.history.replaceState(null, '', '/inspect');
      operation = { phase: 'ready', origin: 'inspect', notice: { kind: 'success', message: `Opened a local ${formatLabel(inspection.format)}. File data remains in memory only.` } };
      render();
      publishImmediateAnnouncement(`Opened a local ${formatLabel(inspection.format)}. File data remains in memory only.`);
      revokePreview(previous);
    },
    onRejected: (rejection, _rejectedFile, callbackJobId) => {
      if (!fileJobs.isActive(callbackJobId)) return;
      setNotice('error', rejectionMessage(rejection.code), origin);
    },
    onError: (callbackJobId) => {
      if (!fileJobs.isActive(callbackJobId)) return;
      setNotice('error', 'The file could not be read. Your current Inspection is still open.', origin);
    },
  });

  void jobId;
}

function cancelFileJob(): void {
  const canceled = fileJobs.cancel();
  if (canceled === undefined) return;
  setNotice('info', 'Opening was canceled. Your current Inspection is still open.');
}

function handlePickerChange(input: HTMLInputElement): void {
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) {
    setNotice('info', 'No file was selected. Your current Inspection is still open.');
    return;
  }
  if (files.length > 1) {
    setNotice('error', 'Choose one file at a time. Your current Inspection is still open.');
    return;
  }
  startFileJob(files[0], view);
}

interface DropSelection {
  kind: 'file' | 'multiple' | 'directory' | 'invalid';
  file?: File;
}

function classifyDrop(dataTransfer: DataTransfer | null): DropSelection {
  if (!dataTransfer) return { kind: 'invalid' };
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items.map((item) => {
    const candidate = item as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory?: boolean } | null };
    return typeof candidate.webkitGetAsEntry === 'function' ? candidate.webkitGetAsEntry() : null;
  });
  if (entries.some((entry) => entry?.isDirectory)) return { kind: 'directory' };

  const files = Array.from(dataTransfer.files ?? []);
  if (files.some((file) => Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath))) return { kind: 'directory' };
  const fileItems = items.filter((item) => item.kind === 'file');
  if (files.length > 1 || fileItems.length > 1) return { kind: 'multiple' };
  if (files.length !== 1) return { kind: 'invalid' };
  return { kind: 'file', file: files[0] };
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  dragDepth = 0;
  mount.classList.remove('is-drag-active');
  const selectionFromDrop = classifyDrop(event.dataTransfer);
  if (selectionFromDrop.kind === 'directory') {
    setNotice('error', 'Folders are not supported. Drop one PNG or WAV file; your current Inspection is still open.');
    return;
  }
  if (selectionFromDrop.kind === 'multiple') {
    setNotice('error', 'Choose one file at a time. Your current Inspection is still open.');
    return;
  }
  if (selectionFromDrop.kind !== 'file' || !selectionFromDrop.file) {
    setNotice('error', 'Drop one PNG or WAV file. Your current Inspection is still open.');
    return;
  }
  startFileJob(selectionFromDrop.file, view);
}

function ensurePreview(target: InspectionSession): void {
  if (target.kind !== 'local' || target.previewUrl || target.previewFailed) return;
  if (typeof URL.createObjectURL !== 'function') {
    target.previewFailed = true;
    return;
  }
  try {
    const copy = new Uint8Array(target.inspection.bytes);
    target.previewUrl = URL.createObjectURL(new Blob([copy.buffer], { type: target.inspection.format === 'wav' ? 'audio/wav' : 'image/png' }));
  } catch {
    // A browser media surface is optional. Keep the structural Inspection when
    // Blob/object-URL support is unavailable or rejects the original bytes.
    target.previewFailed = true;
  }
}

function renderFileIngress(): string {
  return `<div class="file-ingress" data-testid="file-ingress"><label class="button button-secondary file-picker"><span>Open a local PNG or WAV</span><input class="file-picker-input" type="file" accept=".png,.wav,image/png,audio/wav" aria-label="Choose one local PNG file or WAV file" data-testid="local-file-input" /></label><span class="file-ingress-note">One file · stays in memory only</span></div>`;
}

function renderNotice(): string {
  if (!operation.notice) return '';
  return `<p class="file-feedback file-feedback-${operation.notice.kind}" data-testid="file-feedback" role="${operation.notice.kind === 'error' ? 'alert' : 'status'}">${escapeHtml(operation.notice.message)}</p>`;
}

function operationLabel(inspection?: Inspection): string {
  if (operation.phase === 'reading') return 'Reading local file…';
  if (operation.phase === 'parsing') return 'Parsing locally…';
  if (!inspection) return 'Ready for one local PNG or WAV file';
  const diagnosticCount = inspection.diagnostics.length;
  const suffix = diagnosticCount ? ` · ${diagnosticCount} Diagnostic${diagnosticCount === 1 ? '' : 's'}` : '';
  return `${inspection.state === 'ready' ? 'Ready' : 'Partial Inspection'}${suffix} · ${formatLabel(inspection.format)} · file data stays in memory only`;
}

function renderStatus(inspection?: Inspection): string {
  const busy = operation.phase !== 'ready';
  return `<div class="inspector-status${busy ? ' is-busy' : ''}" aria-live="polite" aria-atomic="true"><span class="status-dot" aria-hidden="true"></span><span>${operationLabel(inspection)}</span>${busy ? '<button class="status-cancel" type="button" data-cancel-job>Cancel opening</button>' : ''}</div><span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="operation-announcement"></span>`;
}

function renderDiagnostics(inspection: Inspection): string {
  if (!inspection.diagnostics.length) return '';
  const items = inspection.diagnostics.map((diagnostic) => `<li><strong class="diagnostic-severity diagnostic-${diagnostic.severity}">${escapeHtml(diagnostic.severity)}</strong><code>${escapeHtml(diagnostic.code)}</code><span>${escapeHtml(diagnostic.message)}</span><small>${spanLabel(diagnostic.span)}</small></li>`).join('');
  return `<section class="diagnostics" aria-labelledby="diagnostics-heading" data-testid="diagnostics"><div class="diagnostics-heading"><span id="diagnostics-heading">Diagnostics</span><span class="panel-rule" aria-hidden="true"></span></div><ul>${items}</ul></section>`;
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
    const tag = structure.type !== undefined && !PNG_TYPED_CHUNKS.has(structure.type)
      ? 'Unknown chunk'
      : structure.kind === 'payload' ? 'Payload' : structure.kind === 'header' ? 'Header' : 'Structure';
    const content = `<span class="structure-index">${spanLabel(structure.span)}</span><span class="structure-copy"><strong>${escapeHtml(structure.label)}</strong><small>${tag} · ${structure.span.length} bytes</small></span>`;
    const accessibleLabel = `${structure.label}, ${tag}, bytes ${spanLabel(structure.span)}${active ? ', selected' : ''}`;
    return interactive
      ? `<button class="structure-row${active ? ' is-selected' : ''}" type="button" data-structure-id="${escapeHtml(structure.id)}" aria-label="${escapeHtml(accessibleLabel)}" aria-controls="field-inspector selection-summary" aria-pressed="${active}" aria-keyshortcuts="Enter Space ArrowDown ArrowUp">${content}</button>`
      : `<div class="structure-row${active ? ' is-selected' : ''}">${content}</div>`;
  }).join('');
}

function renderLanding(): void {
  mount.innerHTML = `
    <main class="app-shell landing-shell">
      <section class="sheet-frame landing-sheet" aria-labelledby="landing-title" data-drop-target="landing">
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
              ${renderFileIngress()}
            </div>
            <p class="drop-hint" data-testid="drop-hint">Or drop one PNG or WAV file onto this sheet.</p>
            ${renderNotice()}
            <p class="local-note"><span class="lock-mark" aria-hidden="true"><span></span></span><span><strong>100% local.</strong><br />Your files never leave your machine.</span></p>
            ${operation.phase !== 'ready' ? `<p class="landing-operation" role="status" aria-live="polite">${operationLabel()}</p>` : ''}
          </div>

          <div class="sample-plate" aria-labelledby="sample-title">
            <div class="sample-plate-heading"><h2 id="sample-title">Sample: PNG <span>(first 24 bytes)</span></h2><span class="plate-line" aria-hidden="true"></span></div>
            <div class="sample-offsets" aria-hidden="true"><span>Offset</span><span>00</span><span>04</span><span>08</span><span>0C</span><span>14</span><span>18</span></div>
            ${renderByteStrip(sample, sample.structures[0]?.span)}
            <div class="landing-structure-map">${renderStructureLabels(sample, sample.structures[0]?.span)}</div>
            <figure class="source-preview-mini"><figcaption>Source preview · original-file rendering</figcaption><img src="${sourceDataUrl('png')}" alt="A one-pixel PNG Sample rendered as a tiny transparent image" /></figure>
          </div>
        </div>

        <footer class="sheet-footer"><span>Method: <strong>visual byte inspection</strong></span><span>Medium: <strong>hexadecimal</strong></span><span>Tool: <strong>HexLens (local)</strong></span><span class="stamp" aria-label="HexLens sample mark">HL<br />25</span></footer>
      </section>
    </main>
  `;
}

type GridFocusTarget =
  | { kind: 'byte'; offset: number }
  | { kind: 'structure'; id: string }
  | { kind: 'field'; id: string }
  | { kind: 'grid' }
  | { kind: 'enumeration' }
  | { kind: 'offset' };

interface VirtualGridOptions {
  inspection: Inspection;
  selection: ByteSpan;
  enumerateRawBytes: boolean;
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
    this.spacer.style.height = `${rowCount(this.inspection.bytes.length) * GRID_ROW_HEIGHT}px`;
    this.viewport.tabIndex = this.enumerateRawBytes ? -1 : 0;
    this.viewport.setAttribute('aria-label', this.enumerateRawBytes
      ? 'Virtualized byte grid; raw bytes are individually keyboard reachable'
      : 'Virtualized byte grid; raw-byte enumeration is off, use go to offset or arrow keys');
    this.viewport.setAttribute('aria-describedby', 'selection-summary byte-grid-help');
    this.viewport.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Shift');
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
    if (!cell && target !== this.viewport) return;
    const current = cell ? Number(cell.dataset.byteOffset) : this.activeOffset;
    if (!Number.isInteger(current)) return;
    let next = current;
    if (event.key === 'ArrowLeft') next -= 1;
    else if (event.key === 'ArrowRight') next += 1;
    else if (event.key === 'ArrowUp') next -= BYTES_PER_ROW;
    else if (event.key === 'ArrowDown') next += BYTES_PER_ROW;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.inspection.bytes.length - 1;
    else if (cell && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.anchor = current;
      this.activeOffset = current;
      this.onSelect({ offset: current, length: 1 }, { kind: 'byte', offset: current }, this.scrollTop, this.anchor);
      return;
    }
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(this.inspection.bytes.length - 1, next));
    const selection = event.shiftKey ? this.extendSelection(next) : { offset: next, length: 1 };
    if (!event.shiftKey) this.anchor = next;
    this.activeOffset = next;
    this.scrollToOffset(next, false);
    this.onSelect(selection, { kind: cell ? 'byte' : 'grid', ...(cell ? { offset: next } : {}) } as GridFocusTarget, this.scrollTop, this.anchor);
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
    const activeCell = this.rowsRoot.querySelector<HTMLElement>(`[data-byte-offset="${this.activeOffset}"]`);
    if (activeCell) this.viewport.setAttribute('aria-activedescendant', activeCell.id);
    else this.viewport.removeAttribute('aria-activedescendant');
  }

  private renderRow(rowIndex: number): HTMLDivElement {
    const row = getRow(this.inspection.bytes, rowIndex);
    const rowElement = document.createElement('div');
    rowElement.className = 'byte-grid-row';
    rowElement.setAttribute('role', 'row');
    rowElement.setAttribute('aria-rowindex', String(rowIndex + 1));
    rowElement.setAttribute('aria-rowcount', String(rowCount(this.inspection.bytes.length)));
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
      cell.id = `byte-cell-${byteOffset}`;
      cell.tabIndex = this.enumerateRawBytes ? 0 : -1;
      cell.setAttribute('aria-pressed', String(isSelected));
      cell.setAttribute('aria-selected', String(isSelected));
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
  const byteTargetLabel = resolution.field ? 'Field bytes' : resolution.structure ? 'Structure bytes' : 'Selected bytes';
  return `<div class="field-detail" data-testid="field-detail">
      <div class="detail-kicker">Selected ${resolution.field ? 'Field' : 'Structure'}</div>
      <h3>${escapeHtml(selectedLabel)}</h3>
      ${resolution.field ? `<p class="detail-explanation">${escapeHtml(resolution.field.explanation)}</p>` : `<p class="detail-explanation">${escapeHtml(structure?.description ?? 'This Byte span is not claimed by a parsed Structure.')}</p>`}
      <button class="inline-focus" type="button" data-focus-bytes aria-label="Focus ${escapeHtml(byteTargetLabel)} in the byte grid">Focus ${escapeHtml(byteTargetLabel)}</button>
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
    const accessibleLabel = `${field.label}, Field, bytes ${spanLabel(field.span)}${active ? ', selected' : ''}`;
    return `<button class="field-row${active ? ' is-selected' : ''}" type="button" data-field-id="${escapeHtml(field.id)}" aria-label="${escapeHtml(accessibleLabel)}" aria-controls="selection-summary byte-grid" aria-pressed="${active}" aria-keyshortcuts="Enter Space ArrowDown ArrowUp"> <span class="field-label"><strong>${escapeHtml(field.label)}</strong><small>${spanLabel(field.span)} · ${field.span.length} bytes</small></span><span class="field-value">${escapeHtml(formatValue(field.value))}</span></button>`;
  }).join('') ?? '';
  const heading = structure
    ? `<div class="field-structure-heading"><span class="plate-index">${spanLabel(structure.span)}</span><div><strong>${escapeHtml(structure.label)}</strong><small>${escapeHtml(structure.description)}</small></div></div>`
    : '<p class="field-empty">No parsed Structure claims this Selection.</p>';
  return `<div class="field-inspector" id="field-inspector"><div class="panel-heading"><span id="field-inspector-heading">Field inspector</span><span class="panel-rule" aria-hidden="true"></span></div>${heading}<div class="field-list" aria-labelledby="field-inspector-heading">${fields}</div>${renderSemanticDetail(inspection, resolution)}</div>`;
}

function renderInspector(target: InspectionSession, requestedSelection: ByteSpan = initialSelection(target.inspection), focusTarget?: GridFocusTarget, gridScrollTop?: number, selectionAnchor?: number): void {
  const inspection = target.inspection;
  ensurePreview(target);
  const selection = normalizeSelection(requestedSelection, inspection.bytes.length);
  const resolution = resolveSelection(inspection, selection);
  const selectedLabel = resolution.field?.label ?? resolution.structure?.label ?? resolution.unmapped?.label ?? 'Unmapped span';
  const selectedSummary = `Selected ${selectedLabel}, offset ${selection.offset}, length ${selection.length} bytes.`;
  const displayFormat = formatLabel(inspection.format);
  const semanticTarget = resolution.field?.id ?? resolution.structure?.id;
  const semanticTargetKind = resolution.field ? 'field' : resolution.structure ? 'structure' : undefined;
  const focusSemanticAction = semanticTarget && semanticTargetKind
    ? `<button class="inline-focus" type="button" data-focus-semantic="${escapeHtml(semanticTarget)}" data-focus-semantic-kind="${semanticTargetKind}" aria-label="Focus selected ${semanticTargetKind} in the ${semanticTargetKind === 'field' ? 'Field inspector' : 'Structure tree'}">Focus selected ${semanticTargetKind}</button>`
    : '';
  const sourceName = inspection.sourceName || 'Unnamed local file';
  const preview = target.previewUrl && !target.previewFailed
    ? inspection.format === 'wav'
      ? `<audio data-testid="source-preview-media" controls preload="metadata" src="${escapeHtml(target.previewUrl)}" aria-label="The WAV rendered as the original file"></audio>`
      : `<img data-testid="source-preview-media" src="${escapeHtml(target.previewUrl)}" alt="The ${displayFormat} rendered as the original file" />`
    : '<p class="preview-unavailable">Original-file rendering unavailable; the Inspection remains usable.</p>';
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet" aria-labelledby="inspector-title" data-drop-target="inspector">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <header class="inspector-toolbar">
          <a href="/" class="back-link">← Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">${target.kind === 'local' ? 'Local Inspection' : 'Sample Inspection'}</h1></div>
          <div class="file-identity"><strong title="${escapeHtml(sourceName)}" aria-label="${target.kind === 'local' ? `Local filename: ${escapeHtml(sourceName)}` : escapeHtml(sourceName)}">${escapeHtml(sourceName)}</strong><span>${inspection.bytes.length.toLocaleString('en-US')} bytes · ${displayFormat}${target.kind === 'local' ? ' · local' : ''}</span></div>
        </header>
        ${renderStatus(inspection)}
        <div class="inspector-ingress"><div><strong>Open another local file</strong><span>Choose one PNG or WAV file, or drop it anywhere on this workbench.</span></div>${renderFileIngress()}</div>
        ${renderNotice()}
        ${renderDiagnostics(inspection)}

        <div class="inspector-layout">
          <aside class="structure-panel" aria-labelledby="structure-heading"><div class="panel-heading"><span id="structure-heading">Structures</span><span class="panel-rule" aria-hidden="true"></span></div><p class="panel-intro">Named parts in source-file order. Use Enter to select; use the arrow keys to move between Structures.</p><nav class="structure-list" aria-label="${displayFormat} Structures" data-semantic-list="structures">${renderStructureLabels(inspection, selection, true)}</nav><div class="structure-legend"><span class="legend-mark legend-structure" aria-hidden="true"></span><span>Structure boundary</span><span class="legend-mark legend-selection" aria-hidden="true"></span><span>Selected Byte span</span><span class="legend-mark legend-unmapped" aria-hidden="true"></span><span>Unmapped span</span></div></aside>

          <section class="byte-panel" aria-labelledby="bytes-heading"><div class="panel-heading"><span id="bytes-heading">Bytes</span><span class="panel-rule" aria-hidden="true"></span><span class="panel-meta">16 bytes / row · virtualized</span></div><p class="panel-intro" id="byte-grid-help">Select a byte to focus its smallest matching Field. Shift-select or use arrow keys to extend the exact Selection. Raw-byte tab enumeration is optional.</p>
            <form class="goto-form" data-testid="goto-form"><label for="goto-offset">Go to offset</label><select id="goto-mode" aria-label="Offset notation"><option value="hex">Hexadecimal</option><option value="decimal">Decimal (explicit)</option></select><input id="goto-offset" data-testid="offset-input" name="offset" inputmode="text" autocomplete="off" placeholder="e.g. 0030" aria-describedby="offset-help offset-error" /><button class="button button-secondary" type="submit">Go</button><span id="offset-help" class="sr-only">Hexadecimal is the default. Choose Decimal explicitly for base ten.</span></form><p class="offset-error" id="offset-error" data-testid="offset-error" role="alert" hidden></p>
            <div class="byte-accessibility"><label class="byte-enumeration"><input type="checkbox" data-testid="enumerate-bytes" ${enumerateRawBytes ? 'checked' : ''} /><span>Enumerate raw bytes with Tab</span></label><span id="raw-byte-help">Off by default; use Go to offset or the focused byte grid for compact navigation.</span></div>
            <div class="byte-grid" id="byte-grid" data-testid="byte-grid"><div class="byte-grid-header" aria-hidden="true"><span>Offset</span><span>Hex bytes</span><span>ASCII</span></div><div class="byte-grid-viewport" data-grid-viewport role="grid"><div class="byte-grid-spacer" data-grid-spacer></div><div class="byte-grid-rows" data-grid-rows></div></div></div>
            <div class="selection-summary" id="selection-summary" data-testid="selection-summary" role="region" aria-labelledby="selection-summary-heading"><span class="summary-mark" aria-hidden="true"></span><span><span id="selection-summary-heading" class="sr-only">Selected span summary</span>${escapeHtml(selectedSummary)} <span class="summary-secondary">hex ${formatOffset(selection.offset, inspection.bytes.length)}–${formatOffset(Math.max(selection.offset, selection.offset + selection.length - 1), inspection.bytes.length)} · decimal ${formatDecimalOffset(selection.offset)}</span></span><button class="inline-copy" type="button" data-copy-kind="selection">Copy selected bytes</button>${focusSemanticAction}</div><div class="selection-announcement sr-only" aria-live="polite" aria-atomic="true" data-testid="selection-announcement"></div><div class="ascii-note"><span class="mono">·</span> non-printable bytes use the <span class="mono">·</span> marker; each byte has an accessible value label</div><div class="copy-feedback" data-testid="copy-feedback" role="status" aria-live="polite"></div>
          </section>

          <aside class="field-panel" aria-labelledby="field-heading">${renderFieldInspector(inspection, resolution)}<figure class="source-preview" data-testid="source-preview"><figcaption id="field-heading">Source preview <span>· original-file rendering</span></figcaption>${preview}</figure></aside>
        </div>
        <footer class="sheet-footer inspector-footer"><span>Inspection: <strong>${target.kind === 'local' ? `Local ${displayFormat}` : `${displayFormat} Sample`}</strong></span><span>Source preview is not parsed output.</span><span class="footer-local">Local only · no telemetry</span></footer>
      </section>
    </main>
  `;

  const viewport = mount.querySelector<HTMLDivElement>('[data-grid-viewport]');
  if (!viewport) return;
  const grid = new VirtualByteGrid(viewport, {
    inspection,
    selection,
    enumerateRawBytes,
    anchor: selectionAnchor,
    scrollTop: gridScrollTop,
    onSelect: (nextSelection, nextFocus, scrollTop, anchor) => renderInspector(target, nextSelection, nextFocus, scrollTop, anchor),
  });

  mount.querySelectorAll<HTMLElement>('[data-structure-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.structureId;
      const next = inspection.structures.find((item) => item.id === id);
      if (next) renderInspector(target, next.span, { kind: 'structure', id: next.id });
    });
    element.addEventListener('keydown', (event) => {
      const row = event.currentTarget as HTMLElement;
      const rows = Array.from(mount.querySelectorAll<HTMLElement>('[data-structure-id]'));
      if (event.key === 'ArrowRight') {
        const next = inspection.structures.find((item) => item.id === row.dataset.structureId);
        if (next) {
          event.preventDefault();
          grid.scrollToOffset(next.span.offset);
        }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = rows.indexOf(row);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[nextIndex]?.focus();
    });
  });
  mount.querySelectorAll<HTMLElement>('.field-row[data-field-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.fieldId;
      const next = inspection.structures.flatMap((item) => item.fields).find((item) => item.id === id);
      if (next) renderInspector(target, next.span, { kind: 'field', id: next.id });
    });
    element.addEventListener('keydown', (event) => {
      const row = event.currentTarget as HTMLElement;
      const rows = Array.from(mount.querySelectorAll<HTMLElement>('.field-row[data-field-id]'));
      if (event.key === 'ArrowRight') {
        const next = inspection.structures.flatMap((item) => item.fields).find((item) => item.id === row.dataset.fieldId);
        if (next) {
          event.preventDefault();
          grid.scrollToOffset(next.span.offset);
        }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = rows.indexOf(row);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[nextIndex]?.focus();
    });
  });

  mount.querySelector<HTMLButtonElement>('[data-focus-bytes]')?.addEventListener('click', () => {
    grid.scrollToOffset(selection.offset);
  });
  mount.querySelector<HTMLButtonElement>('[data-focus-semantic]')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const id = button.dataset.focusSemantic;
    if (!id) return;
    const kind = button.dataset.focusSemanticKind;
    const semantic = kind === 'field'
      ? mount.querySelector<HTMLElement>(`.field-row[data-field-id="${CSS.escape(id)}"]`)
      : mount.querySelector<HTMLElement>(`[data-structure-id="${CSS.escape(id)}"]`);
    semantic?.focus({ preventScroll: true });
  });

  mount.querySelector<HTMLInputElement>('[data-testid="enumerate-bytes"]')?.addEventListener('change', (event) => {
    enumerateRawBytes = (event.currentTarget as HTMLInputElement).checked;
    renderInspector(target, selection, { kind: 'enumeration' }, grid.scrollTop, selectionAnchor ?? selection.offset);
  });

  const previewImage = mount.querySelector<HTMLImageElement>('.source-preview img');
  previewImage?.addEventListener('error', () => {
    if (target.previewFailed) return;
    target.previewFailed = true;
    revokePreview(target);
    renderInspector(target, selection);
  }, { once: true });

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
      else if (focusTarget.kind === 'field') target = mount.querySelector<HTMLElement>(`.field-row[data-field-id="${CSS.escape(focusTarget.id)}"]`) ?? undefined;
      else if (focusTarget.kind === 'grid') target = mount.querySelector<HTMLElement>('[data-grid-viewport]') ?? undefined;
      else if (focusTarget.kind === 'enumeration') target = mount.querySelector<HTMLElement>('[data-testid="enumerate-bytes"]') ?? undefined;
      else if (focusTarget.kind === 'offset') target = mount.querySelector<HTMLElement>('#goto-offset') ?? undefined;
      target?.focus({ preventScroll: true });
    });
  }
  queueSelectionAnnouncement(selectedSummary);
}

mount.addEventListener('change', (event) => {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (input?.matches('[data-testid="local-file-input"]')) handlePickerChange(input);
});

mount.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest('[data-cancel-job]') : null;
  if (target) cancelFileJob();
});

mount.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer) return;
  event.preventDefault();
  dragDepth += 1;
  mount.classList.add('is-drag-active');
});

mount.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});

mount.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) mount.classList.remove('is-drag-active');
});

mount.addEventListener('drop', handleDrop);

function renderRoute(): void {
  view = currentView();
  if (view === 'landing') {
    fileJobs.cancel();
    operation = { phase: 'ready', origin: 'landing' };
    render();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('sample') === 'png' || params.get('sample') === 'wav') {
    fileJobs.cancel();
    revokePreview(session);
    session = sampleSession(params.get('sample') === 'wav' ? wavSample : sample);
    operation = { phase: 'ready', origin: 'inspect' };
  }
  render();
}

window.addEventListener('popstate', renderRoute);
window.addEventListener('beforeunload', () => revokePreview(session));
renderRoute();
