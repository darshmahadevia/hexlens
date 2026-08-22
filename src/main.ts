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
import { spanLabel } from './domain/inspection.ts';
import { createRawInspection, INSPECTION_LIMITS } from './format.ts';
import { LocalFileFlow } from './local-file-flow.ts';
import { renderFieldInspector } from './field-inspector.ts';
import { renderStructureTree } from './structure-tree.ts';
import { createRouter, type View } from './routing.ts';
import { VirtualByteGrid, type GridFocusTarget } from './byte-grid-view.ts';
import { activateNarrowTab, renderNarrowTabs, type NarrowTab } from './narrow-navigation.ts';
import { renderLanding } from './landing-view.ts';
import { lessonFor } from './inspection-lesson.ts';
import { arrowIcon } from './icons.ts';
import { sampleInspection, PNG_SAMPLE_BASE64, wavSampleInspection, WAV_SAMPLE_BASE64 } from './sample.ts';
import { initializeTheme, renderThemeToggle, toggleTheme } from './theme.ts';

initializeTheme();

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('HexLens mount point is missing.');
const mount = app;

const sample = sampleInspection();
const wavSample = wavSampleInspection();
const GRID_ROW_HEIGHT = 48;
const GRID_OVERSCAN = 5;
const MAX_LOCAL_FILE_BYTES = INSPECTION_LIMITS.maxBytes;
const SELECTION_ANNOUNCEMENT_DELAY = 180;

type SessionKind = 'sample' | 'local';
type NoticeKind = 'info' | 'success' | 'error';
type InspectorPanel = 'map' | 'info';

interface Notice {
  kind: NoticeKind;
  message: string;
}

interface OperationState {
  phase: 'ready' | 'reading' | 'parsing' | 'slow' | 'aborted' | 'unsupported' | 'limit-reached' | 'application-error';
  origin: View;
  notice?: Notice;
  jobId?: number;
}

interface InspectionSession {
  kind: SessionKind;
  inspection: Inspection;
  previewUrl?: string;
  previewFailed?: boolean;
  selection?: ByteSpan;
  narrowTab?: NarrowTab;
  inspectorPanel?: InspectorPanel;
}

const router = createRouter(import.meta.env.BASE_URL);
let view: View = router.currentView();
let session: InspectionSession | null = null;
let operation: OperationState = { phase: 'ready', origin: view };
let dragDepth = 0;
let enumerateRawBytes = false;
let landingSelection: ByteSpan = initialSelection(sample);
const landingViewOptions = {
  mount,
  sample,
  getSelection: () => landingSelection,
  setSelection: (selection: ByteSpan) => { landingSelection = selection; },
  isNarrow: isNarrowViewport,
  routeHref: router.href,
  renderFileIngress: (disabled?: boolean) => renderFileIngress(disabled),
  renderNotice: () => renderNotice(),
  operationPhase: () => operation.phase,
  operationLabel: () => operationLabel(),
  sourceDataUrl,
};
let selectionAnnouncementTimer: ReturnType<typeof setTimeout> | undefined;
let selectionAnnouncementSequence = 0;
let lastNarrowViewport = isNarrowViewport();
let lastSelectionMotionKey: string | undefined;

function isNarrowViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 620px)').matches;
}

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
  if (format === 'wav') return 'WAV';
  if (format === 'png') return 'PNG';
  return 'raw-byte Inspection';
}

function sourceDataUrl(format: FormatId): string {
  return format === 'wav'
    ? `data:audio/wav;base64,${WAV_SAMPLE_BASE64}`
    : format === 'png' ? `data:image/png;base64,${PNG_SAMPLE_BASE64}` : '';
}

function byteGridHeightStyle(inspection: Inspection): string {
  const visibleRows = Math.min(rowCount(inspection.bytes.length), 8);
  const height = Math.max(visibleRows * GRID_ROW_HEIGHT, GRID_ROW_HEIGHT);
  return `style="--byte-grid-height: ${height}px"`;
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
  const narrow = isNarrowViewport();
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet empty-inspector" aria-labelledby="inspector-title" data-drop-target="inspector">
        <header class="inspector-toolbar" aria-label="Inspection toolbar">
          <a href="${router.href('/')}" class="back-link">${arrowIcon('left')}Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">Open an Inspection</h1></div>
          <div class="file-identity"><strong>No file selected</strong><span>${narrow ? 'Bundled PNG or WAV Sample' : 'Local PNG or WAV'}</span></div>
          ${renderThemeToggle()}
        </header>
        ${renderStatus()}
        <div class="empty-inspector-content">
          <div class="empty-inspector-copy"><h2>${narrow ? 'Choose a Sample to begin.' : 'Bring a PNG or WAV into focus.'}</h2><p>${narrow ? 'Phone view is reserved for the bundled PNG and WAV Samples. Choose one to explore its Structures, bytes, and Fields.' : 'Choose one local PNG or WAV, or drop it here. HexLens checks the bytes on this device and keeps the current file in memory only.'}</p>${narrow ? '' : `${renderFileIngress()}<p class="drop-hint">Drop one PNG or WAV file · directories and multiple files are not accepted.</p>`}</div>
          <aside class="empty-sample-path" aria-labelledby="sample-path-heading"><span>Bundled source files</span><h3 id="sample-path-heading">Trace a known Sample first.</h3><p>Follow a PNG chunk or WAV header from its Structure to the exact bytes and decoded Fields.</p><div class="sample-links" aria-label="Sample files"><a class="button button-primary" href="${router.href('/inspect?sample=png')}">Open PNG Sample</a><a class="button button-secondary" href="${router.href('/inspect?sample=wav')}">Open WAV Sample</a></div></aside>
          ${renderNotice()}
        </div>
      </section>
    </main>
  `;
}

function render(): void {
  if (view === 'landing') {
    if (session?.kind === 'local') revokePreview(session);
    lastSelectionMotionKey = undefined;
    renderLanding(landingViewOptions);
    return;
  }
  if (session) renderInspector(session);
  else {
    lastSelectionMotionKey = undefined;
    renderEmptyInspector();
  }
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

const fileFlow = new LocalFileFlow();

function startFileJob(file: File, origin: View): void {
  if (isNarrowViewport()) return;

  operation = { phase: 'reading', origin };
  const jobId = fileFlow.start(file, origin, {
    onOversize: (callbackOrigin) => {
      setNotice('error', rejectionMessage('limit_reached'), callbackOrigin);
    },
    onPhase: (phase, callbackJobId, callbackOrigin) => {
      if (!fileFlow.isActive(callbackJobId)) return;
      operation = { phase, origin: callbackOrigin, jobId: callbackJobId };
      render();
    },
    onSlow: (callbackJobId, callbackOrigin) => {
      if (!fileFlow.isActive(callbackJobId)) return;
      operation = { phase: 'slow', origin: callbackOrigin, jobId: callbackJobId };
      render();
      publishImmediateAnnouncement(`Local opening is taking longer than ${LocalFileFlow.limits.slowNoticeMs / 1000} seconds. Abort remains available.`);
    },
    onAborted: (callbackJobId, callbackOrigin) => {
      operation = { phase: 'aborted', origin: callbackOrigin, jobId: callbackJobId, notice: { kind: 'info', message: 'Opening was aborted. Your current Inspection is still open.' } };
      render();
      publishImmediateAnnouncement('Opening was aborted. Your current Inspection is still open.');
    },
    onTerminated: (callbackJobId, callbackOrigin) => {
      if (operation.jobId !== callbackJobId || operation.phase !== 'aborted') return;
      operation = { phase: 'ready', origin: callbackOrigin, notice: { kind: 'info', message: 'The local parser did not stop immediately; its stale result was discarded safely.' } };
      render();
      publishImmediateAnnouncement('The local parser did not stop immediately; its stale result was discarded safely.');
    },
    onAccepted: (inspection, acceptedFile, callbackJobId, callbackOrigin) => {
      if (!fileFlow.isActive(callbackJobId)) return;
      const previous = session;
      session = { kind: 'local', inspection, previewUrl: undefined };
      ensurePreview(session);
      view = 'inspect';
      if (callbackOrigin === 'landing') window.history.pushState(null, '', router.href('/inspect'));
      else window.history.replaceState(null, '', router.href('/inspect'));
      const status = inspection.status ?? (inspection.state === 'ready' ? 'ready' : 'partial');
      const message = status === 'unsupported'
        ? inspection.diagnostics[0]?.message ?? 'The file does not match a supported Format. Raw bytes remain available without semantic parsing.'
        : status === 'limit-reached'
          ? 'The local safety limit stopped parsing. The Inspection is explicitly incomplete.'
          : status === 'aborted'
            ? 'Opening was aborted before semantic output was complete.'
            : `Opened a local ${formatLabel(inspection.format)}. File data remains in memory only.`;
      operation = { phase: 'ready', origin: 'inspect', jobId: callbackJobId, notice: { kind: status === 'ready' ? 'success' : status === 'unsupported' ? 'error' : 'info', message } };
      render();
      publishImmediateAnnouncement(message);
      revokePreview(previous);
    },
    onRejected: (rejection, _rejectedFile, callbackJobId, callbackOrigin) => {
      if (!fileFlow.isActive(callbackJobId)) return;
      const message = rejection.code === 'unsupported_format'
        ? 'Unsupported Format. The file does not have a PNG signature or RIFF/WAVE signature; your current Inspection is still open.'
        : rejectionMessage(rejection.code);
      operation = {
        phase: rejection.code === 'unsupported_format' ? 'unsupported' : 'limit-reached',
        origin: callbackOrigin,
        jobId: callbackJobId,
        notice: { kind: 'error', message },
      };
      render();
      publishImmediateAnnouncement(message);
    },
    onError: (callbackJobId, failedFile, failedBytes, callbackOrigin) => {
      if (!fileFlow.isActive(callbackJobId)) return;
      if (failedBytes && failedBytes.length <= MAX_LOCAL_FILE_BYTES && failedFile) {
        const previous = session;
        session = {
          kind: 'local',
          inspection: createRawInspection(failedBytes, failedFile.name, 'application-error'),
          previewUrl: undefined,
        };
        view = 'inspect';
        if (callbackOrigin === 'landing') window.history.pushState(null, '', router.href('/inspect'));
        else window.history.replaceState(null, '', router.href('/inspect'));
        operation = { phase: 'ready', origin: 'inspect', jobId: callbackJobId, notice: { kind: 'error', message: 'The application could not complete semantic parsing. The raw-byte fallback is bounded; no semantic output was published.' } };
        render();
        publishImmediateAnnouncement('The application could not complete semantic parsing. The raw-byte fallback is bounded; no semantic output was published.');
        revokePreview(previous);
      } else {
        operation = { phase: 'application-error', origin: callbackOrigin, jobId: callbackJobId, notice: { kind: 'error', message: 'The application could not complete parsing. Semantic output was discarded and no raw-byte fallback was retained.' } };
        render();
        publishImmediateAnnouncement('The application could not complete parsing. Semantic output was discarded and no raw-byte fallback was retained.');
      }
    },
  });

  void jobId;
}

function cancelFileJob(): void {
  const canceled = fileFlow.cancel();
  if (canceled === undefined) return;
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
  if (isNarrowViewport()) return;
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
  if (target.inspection.format !== 'png' && target.inspection.format !== 'wav') {
    target.previewFailed = true;
    return;
  }
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

function renderFileIngress(disabled = false, compact = false): string {
  const input = disabled
    ? ''
    : '<input class="file-picker-input" id="local-file-input" type="file" accept=".png,.wav,image/png,audio/wav" aria-label="Choose one local PNG file or WAV file" data-testid="local-file-input" tabindex="-1" />';
  const buttonState = disabled ? ' disabled' : ' data-open-picker aria-controls="local-file-input"';
  const note = disabled ? 'Desktop only · use a bundled Sample on phone' : 'One file · stays in memory only';
  const label = compact ? 'Open another' : 'Open a file';
  return `<div class="file-ingress${compact ? ' file-ingress-compact' : ''}" data-testid="file-ingress"><button class="button button-secondary file-picker" type="button"${buttonState}>${label} <span class="file-picker-detail">PNG or WAV</span></button>${input}${compact ? '' : `<span class="file-ingress-note">${note}</span>`}</div>`;
}

function renderNotice(): string {
  if (!operation.notice) return '';
  return `<p class="file-feedback file-feedback-${operation.notice.kind}" data-testid="file-feedback" role="${operation.notice.kind === 'error' ? 'alert' : 'status'}">${escapeHtml(operation.notice.message)}</p>`;
}

function renderRecoveryActions(inspection: Inspection): string {
  if (inspection.status !== 'unsupported' && inspection.status !== 'application-error') return '';
  return `<div class="recovery-actions" data-testid="recovery-actions"><span>Recovery</span><a class="button button-secondary" href="${router.href('/inspect?sample=png')}">Try PNG Sample</a><a class="button button-secondary" href="${router.href('/inspect?sample=wav')}">Try WAV Sample</a></div>`;
}

function operationLabel(inspection?: Inspection): string {
  if (operation.phase === 'reading') return 'Reading local file…';
  if (operation.phase === 'parsing') return 'Parsing locally…';
  if (operation.phase === 'slow') return `Working locally… this is taking longer than ${LocalFileFlow.limits.slowNoticeMs / 1000} seconds`;
  if (operation.phase === 'aborted') return 'Opening aborted · current Inspection preserved';
  if (operation.phase === 'unsupported') return 'Unsupported Format · current Inspection preserved · raw bytes available';
  if (operation.phase === 'limit-reached') return 'Limit reached · current Inspection preserved';
  if (operation.phase === 'application-error') return 'Application error · semantic output discarded';
  if (!inspection) return 'Ready for one local PNG or WAV file';
  const status = inspection.status ?? (inspection.state === 'ready' ? 'ready' : 'partial');
  if (status === 'unsupported') return 'Unsupported Format · raw bytes available without semantic parsing';
  if (status === 'limit-reached') return `Limit reached · incomplete ${formatLabel(inspection.format)} Inspection`;
  if (status === 'aborted') return `Aborted · incomplete ${formatLabel(inspection.format)} Inspection`;
  if (status === 'application-error') return 'Application error · raw-byte fallback only';
  const diagnosticCount = inspection.diagnostics.length;
  const suffix = diagnosticCount ? ` · ${diagnosticCount} Diagnostic${diagnosticCount === 1 ? '' : 's'}` : '';
  return `${status === 'ready' ? 'Ready' : 'Partial Inspection'}${suffix} · ${formatLabel(inspection.format)} · file data stays in memory only`;
}

function renderStatus(inspection?: Inspection): string {
  const cancelable = operation.phase === 'reading' || operation.phase === 'parsing' || operation.phase === 'slow';
  const busy = cancelable;
  const operationStatus = operation.phase === 'unsupported' || operation.phase === 'limit-reached' || operation.phase === 'aborted' || operation.phase === 'application-error'
    ? operation.phase
    : undefined;
  const status = operationStatus ?? inspection?.status ?? (inspection?.state === 'ready' ? 'ready' : inspection ? 'partial' : undefined);
  const stateClass = status ? ` status-${status}` : '';
  return `<div class="inspector-status${busy ? ' is-busy' : ''}${stateClass}" aria-live="polite" aria-atomic="true"><span class="status-dot" aria-hidden="true"></span><span>${operationLabel(inspection)}</span>${cancelable ? '<button class="status-cancel" type="button" data-cancel-job>Abort opening</button>' : ''}</div><span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="operation-announcement"></span>`;
}

function renderDiagnostics(inspection: Inspection): string {
  if (!inspection.diagnostics.length) return '';
  const visible = inspection.diagnostics.slice(0, 24);
  const safetyDiagnostic = inspection.diagnostics.find((diagnostic) => diagnostic.code === 'limit_reached');
  if (safetyDiagnostic && !visible.some((diagnostic) => diagnostic.code === safetyDiagnostic.code)) visible.push(safetyDiagnostic);
  const items = visible.map((diagnostic) => `<li><strong class="diagnostic-severity diagnostic-${diagnostic.severity}">${escapeHtml(diagnostic.severity)}</strong><code>${escapeHtml(diagnostic.code)}</code><span>${escapeHtml(diagnostic.message)}</span><small>${spanLabel(diagnostic.span)}</small></li>`).join('');
  const hiddenCount = Math.max(0, inspection.diagnostics.length - visible.length);
  const summary = hiddenCount > 0 ? `<p class="diagnostics-summary">Showing ${visible.length} of ${inspection.diagnostics.length} Diagnostics; the remainder stays in the Inspection contract.</p>` : '';
  return `<section class="diagnostics" aria-labelledby="diagnostics-heading" data-testid="diagnostics"><div class="diagnostics-heading"><span id="diagnostics-heading">Diagnostics</span><span class="panel-rule" aria-hidden="true"></span></div><ul>${items}</ul>${summary}</section>`;
}

// The byte-grid implementation lives behind the VirtualByteGrid module seam.

function renderInspectorViewTabs(activePanel: InspectorPanel): string {
  return `<nav class="inspector-view-tabs" role="tablist" aria-label="Inspector view"><button type="button" role="tab" data-inspector-panel="map" aria-selected="${activePanel === 'map'}" class="${activePanel === 'map' ? 'is-active' : ''}">Byte map</button><button type="button" role="tab" data-inspector-panel="info" aria-selected="${activePanel === 'info'}" class="${activePanel === 'info' ? 'is-active' : ''}">Info</button></nav>`;
}

function syncInspectorPanelUrl(panel: InspectorPanel): void {
  const params = new URLSearchParams(window.location.search);
  if (panel === 'info') params.set('panel', 'info');
  else params.delete('panel');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function renderInspectionLesson(inspection: Inspection, resolution: SelectionResolution): string {
  const lesson = lessonFor(inspection, resolution);
  const visibleLength = Math.min(resolution.selection.length, 32);
  const visibleBytes = Array.from(inspection.bytes.slice(resolution.selection.offset, resolution.selection.offset + visibleLength), formatByte).join(' ');
  const remainder = resolution.selection.length > visibleLength ? ` + ${resolution.selection.length - visibleLength} more` : '';
  return `<article class="inspector-info-panel" data-testid="inspection-info" aria-labelledby="inspection-info-heading">
    <header><h2 id="inspection-info-heading">${escapeHtml(lesson.title)}</h2><p>${escapeHtml(lesson.meaning)}</p></header>
    <div class="info-lesson-grid"><section><h3>How to read it</h3><p>${escapeHtml(lesson.reading)}</p></section><section><h3>Where it sits</h3><p>${escapeHtml(lesson.position)}</p></section></div>
    <div class="info-source-bytes" aria-label="Selected source bytes"><code>${escapeHtml(visibleBytes)}${escapeHtml(remainder)}</code></div>
  </article>`;
}

function renderNarrowSelectionSummary(
  inspection: Inspection,
  selection: ByteSpan,
  selectedSummary: string,
  focusSemanticAction: string,
): string {
  return `<div class="selection-summary narrow-selection-summary" id="selection-summary" data-testid="selection-summary" role="region" aria-labelledby="selection-summary-heading"><span class="summary-mark" aria-hidden="true"></span><span><span id="selection-summary-heading" class="sr-only">Selected span summary</span>${escapeHtml(selectedSummary)} <span class="summary-secondary">hex ${formatOffset(selection.offset, inspection.bytes.length)}–${formatOffset(Math.max(selection.offset, selection.offset + selection.length - 1), inspection.bytes.length)} · decimal ${formatDecimalOffset(selection.offset)}</span></span><button class="inline-copy" type="button" data-copy-kind="selection">Copy selected bytes</button>${focusSemanticAction}</div><div class="selection-announcement sr-only" aria-live="polite" aria-atomic="true" data-testid="selection-announcement"></div><div class="copy-feedback" data-testid="copy-feedback" role="status" aria-live="polite"></div>`;
}

function renderNarrowInspectorLayout(
  inspection: Inspection,
  selection: ByteSpan,
  resolution: SelectionResolution,
  activeTab: NarrowTab,
  previewUrl?: string,
  previewFailed = false,
): string {
  const displayFormat = formatLabel(inspection.format);
  const hidden = (tab: NarrowTab): string => tab === activeTab ? '' : ' hidden';
  return `${renderNarrowTabs(activeTab)}
    <div class="inspector-layout narrow-inspector-layout" data-active-tab="${activeTab}">
      <aside class="narrow-panel structure-panel${activeTab === 'structures' ? ' is-active' : ''}" id="narrow-panel-structures" data-testid="narrow-panel-structures" data-narrow-panel="structures" role="tabpanel" aria-labelledby="narrow-tab-structures"${hidden('structures')}>
        <div class="panel-heading"><span id="narrow-structure-heading">Structures</span><span class="panel-rule" aria-hidden="true"></span></div>
        <p class="panel-intro">Choose a Structure to follow its bytes.</p>
        <nav class="structure-list" aria-label="${displayFormat} Structures" data-semantic-list="structures">${renderStructureTree(inspection, selection, true)}</nav>
        <div class="structure-legend"><span class="legend-item"><span class="legend-mark legend-structure" aria-hidden="true"></span><span>Structure boundary</span></span><span class="legend-item"><span class="legend-mark legend-selection" aria-hidden="true"></span><span>Selected Byte span</span></span><span class="legend-item"><span class="legend-mark legend-unmapped" aria-hidden="true"></span><span>Unmapped span</span></span></div>
      </aside>
      <section class="narrow-panel byte-panel${activeTab === 'bytes' ? ' is-active' : ''}" id="narrow-panel-bytes" data-testid="narrow-panel-bytes" data-narrow-panel="bytes" role="tabpanel" aria-labelledby="narrow-tab-bytes"${hidden('bytes')}>
        <div class="panel-heading"><span id="narrow-bytes-heading">Bytes</span><span class="panel-rule" aria-hidden="true"></span><span class="panel-meta">16 bytes / row</span></div>
        <p class="panel-intro" id="narrow-byte-grid-help">Choose a byte. Shift or arrow keys extend the Selection.</p>
        <div class="byte-tools"><form class="goto-form" data-testid="goto-form"><label for="goto-offset">Offset</label><select id="goto-mode" aria-label="Offset notation"><option value="hex">Hex</option><option value="decimal">Decimal</option></select><input id="goto-offset" data-testid="offset-input" name="offset" inputmode="text" autocomplete="off" placeholder="0030" aria-describedby="offset-help offset-error" /><button class="button button-secondary" type="submit">Go</button><span id="offset-help" class="sr-only">Hexadecimal is the default. Choose Decimal explicitly for base ten.</span></form><div class="byte-accessibility"><label class="byte-enumeration"><input type="checkbox" data-testid="enumerate-bytes" ${enumerateRawBytes ? 'checked' : ''} /><span>Tab through bytes</span></label></div></div><p class="offset-error" id="offset-error" data-testid="offset-error" role="alert" hidden></p>
        <div class="byte-grid" id="byte-grid" data-testid="byte-grid"><div class="byte-grid-header" aria-hidden="true"><span>Offset</span><span>Hex bytes</span><span>ASCII</span></div><div class="byte-grid-viewport" data-grid-viewport role="grid" ${byteGridHeightStyle(inspection)}><div class="byte-grid-spacer" data-grid-spacer></div><div class="byte-grid-rows" data-grid-rows></div></div></div>
        <div class="ascii-note"><span class="mono">·</span> marks a non-printable byte.</div>
      </section>
      <aside class="narrow-panel field-panel${activeTab === 'fields' ? ' is-active' : ''}" id="narrow-panel-fields" data-testid="narrow-panel-fields" data-narrow-panel="fields" role="tabpanel" aria-labelledby="narrow-tab-fields"${hidden('fields')}>
        ${renderFieldInspector(inspection, resolution)}
        <figure class="source-preview" data-testid="source-preview"><figcaption id="narrow-field-heading">Source preview <span>· original-file rendering</span></figcaption>${renderPreview(inspection, displayFormat, previewUrl, previewFailed)}</figure>
      </aside>
      <section class="narrow-panel narrow-info-panel${activeTab === 'info' ? ' is-active' : ''}" id="narrow-panel-info" data-testid="narrow-panel-info" data-narrow-panel="info" role="tabpanel" aria-labelledby="narrow-tab-info"${hidden('info')}>${renderInspectionLesson(inspection, resolution)}</section>
    </div>`;
}

function renderPreview(inspection: Inspection, displayFormat: string, previewUrl?: string, previewFailed = false): string {
  if (!previewUrl || previewFailed) return '<p class="preview-unavailable">Original-file rendering unavailable; the Inspection remains usable.</p>';
  return inspection.format === 'wav'
    ? `<audio data-testid="source-preview-media" controls preload="metadata" src="${escapeHtml(previewUrl)}" aria-label="The WAV rendered as the original file"></audio>`
    : `<img data-testid="source-preview-media" src="${escapeHtml(previewUrl)}" alt="The ${displayFormat} rendered as the original file" />`;
}

function renderInspector(target: InspectionSession, requestedSelection?: ByteSpan, focusTarget?: GridFocusTarget, gridScrollTop?: number, selectionAnchor?: number): void {
  const inspection = target.inspection;
  ensurePreview(target);
  const selection = normalizeSelection(requestedSelection ?? target.selection ?? initialSelection(inspection), inspection.bytes.length);
  target.selection = selection;
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
  const preview = renderPreview(inspection, displayFormat, target.previewUrl, target.previewFailed);
  const narrow = isNarrowViewport();
  const activeNarrowTab = target.narrowTab ?? 'structures';
  const inspectorPanel = target.inspectorPanel ?? 'map';
  const selectionMotionKey = `${inspection.format}:${sourceName}:${inspection.bytes.length}:${selection.offset}:${selection.length}`;
  const selectionChanged = selectionMotionKey !== lastSelectionMotionKey;
  lastSelectionMotionKey = selectionMotionKey;
  mount.innerHTML = `
    <main class="app-shell inspector-shell${selectionChanged ? ' is-selection-change' : ''}">
      <section class="sheet-frame inspector-sheet" aria-labelledby="inspector-title" data-drop-target="inspector">
        <header class="inspector-toolbar">
          <a href="${router.href('/')}" class="back-link">${arrowIcon('left')}Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">${target.kind === 'local' ? 'Local Inspection' : 'Sample Inspection'}</h1></div>
          <div class="file-identity"><strong title="${escapeHtml(sourceName)}" aria-label="${target.kind === 'local' ? `Local filename: ${escapeHtml(sourceName)}` : escapeHtml(sourceName)}">${escapeHtml(sourceName)}</strong><span>${inspection.bytes.length.toLocaleString('en-US')} bytes · ${displayFormat}${target.kind === 'local' ? ' · local' : ''}</span></div>
          ${renderThemeToggle()}
        </header>
        ${narrow ? renderStatus(inspection) : `<div class="inspector-commandbar">${renderStatus(inspection)}${renderFileIngress(false, true)}${renderInspectorViewTabs(inspectorPanel)}</div>`}
        ${renderNotice()}
        ${renderRecoveryActions(inspection)}
        ${renderDiagnostics(inspection)}

        ${narrow ? renderNarrowSelectionSummary(inspection, selection, selectedSummary, focusSemanticAction) + renderNarrowInspectorLayout(inspection, selection, resolution, activeNarrowTab, target.previewUrl, target.previewFailed) : `<div class="inspector-layout${inspectorPanel === 'info' ? ' is-info' : ''}">
          <aside class="structure-panel" aria-labelledby="structure-heading"><div class="panel-heading"><span id="structure-heading">Structures</span><span class="panel-rule" aria-hidden="true"></span></div><p class="panel-intro">Choose a Structure to follow its bytes.</p><nav class="structure-list" aria-label="${displayFormat} Structures" data-semantic-list="structures">${renderStructureTree(inspection, selection, true)}</nav><div class="structure-legend"><span class="legend-item"><span class="legend-mark legend-structure" aria-hidden="true"></span><span>Structure boundary</span></span><span class="legend-item"><span class="legend-mark legend-selection" aria-hidden="true"></span><span>Selected Byte span</span></span><span class="legend-item"><span class="legend-mark legend-unmapped" aria-hidden="true"></span><span>Unmapped span</span></span></div></aside>

          <section class="byte-panel" aria-labelledby="bytes-heading"><div class="panel-heading"><span id="bytes-heading">Bytes</span><span class="panel-rule" aria-hidden="true"></span><span class="panel-meta">16 / row</span></div><p class="panel-intro" id="byte-grid-help">Choose a byte. Shift or arrow keys extend the Selection.</p>
            <div class="byte-tools"><form class="goto-form" data-testid="goto-form"><label for="goto-offset">Offset</label><select id="goto-mode" aria-label="Offset notation"><option value="hex">Hex</option><option value="decimal">Decimal</option></select><input id="goto-offset" data-testid="offset-input" name="offset" inputmode="text" autocomplete="off" placeholder="0030" aria-describedby="offset-help offset-error" /><button class="button button-secondary" type="submit">Go</button><span id="offset-help" class="sr-only">Hexadecimal is the default. Choose Decimal explicitly for base ten.</span></form><div class="byte-accessibility"><label class="byte-enumeration"><input type="checkbox" data-testid="enumerate-bytes" ${enumerateRawBytes ? 'checked' : ''} /><span>Tab through bytes</span></label></div></div><p class="offset-error" id="offset-error" data-testid="offset-error" role="alert" hidden></p>
            <div class="byte-grid" id="byte-grid" data-testid="byte-grid"><div class="byte-grid-header" aria-hidden="true"><span>Offset</span><span>Hex bytes</span><span>ASCII</span></div><div class="byte-grid-viewport" data-grid-viewport role="grid" ${byteGridHeightStyle(inspection)}><div class="byte-grid-spacer" data-grid-spacer></div><div class="byte-grid-rows" data-grid-rows></div></div></div>
            <div class="selection-summary" id="selection-summary" data-testid="selection-summary" role="region" aria-labelledby="selection-summary-heading"><span class="summary-mark" aria-hidden="true"></span><span><span id="selection-summary-heading" class="sr-only">Selected span summary</span>${escapeHtml(selectedSummary)} <span class="summary-secondary">hex ${formatOffset(selection.offset, inspection.bytes.length)}–${formatOffset(Math.max(selection.offset, selection.offset + selection.length - 1), inspection.bytes.length)} · decimal ${formatDecimalOffset(selection.offset)}</span></span><button class="inline-copy" type="button" data-copy-kind="selection">Copy selected bytes</button>${focusSemanticAction}</div><div class="selection-announcement sr-only" aria-live="polite" aria-atomic="true" data-testid="selection-announcement"></div><div class="ascii-note"><span class="mono">·</span> marks a non-printable byte.</div><div class="copy-feedback" data-testid="copy-feedback" role="status" aria-live="polite"></div>
          </section>

          <aside class="field-panel" aria-labelledby="field-heading">${renderFieldInspector(inspection, resolution)}<figure class="source-preview" data-testid="source-preview"><figcaption id="field-heading">Source preview <span>· original-file rendering</span></figcaption>${preview}</figure></aside>
          ${renderInspectionLesson(inspection, resolution)}
        </div>`}
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

  mount.querySelectorAll<HTMLButtonElement>('[data-inspector-panel]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextPanel = tab.dataset.inspectorPanel as InspectorPanel | undefined;
      if (!nextPanel || nextPanel === target.inspectorPanel) return;
      target.inspectorPanel = nextPanel;
      syncInspectorPanelUrl(nextPanel);
      renderInspector(target, selection);
    });
  });

  if (narrow) {
    const tabElements = Array.from(mount.querySelectorAll<HTMLButtonElement>('[data-narrow-tab]'));
    tabElements.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.narrowTab as NarrowTab | undefined;
        if (nextTab) {
          target.inspectorPanel = nextTab === 'info' ? 'info' : 'map';
          syncInspectorPanelUrl(target.inspectorPanel);
          activateNarrowTab(mount, target, nextTab);
        }
      });
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabElements.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabElements.length) % tabElements.length;
        const nextTab = tabElements[nextIndex];
        const nextTabId = nextTab?.dataset.narrowTab as NarrowTab | undefined;
        if (nextTabId) {
          target.inspectorPanel = nextTabId === 'info' ? 'info' : 'map';
          syncInspectorPanelUrl(target.inspectorPanel);
          activateNarrowTab(mount, target, nextTabId);
        }
      });
    });
  }

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
    if (narrow) activateNarrowTab(mount, target, 'bytes', false);
    grid.scrollToOffset(selection.offset);
  });
  mount.querySelector<HTMLButtonElement>('[data-focus-semantic]')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const id = button.dataset.focusSemantic;
    if (!id) return;
    const kind = button.dataset.focusSemanticKind;
    if (narrow) activateNarrowTab(mount, target, kind === 'field' ? 'fields' : 'structures', false);
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
  const clicked = event.target instanceof Element ? event.target : null;
  if (clicked?.closest('[data-theme-toggle]')) {
    toggleTheme();
    return;
  }
  const cancelTarget = clicked?.closest('[data-cancel-job]');
  if (cancelTarget) {
    cancelFileJob();
    return;
  }
  const pickerTarget = clicked?.closest<HTMLElement>('[data-open-picker]');
  if (pickerTarget) {
    pickerTarget.parentElement?.querySelector<HTMLInputElement>('[data-testid="local-file-input"]')?.click();
  }
});

mount.addEventListener('dragenter', (event) => {
  if (isNarrowViewport()) return;
  if (!event.dataTransfer) return;
  event.preventDefault();
  dragDepth += 1;
  mount.classList.add('is-drag-active');
});

mount.addEventListener('dragover', (event) => {
  if (isNarrowViewport()) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});

mount.addEventListener('dragleave', (event) => {
  if (isNarrowViewport()) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) mount.classList.remove('is-drag-active');
});

mount.addEventListener('drop', handleDrop);

function renderRoute(): void {
  view = router.currentView();
  if (view === 'landing') {
    fileFlow.cancel();
    operation = { phase: 'ready', origin: 'landing' };
    render();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('sample') === 'png' || params.get('sample') === 'wav') {
    fileFlow.cancel();
    revokePreview(session);
    session = sampleSession(params.get('sample') === 'wav' ? wavSample : sample);
    if (params.get('panel') === 'info') {
      session.inspectorPanel = 'info';
      session.narrowTab = 'info';
    }
    operation = { phase: 'ready', origin: 'inspect' };
  }
  render();
}

window.addEventListener('popstate', renderRoute);
window.addEventListener('resize', () => {
  const nextNarrowViewport = isNarrowViewport();
  if (nextNarrowViewport === lastNarrowViewport) return;
  lastNarrowViewport = nextNarrowViewport;
  render();
});
window.addEventListener('beforeunload', () => revokePreview(session));
renderRoute();
