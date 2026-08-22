import './styles.css';
import type { ByteSpan, Field, Inspection, Structure } from './domain/inspection.ts';
import { spanContains, spanIntersects, spanLabel } from './domain/inspection.ts';
import { hasPngSignature, inspectPng } from './format.ts';
import { FileJobController, type FileJobParseResult } from './file-session.ts';
import { sampleInspection, PNG_SAMPLE_BASE64 } from './sample.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('HexLens mount point is missing.');
const mount = app;

const sample = sampleInspection();
const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;

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
}

const currentView = (): View => window.location.pathname === '/inspect' ? 'inspect' : 'landing';
let view: View = currentView();
let session: InspectionSession | null = null;
let selection: ByteSpan = { offset: 0, length: 8 };
let operation: OperationState = { phase: 'ready', origin: view };
let dragDepth = 0;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function hexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

function sourceDataUrl(): string {
  return `data:image/png;base64,${PNG_SAMPLE_BASE64}`;
}

function sampleSession(): InspectionSession {
  return { kind: 'sample', inspection: sample, previewUrl: sourceDataUrl() };
}

function revokePreview(target: InspectionSession | null): void {
  if (target?.kind === 'local' && target.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(target.previewUrl);
    target.previewUrl = undefined;
  }
}

function ensurePreview(target: InspectionSession): void {
  if (target.kind !== 'local' || target.previewUrl || typeof URL.createObjectURL !== 'function') return;
  const copy = new Uint8Array(target.inspection.bytes);
  target.previewUrl = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' }));
}

function selectedStructure(inspection: Inspection, selected: ByteSpan): Structure {
  const containing = inspection.structures.filter((structure) => spanContains(structure.span, selected));
  return [...containing].sort((a, b) => a.span.length - b.span.length)[0] ?? inspection.structures[0];
}

function selectedField(structure: Structure | undefined, selected: ByteSpan): Field | undefined {
  if (!structure) return undefined;
  const containing = structure.fields.filter((field) => spanContains(field.span, selected));
  return [...containing].sort((a, b) => a.span.length - b.span.length)[0];
}

function renderByteStrip(inspection: Inspection, selected?: ByteSpan, interactive = false): string {
  const visibleBytes = interactive ? inspection.bytes : inspection.bytes.slice(0, 24);
  const limitNote = interactive && inspection.bytes.length > 48 ? '' : interactive ? '' : '<span class="plate-caption">first 24 bytes</span>';
  const rows: string[] = [];
  for (let start = 0; start < visibleBytes.length; start += 16) {
    const rowEnd = Math.min(start + 16, visibleBytes.length);
    const selectedStart = selected ? Math.max(start, selected.offset) : start;
    const selectedEnd = selected ? Math.min(rowEnd, selected.offset + selected.length) : start;
    const selectedLength = Math.max(0, selectedEnd - selectedStart);
    const bracket = selectedLength > 0
      ? `<span class="span-bracket" style="--selection-start: ${selectedStart - start}; --selection-length: ${selectedLength}" aria-hidden="true"></span>`
      : '';
    const bytes = Array.from(visibleBytes.slice(start, start + 16), (value, index) => {
      const offset = start + index;
      const isSelected = selected ? offset >= selected.offset && offset < selected.offset + selected.length : false;
      const label = `${hexByte(value)} at offset ${offset.toString(16).toUpperCase().padStart(2, '0')}`;
      return interactive
        ? `<button class="byte-cell${isSelected ? ' is-selected' : ''}" type="button" data-byte-offset="${offset}" aria-label="${label}" aria-pressed="${isSelected}">${hexByte(value)}</button>`
        : `<span class="byte-cell${isSelected ? ' is-selected' : ''}" aria-label="${label}">${hexByte(value)}</span>`;
    }).join('');
    rows.push(`<div class="byte-row"><span class="byte-offset">${start.toString(16).toUpperCase().padStart(4, '0')}</span><div class="byte-cells${selectedLength > 0 ? ' has-selection' : ''}">${bracket}${bytes}</div><span class="ascii-gutter">${Array.from(visibleBytes.slice(start, start + 16), (value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : '·').join('')}</span></div>`);
  }
  return `<div class="byte-strip" data-testid="byte-strip">${rows.join('')}</div>${limitNote}`;
}

function renderStructureLabels(inspection: Inspection, selected?: ByteSpan, interactive = false): string {
  return inspection.structures.map((structure) => {
    const active = selected ? spanIntersects(structure.span, selected) : false;
    const tag = structure.kind === 'payload' ? 'Payload' : structure.kind === 'header' ? 'Header' : 'Chunk';
    const content = `<span class="structure-index">${spanLabel(structure.span)}</span><span class="structure-copy"><strong>${escapeHtml(structure.label)}</strong><small>${tag} · ${structure.span.length} bytes</small></span>`;
    return interactive
      ? `<button class="structure-row${active ? ' is-selected' : ''}" type="button" data-structure-id="${escapeHtml(structure.id)}" aria-pressed="${active}">${content}</button>`
      : `<div class="structure-row${active ? ' is-selected' : ''}">${content}</div>`;
  }).join('');
}

function renderFileIngress(): string {
  return `<div class="file-ingress" data-testid="file-ingress"><label class="button button-secondary file-picker"><span>Open a local PNG</span><input class="file-picker-input" type="file" accept=".png,image/png" aria-label="Choose one local PNG file" data-testid="local-file-input" /></label><span class="file-ingress-note">One file · stays in memory only</span></div>`;
}

function renderNotice(): string {
  if (!operation.notice) return '';
  return `<p class="file-feedback file-feedback-${operation.notice.kind}" data-testid="file-feedback" role="${operation.notice.kind === 'error' ? 'alert' : 'status'}">${escapeHtml(operation.notice.message)}</p>`;
}

function operationLabel(inspection?: Inspection): string {
  if (operation.phase === 'reading') return 'Reading local file…';
  if (operation.phase === 'parsing') return 'Parsing PNG locally…';
  if (!inspection) return 'Ready for one local PNG file';
  const diagnosticCount = inspection.diagnostics.length;
  const suffix = diagnosticCount ? ` · ${diagnosticCount} Diagnostic${diagnosticCount === 1 ? '' : 's'}` : '';
  return `${inspection.state === 'ready' ? 'Ready' : 'Partial Inspection'}${suffix} · file data stays in memory only`;
}

function renderStatus(inspection?: Inspection): string {
  const busy = operation.phase !== 'ready';
  return `<div class="inspector-status${busy ? ' is-busy' : ''}" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span>${operationLabel(inspection)}</span>${busy ? '<button class="status-cancel" type="button" data-cancel-job>Cancel opening</button>' : ''}</div>`;
}

function renderDiagnostics(inspection: Inspection): string {
  if (!inspection.diagnostics.length) return '';
  const items = inspection.diagnostics.map((diagnostic) => `<li><code>${escapeHtml(diagnostic.code)}</code><span>${escapeHtml(diagnostic.message)}</span><small>${spanLabel(diagnostic.span)}</small></li>`).join('');
  return `<section class="diagnostics" aria-labelledby="diagnostics-heading" data-testid="diagnostics"><div class="diagnostics-heading"><span id="diagnostics-heading">Diagnostics</span><span class="panel-rule" aria-hidden="true"></span></div><ul>${items}</ul></section>`;
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
            <p class="drop-hint" data-testid="drop-hint">Or drop one PNG file onto this sheet.</p>
            ${renderNotice()}
            <p class="local-note"><span class="lock-mark" aria-hidden="true"><span></span></span><span><strong>100% local.</strong><br />Your files never leave your machine.</span></p>
            ${operation.phase !== 'ready' ? `<p class="landing-operation" role="status" aria-live="polite">${operationLabel()}</p>` : ''}
          </div>

          <div class="sample-plate" aria-labelledby="sample-title">
            <div class="sample-plate-heading"><h2 id="sample-title">Sample: PNG <span>(first 24 bytes)</span></h2><span class="plate-line" aria-hidden="true"></span></div>
            <div class="sample-offsets" aria-hidden="true"><span>Offset</span><span>00</span><span>04</span><span>08</span><span>0C</span><span>14</span><span>18</span></div>
            ${renderByteStrip(sample, sample.structures[0]?.span)}
            <div class="landing-structure-map">${renderStructureLabels(sample, sample.structures[0]?.span)}</div>
            <figure class="source-preview-mini"><figcaption>Source preview · original-file rendering</figcaption><img src="${sourceDataUrl()}" alt="A one-pixel PNG Sample rendered as a tiny transparent image" /></figure>
          </div>
        </div>

        <footer class="sheet-footer"><span>Method: <strong>visual byte inspection</strong></span><span>Medium: <strong>hexadecimal</strong></span><span>Tool: <strong>HexLens (local)</strong></span><span class="stamp" aria-label="HexLens sample mark">HL<br />25</span></footer>
      </section>
    </main>
  `;
}

function renderFieldInspector(structure: Structure | undefined, selected: ByteSpan): string {
  if (!structure) return '<div class="field-inspector"><p class="field-empty">No parsed Structures are available for this Inspection.</p></div>';
  const focused = selectedField(structure, selected) ?? (selected.offset === structure.span.offset && selected.length === structure.span.length
    ? structure.fields.find((item) => item.name === 'width') ?? structure.fields[0]
    : undefined);
  const fields = structure.fields.map((field) => {
    const active = focused?.id === field.id;
    return `<button class="field-row${active ? ' is-selected' : ''}" type="button" data-field-id="${escapeHtml(field.id)}" aria-pressed="${active}"><span class="field-label"><strong>${escapeHtml(field.label)}</strong><small>${spanLabel(field.span)} · ${field.span.length} bytes</small></span><span class="field-value">${escapeHtml(formatValue(field.value))}</span></button>`;
  }).join('');
  const detail = focused ? `
      <div class="field-detail" data-testid="field-detail">
        <div class="detail-kicker">Selected Field</div>
        <h3>${escapeHtml(focused.label)}</h3>
        <p class="detail-explanation">${escapeHtml(focused.explanation)}</p>
        <dl class="field-facts">
          <div><dt>Byte span</dt><dd>${spanLabel(focused.span)} <span>(${focused.span.offset}, ${focused.span.length} bytes)</span></dd></div>
          <div><dt>Encoded</dt><dd class="mono">${focused.encodedBytes.map(hexByte).join(' ')}</dd></div>
          <div><dt>Interpreted</dt><dd>${escapeHtml(formatValue(focused.value))}</dd></div>
          <div><dt>Representation</dt><dd>${escapeHtml(focused.representation)}${focused.endianness && focused.endianness !== 'n/a' ? ` · ${focused.endianness}` : ''}</dd></div>
        </dl>
      </div>
    ` : '<p class="field-empty">Select a Field or byte to see its details.</p>';
  return `<div class="field-inspector"><div class="panel-heading"><span>Field inspector</span><span class="panel-rule" aria-hidden="true"></span></div><div class="field-structure-heading"><span class="plate-index">${spanLabel(structure.span)}</span><div><strong>${escapeHtml(structure.label)}</strong><small>${escapeHtml(structure.description)}</small></div></div><div class="field-list">${fields}</div>${detail}</div>`;
}

function renderInspector(target: InspectionSession): void {
  const inspection = target.inspection;
  ensurePreview(target);
  const structure = selectedStructure(inspection, selection);
  const field = selectedField(structure, selection);
  const selectedLabel = field ? field.label : structure?.label ?? 'Inspection';
  const selectedSummary = `Selected ${selectedLabel}, offset ${selection.offset}, length ${selection.length} bytes.`;
  const sourceName = inspection.sourceName || 'Unnamed local file';
  const identity = target.kind === 'local'
    ? `<strong class="file-name" title="${escapeHtml(sourceName)}" aria-label="Local filename: ${escapeHtml(sourceName)}">${escapeHtml(sourceName)}</strong>`
    : '<strong>hexlens-sample.png</strong>';
  const preview = target.previewUrl
    ? `<img src="${escapeHtml(target.previewUrl)}" alt="The local PNG rendered as the original file" />`
    : '<p class="preview-unavailable">Original-file rendering unavailable; the Inspection remains usable.</p>';
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet" aria-labelledby="inspector-title" data-drop-target="inspector">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <header class="inspector-toolbar">
          <a href="/" class="back-link">← Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">${target.kind === 'local' ? 'Local Inspection' : 'Sample Inspection'}</h1></div>
          <div class="file-identity">${identity}<span>${inspection.bytes.length.toLocaleString('en-US')} bytes · PNG${target.kind === 'local' ? ' · local' : ''}</span></div>
        </header>
        ${renderStatus(inspection)}
        <div class="inspector-ingress"><div><strong>Open another local PNG</strong><span>Choose one file or drop it anywhere on this workbench.</span></div>${renderFileIngress()}</div>
        ${renderNotice()}
        ${renderDiagnostics(inspection)}

        <div class="inspector-layout">
          <aside class="structure-panel" aria-labelledby="structure-heading"><div class="panel-heading"><span id="structure-heading">Structures</span><span class="panel-rule" aria-hidden="true"></span></div><p class="panel-intro">The PNG's named parts, in source order.</p><nav class="structure-list" aria-label="PNG Structures">${renderStructureLabels(inspection, selection, true)}</nav><div class="structure-legend"><span class="legend-mark legend-structure" aria-hidden="true"></span><span>Structure span</span><span class="legend-mark legend-selection" aria-hidden="true"></span><span>Selected span</span></div></aside>

          <section class="byte-panel" aria-labelledby="bytes-heading"><div class="panel-heading"><span id="bytes-heading">Bytes</span><span class="panel-rule" aria-hidden="true"></span><span class="panel-meta">16 bytes / row</span></div><p class="panel-intro">Select a byte to focus the smallest matching Field.</p>${renderByteStrip(inspection, selection, true)}<div class="selection-summary" data-testid="selection-summary"><span class="summary-mark" aria-hidden="true"></span><span>${escapeHtml(selectedSummary)}</span></div><div class="ascii-note"><span class="mono">·</span> non-printable byte <span class="mono">·</span> printable ASCII appears at right</div></section>

          <aside class="field-panel" aria-labelledby="field-heading">${renderFieldInspector(structure, selection)}<figure class="source-preview"><figcaption id="field-heading">Source preview <span>· original-file rendering</span></figcaption>${preview}</figure></aside>
        </div>
        <footer class="sheet-footer inspector-footer"><span>Inspection: <strong>${target.kind === 'local' ? 'Local PNG' : 'PNG Sample'}</strong></span><span>Source preview is not parsed output.</span><span class="footer-local">Local only · no telemetry</span></footer>
      </section>
    </main>
  `;

  mount.querySelectorAll<HTMLElement>('[data-structure-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.structureId;
      const next = inspection.structures.find((item) => item.id === id);
      if (next) {
        selection = next.span;
        renderInspector(target);
      }
    });
  });
  mount.querySelectorAll<HTMLElement>('[data-byte-offset]').forEach((element) => {
    element.addEventListener('click', () => {
      const offset = Number(element.dataset.byteOffset);
      if (Number.isInteger(offset)) {
        selection = { offset, length: 1 };
        renderInspector(target);
      }
    });
  });
  mount.querySelectorAll<HTMLElement>('[data-field-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.fieldId;
      const next = structure?.fields.find((item) => item.id === id);
      if (next) {
        selection = next.span;
        renderInspector(target);
      }
    });
  });
}

function renderEmptyInspector(): void {
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet empty-inspector" aria-labelledby="inspector-title" data-drop-target="inspector">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <header class="inspector-toolbar">
          <a href="/" class="back-link">← Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">Open an Inspection</h1></div>
          <div class="file-identity"><strong>No file selected</strong><span>Local PNG only</span></div>
        </header>
        ${renderStatus()}
        <div class="empty-inspector-content"><span class="plate-mark">One file, one Inspection</span><h2>Bring a PNG to the workbench.</h2><p>Choose one local PNG or drop it here. HexLens checks the bytes on this device and keeps the current file in memory only.</p>${renderFileIngress()}<p class="drop-hint">Drop one PNG file · directories and multiple files are not accepted.</p>${renderNotice()}</div>
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
}

function rejectionMessage(code: 'unsupported_format' | 'limit_reached' | 'invalid_input'): string {
  if (code === 'limit_reached') return 'That file is larger than the local safety limit. Choose a PNG under 25 MiB; your current Inspection is still open.';
  if (code === 'unsupported_format') return 'This file does not have a PNG signature. Choose a PNG file or try the Sample; your current Inspection is still open.';
  return 'That input could not be opened. Choose one PNG file; your current Inspection is still open.';
}

type LocalParseResult = FileJobParseResult<Inspection>;

const fileJobs = new FileJobController<Inspection>(undefined, async (bytes, file): Promise<LocalParseResult> => {
  if (!hasPngSignature(bytes)) return { accepted: false, rejection: { code: 'unsupported_format' } };
  return { accepted: true, value: inspectPng(bytes, file.name, { mimeType: file.type }) };
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
      selection = { offset: 0, length: Math.min(8, inspection.bytes.length) };
      view = 'inspect';
      if (origin === 'landing') window.history.pushState(null, '', '/inspect');
      else window.history.replaceState(null, '', '/inspect');
      operation = { phase: 'ready', origin: 'inspect', notice: { kind: 'success', message: `Opened ${acceptedFile.type === 'image/png' ? 'a local PNG' : 'a local file as PNG'}. File data remains in memory only.` } };
      render();
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

  // start() invokes its first phase synchronously. The assignment keeps the
  // id available for diagnostics and makes the lifecycle explicit to readers.
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
    setNotice('error', 'Folders are not supported. Drop one PNG file; your current Inspection is still open.');
    return;
  }
  if (selectionFromDrop.kind === 'multiple') {
    setNotice('error', 'Choose one file at a time. Your current Inspection is still open.');
    return;
  }
  if (selectionFromDrop.kind !== 'file' || !selectionFromDrop.file) {
    setNotice('error', 'Drop one PNG file. Your current Inspection is still open.');
    return;
  }
  startFileJob(selectionFromDrop.file, view);
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
  if (params.get('sample') === 'png') {
    fileJobs.cancel();
    revokePreview(session);
    session = sampleSession();
    selection = { offset: 0, length: 8 };
    operation = { phase: 'ready', origin: 'inspect' };
  }
  render();
}

window.addEventListener('popstate', renderRoute);
window.addEventListener('beforeunload', () => revokePreview(session));
renderRoute();
