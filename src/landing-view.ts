import type { ByteSpan, Inspection } from './domain/inspection.ts';
import { BYTES_PER_ROW, asciiLabel, formatByte, formatDecimalOffset, formatOffset, normalizeSelection, resolveSelection, selectionHex } from './domain/byte-grid.ts';
import { spanLabel } from './domain/inspection.ts';
import { renderStructureTree } from './structure-tree.ts';
import { renderThemeToggle } from './theme.ts';

export interface LandingViewOptions {
  mount: HTMLDivElement;
  sample: Inspection;
  getSelection: () => ByteSpan;
  setSelection: (selection: ByteSpan) => void;
  isNarrow: () => boolean;
  routeHref: (route: '/' | '/inspect' | `/inspect?sample=${'png' | 'wav'}`) => string;
  renderFileIngress: (disabled?: boolean) => string;
  renderNotice: () => string;
  operationPhase: () => string;
  operationLabel: () => string;
  sourceDataUrl: (format: Inspection['format']) => string;
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' })[character] ?? character); }
function formatValue(value: string | number): string { return typeof value === 'number' ? value.toLocaleString('en-US') : value; }

let activeOptions: LandingViewOptions;
let selection: ByteSpan;

function renderByteStrip(inspection: Inspection, selection?: ByteSpan, interactive = false, dataPrefix = '', maxBytes?: number): string {
  const visibleCount = Math.min(inspection.bytes.length, maxBytes ?? (interactive ? inspection.bytes.length : 24));
  const visibleBytes = inspection.bytes.slice(0, visibleCount);
  const limitNote = visibleCount < inspection.bytes.length ? `<span class="plate-caption">first ${visibleCount} bytes</span>` : '';
  const rows: string[] = [];
  for (let start = 0; start < visibleBytes.length; start += BYTES_PER_ROW) {
    const rowEnd = Math.min(start + BYTES_PER_ROW, visibleBytes.length);
    const selectedStart = selection ? Math.max(start, selection.offset) : start;
    const selectedEnd = selection ? Math.min(rowEnd, selection.offset + selection.length) : start;
    const selectedLength = Math.max(0, selectedEnd - selectedStart);
    const bracket = selectedLength > 0 ? `<span class="span-bracket" style="--selection-start: ${selectedStart - start}; --selection-length: ${selectedLength}" aria-hidden="true"></span>` : '';
    const cells = Array.from(visibleBytes.slice(start, start + BYTES_PER_ROW), (value, index) => { const offset = start + index; const isSelected = selection ? offset >= selection.offset && offset < selection.offset + selection.length : false; const label = `${formatByte(value)} at offset ${formatOffset(offset, inspection.bytes.length)}; ${asciiLabel(value)}`; return interactive ? `<button class="byte-cell${isSelected ? ' is-selected' : ''}" type="button" data-${dataPrefix}byte-offset="${offset}" aria-label="${escapeHtml(label)}" aria-pressed="${isSelected}">${formatByte(value)}</button>` : `<span class="byte-cell${isSelected ? ' is-selected' : ''}" aria-label="${escapeHtml(label)}">${formatByte(value)}</span>`; }).join('');
    rows.push(`<div class="byte-row"><span class="byte-offset">${formatOffset(start, inspection.bytes.length)}</span><div class="byte-cells${selectedLength > 0 ? ' has-selection' : ''}">${bracket}${cells}</div><span class="ascii-gutter" aria-label="ASCII for offsets ${formatOffset(start, inspection.bytes.length)}–${formatOffset(rowEnd - 1, inspection.bytes.length)}">${Array.from(visibleBytes.slice(start, start + BYTES_PER_ROW), (value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : '·').join('')}</span></div>`);
  }
  return `<div class="byte-strip" data-testid="byte-strip">${rows.join('')}</div>${limitNote}`;
}

function renderLandingSelectionNote(selection: ByteSpan): string {
  const resolution = resolveSelection(activeOptions.sample, selection);
  const selectedLabel = resolution.field?.label ?? resolution.structure?.label ?? resolution.unmapped?.label ?? 'Unmapped span';
  const explanation = resolution.field?.explanation ?? resolution.structure?.description ?? resolution.unmapped?.reason ?? 'No parsed Structure or Field claims this Byte span.';
  const value = resolution.field ? formatValue(resolution.field.value) : resolution.structure ? `${resolution.structure.span.length} bytes` : '—';
  const encoded = resolution.field?.encodedBytes.map(formatByte).join(' ') ?? selectionHex(activeOptions.sample.bytes, selection);
  return `<aside class="landing-selection-note" id="landing-selection-summary" data-testid="landing-selection-summary" aria-live="polite"><div class="selection-note-kicker">Live Selection</div><h3>${escapeHtml(selectedLabel)}</h3><p>${escapeHtml(explanation)}</p><dl><div><dt>Byte span</dt><dd>${spanLabel(selection)} · ${selection.length} bytes</dd></div><div><dt>Encoded</dt><dd class="mono">${escapeHtml(encoded)}</dd></div><div><dt>Value</dt><dd>${escapeHtml(value)}</dd></div></dl></aside>`;
}

export function renderLanding(options: LandingViewOptions, nextSelection: ByteSpan = options.getSelection(), focusSelector?: string): void {
  activeOptions = options;
  const narrow = options.isNarrow();
  selection = normalizeSelection(nextSelection, options.sample.bytes.length);
  options.setSelection(selection);
  const ihdr = options.sample.structures.find((structure) => structure.type === 'IHDR') ?? options.sample.structures[1];
  const widthField = ihdr?.fields.find((field) => field.name === 'width') ?? ihdr?.fields[0];
  const ihdrSelection = ihdr?.span ?? selection;
  const ihdrFieldLabel = widthField?.label ?? 'Width';
  const ihdrFieldValue = widthField ? formatValue(widthField.value) : '—';
  const ihdrEncoded = widthField?.encodedBytes.map(formatByte).join(' ') ?? '—';

  options.mount.innerHTML = `
    <main class="app-shell landing-shell">
      <section class="sheet-frame landing-sheet" aria-labelledby="landing-title" data-drop-target="landing">
        <div class="masthead">
          <a class="wordmark" href="${options.routeHref('/')}" aria-label="HexLens home">HexLens</a>
          <span class="masthead-rule" aria-hidden="true"></span>
          <span class="masthead-label"><span class="status-pulse" aria-hidden="true"></span>Local binary inspector</span>
          ${renderThemeToggle()}
        </div>

        <section class="landing-grid landing-beat landing-beat-promise" aria-labelledby="landing-title">
          <div class="landing-copy">
            <h1 id="landing-title"><span>Read the file.</span><span>See the structure.</span></h1>
            <p class="lead-copy">${narrow ? 'HexLens ties each bundled Sample to the named Structures and bytes that form it.' : 'HexLens opens a binary file on your machine and ties its named Structures to the bytes that form them.'}</p>
            <p class="support-copy">No uploads. No guesswork.<br />Just bytes, offsets, and meaning.</p>
            <div class="landing-actions">
              <a class="button button-primary" href="${options.routeHref('/inspect?sample=png')}" data-testid="try-sample">Try the sample <span aria-hidden="true">→</span></a>
              ${options.renderFileIngress(narrow)}
            </div>
            ${narrow ? '<p class="sample-only-note">Phone view · open a bundled PNG or WAV Sample.</p>' : '<p class="drop-hint" data-testid="drop-hint">Or drop one PNG or WAV file onto this sheet.</p>'}
            ${options.renderNotice()}
            <p class="local-note"><span class="lock-mark" aria-hidden="true"><span></span></span><span><strong>100% local.</strong><br />${narrow ? 'Samples stay in your browser.' : 'Your files never leave your machine.'}</span></p>
            ${options.operationPhase() !== 'ready' ? `<p class="landing-operation" role="status" aria-live="polite">${options.operationLabel()}</p>` : ''}
          </div>

          <div class="sample-plate" aria-labelledby="sample-title" data-testid="landing-mini-inspector">
            <div class="sample-plate-heading"><h2 id="sample-title">Sample: PNG <span>(first 24 bytes)</span></h2><span class="plate-line" aria-hidden="true"></span></div>
            <div class="sample-offsets" aria-hidden="true"><span>Offset</span><span>00</span><span>04</span><span>08</span><span>0C</span><span>14</span><span>18</span></div>
            ${renderByteStrip(options.sample, selection, true, 'landing-', 24)}
            <div class="landing-structure-map">${renderStructureTree(options.sample, selection, true, 'landing-')}</div>
            ${renderLandingSelectionNote(selection)}
            <figure class="source-preview-mini"><figcaption>Source preview · original-file rendering</figcaption><img src="${options.sourceDataUrl('png')}" alt="A one-pixel PNG Sample rendered as a tiny transparent image" /></figure>
          </div>
        </section>

        <section class="landing-beat landing-beat-mechanism" aria-labelledby="mechanism-heading" data-testid="landing-beat-mechanism">
          <div class="beat-intro"><span class="beat-rule" aria-hidden="true"></span><h2 id="mechanism-heading">A span is the explanation.</h2><p>One Selection keeps the semantic label, the exact bytes, and the Field note together. Click a Structure or byte above to see the same relationship move.</p></div>
          <div class="mechanism-ledger" aria-label="PNG Selection relationship">
            <div class="ledger-line"><span>Structure</span><strong>${escapeHtml(ihdr?.label ?? 'IHDR')}</strong><code>${spanLabel(ihdrSelection)}</code><small>${ihdrSelection.length} bytes · image header</small></div>
            <div class="ledger-line"><span>Field note</span><strong>${escapeHtml(ihdrFieldLabel)}</strong><code>${escapeHtml(ihdrEncoded)}</code><small>interpreted value · ${escapeHtml(ihdrFieldValue)}</small></div>
            <div class="ledger-line"><span>Source preview</span><strong>Original PNG</strong><code>not parsed output</code><small>shown as a browser rendering for reference</small></div>
          </div>
        </section>

        <section class="landing-beat landing-beat-coverage" aria-labelledby="coverage-heading" data-testid="landing-beat-coverage">
          <div class="beat-intro"><span class="beat-rule beat-rule-verdigris" aria-hidden="true"></span><h2 id="coverage-heading">Two Formats. One honest contract.</h2><p>HexLens ships a bounded, read-only path for the two Formats it can explain today. Payload bytes stay visible without being decoded.</p></div>
          <dl class="coverage-ledger">
            <div class="coverage-entry"><dt><strong>PNG</strong><span>image structure</span></dt><dd><span>Signature · IHDR · PLTE · IDAT · IEND</span><span>tEXt · iTXt · gAMA · sRGB · tRNS · pHYs</span><small>Compressed image Payload remains opaque.</small></dd></div>
            <div class="coverage-entry"><dt><strong>WAV</strong><span>RIFF/WAVE structure</span></dt><dd><span>RIFF/WAVE · fmt · data · optional fact</span><span>LIST/INFO · INAM · IART · ICMT · ICRD · IGNR</span><small>PCM and IEEE-float Fields are little-endian; audio sample Payload remains opaque.</small></dd></div>
          </dl>
        </section>

        <section class="landing-beat landing-beat-local" aria-labelledby="local-heading" data-testid="landing-beat-local">
          <div class="local-close"><span class="lock-mark" aria-hidden="true"><span></span></span><div><h2 id="local-heading">Your file stays with you.</h2><p>Choose one local PNG or WAV on desktop. Bytes, filenames, metadata, offsets, and Diagnostics stay in memory on this device; they do not enter URLs, storage, logs, telemetry, or outgoing requests.</p><p class="local-close-note">No upload. Just a short path from Sample to Inspection.</p></div></div>
          <a class="button button-primary landing-final-action" href="${options.routeHref('/inspect?sample=png')}" data-testid="try-sample-final">Try the sample <span aria-hidden="true">→</span></a>
        </section>

        <footer class="sheet-footer"><span><strong>HexLens</strong> · local by design</span><span>PNG and WAV</span><span>No uploads. No telemetry.</span></footer>
      </section>
    </main>
  `;

  options.mount.querySelectorAll<HTMLElement>('[data-landing-structure-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.landingStructureId;
      const structure = options.sample.structures.find((item) => item.id === id);
      if (structure) renderLanding(options, structure.span, `[data-landing-structure-id="${CSS.escape(structure.id)}"]`);
    });
    element.addEventListener('keydown', (event) => {
      const rows = Array.from(options.mount.querySelectorAll<HTMLElement>('[data-landing-structure-id]'));
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = rows.indexOf(element);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[nextIndex]?.focus();
    });
  });
  options.mount.querySelectorAll<HTMLElement>('[data-landing-byte-offset]').forEach((element) => {
    element.addEventListener('click', () => {
      const offset = Number(element.dataset.landingByteOffset);
      if (Number.isInteger(offset)) renderLanding(options, { offset, length: 1 }, `[data-landing-byte-offset="${offset}"]`);
    });
  });
  if (focusSelector) queueMicrotask(() => options.mount.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true }));
}
