import type { ByteSpan, Inspection } from './domain/inspection.ts';
import { BYTES_PER_ROW, asciiLabel, formatByte, formatOffset, normalizeSelection, resolveSelection, selectionHex } from './domain/byte-grid.ts';
import { spanLabel } from './domain/inspection.ts';
import { renderStructureTree } from './structure-tree.ts';
import { renderThemeToggle } from './theme.ts';
import { arrowIcon } from './icons.ts';

type LandingRoute = '/' | '/inspect' | `/inspect?sample=${'png' | 'wav'}` | `/inspect?sample=${'png' | 'wav'}&panel=info`;

export interface LandingViewOptions {
  mount: HTMLDivElement;
  sample: Inspection;
  getSelection: () => ByteSpan;
  setSelection: (selection: ByteSpan) => void;
  isNarrow: () => boolean;
  routeHref: (route: LandingRoute) => string;
  renderFileIngress: (disabled?: boolean) => string;
  renderNotice: () => string;
  operationPhase: () => string;
  operationLabel: () => string;
  sourceDataUrl: (format: Inspection['format']) => string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

let activeOptions: LandingViewOptions;
let selection: ByteSpan;

function renderByteStrip(inspection: Inspection, selected?: ByteSpan, interactive = false, dataPrefix = '', maxBytes?: number): string {
  const visibleCount = Math.min(inspection.bytes.length, maxBytes ?? (interactive ? inspection.bytes.length : 24));
  const visibleBytes = inspection.bytes.slice(0, visibleCount);
  const limitNote = visibleCount < inspection.bytes.length ? `<span class="plate-caption">first ${visibleCount} bytes</span>` : '';
  const rows: string[] = [];
  for (let start = 0; start < visibleBytes.length; start += BYTES_PER_ROW) {
    const rowEnd = Math.min(start + BYTES_PER_ROW, visibleBytes.length);
    const selectedStart = selected ? Math.max(start, selected.offset) : start;
    const selectedEnd = selected ? Math.min(rowEnd, selected.offset + selected.length) : start;
    const selectedLength = Math.max(0, selectedEnd - selectedStart);
    const bracket = selectedLength > 0 ? `<span class="span-bracket" style="--selection-start: ${selectedStart - start}; --selection-length: ${selectedLength}" aria-hidden="true"></span>` : '';
    const cells = Array.from(visibleBytes.slice(start, start + BYTES_PER_ROW), (value, index) => {
      const offset = start + index;
      const isSelected = selected ? offset >= selected.offset && offset < selected.offset + selected.length : false;
      const label = `${formatByte(value)} at offset ${formatOffset(offset, inspection.bytes.length)}; ${asciiLabel(value)}`;
      return interactive
        ? `<button class="byte-cell${isSelected ? ' is-selected' : ''}" type="button" data-${dataPrefix}byte-offset="${offset}" aria-label="${escapeHtml(label)}" aria-pressed="${isSelected}">${formatByte(value)}</button>`
        : `<span class="byte-cell${isSelected ? ' is-selected' : ''}" aria-label="${escapeHtml(label)}">${formatByte(value)}</span>`;
    }).join('');
    const ascii = Array.from(visibleBytes.slice(start, start + BYTES_PER_ROW), (value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : '·').join('');
    rows.push(`<div class="byte-row"><span class="byte-offset">${formatOffset(start, inspection.bytes.length)}</span><div class="byte-cells${selectedLength > 0 ? ' has-selection' : ''}">${bracket}${cells}</div><span class="ascii-gutter" aria-label="ASCII for offsets ${formatOffset(start, inspection.bytes.length)}–${formatOffset(rowEnd - 1, inspection.bytes.length)}">${ascii}</span></div>`);
  }
  return `<div class="byte-strip" data-testid="byte-strip">${rows.join('')}</div>${limitNote}`;
}

function renderLandingSelectionNote(selected: ByteSpan): string {
  const resolution = resolveSelection(activeOptions.sample, selected);
  const selectedLabel = resolution.field?.label ?? resolution.structure?.label ?? resolution.unmapped?.label ?? 'Unmapped span';
  const explanation = resolution.field?.explanation ?? resolution.structure?.description ?? resolution.unmapped?.reason ?? 'No parsed Structure or Field claims this Byte span.';
  const value = resolution.field ? formatValue(resolution.field.value) : resolution.structure ? `${resolution.structure.span.length} bytes` : '—';
  const encoded = resolution.field?.encodedBytes.map(formatByte).join(' ') ?? selectionHex(activeOptions.sample.bytes, selected);
  return `<aside class="landing-selection-note" id="landing-selection-summary" data-testid="landing-selection-summary" aria-live="polite"><h3>${escapeHtml(selectedLabel)}</h3><p>${escapeHtml(explanation)}</p><dl><div><dt>Byte span</dt><dd>${spanLabel(selected)} · ${selected.length} bytes</dd></div><div><dt>Encoded</dt><dd class="mono">${escapeHtml(encoded)}</dd></div><div><dt>Value</dt><dd>${escapeHtml(value)}</dd></div></dl></aside>`;
}

function localMark(narrow: boolean): string {
  return `<span class="editorial-local-mark"><i aria-hidden="true"></i>${narrow ? 'Samples stay in this browser' : 'Files stay in this browser'}</span>`;
}

export function renderLanding(options: LandingViewOptions, nextSelection: ByteSpan = options.getSelection(), focusSelector?: string): void {
  activeOptions = options;
  const narrow = options.isNarrow();
  selection = normalizeSelection(nextSelection, options.sample.bytes.length);
  options.setSelection(selection);
  const resolution = resolveSelection(options.sample, selection);
  const selectedLabel = resolution.field?.label ?? resolution.structure?.label ?? 'PNG signature';
  const selectedStructure = resolution.structure ?? options.sample.structures[0];

  options.mount.innerHTML = `
    <main class="app-shell landing-shell editorial-landing">
      <section class="sheet-frame landing-sheet" aria-labelledby="landing-title" data-drop-target="landing">
        <div class="manuscript-progress" aria-hidden="true"></div>
        <header class="editorial-nav">
          <a class="wordmark" href="${options.routeHref('/')}" aria-label="HexLens home">HexLens</a>
          <nav aria-label="Landing navigation"><a href="#how-it-works">How it works</a><a href="${options.routeHref('/inspect?sample=png')}">Inspector</a></nav>
          ${renderThemeToggle()}
        </header>

        <section class="editorial-hero" aria-labelledby="landing-title">
          <div class="editorial-manifesto">
            <div><h1 id="landing-title">Read the file.<br />See its structure.</h1><p>${narrow ? 'Explore the named Structures and bytes inside bundled PNG and WAV Samples.' : 'Inspect PNG and WAV files without sending a byte away from your browser.'}</p></div>
            <div class="editorial-actions">
              <a class="button button-primary" href="${options.routeHref('/inspect?sample=png')}" data-testid="try-sample">Try the sample ${arrowIcon('right')}</a>
              ${options.renderFileIngress(narrow)}
              ${narrow ? '' : '<p class="drop-hint" data-testid="drop-hint">Or drop one PNG or WAV file anywhere on this page.</p>'}
              ${options.renderNotice()}
              ${localMark(narrow)}
              ${options.operationPhase() !== 'ready' ? `<p class="landing-operation" role="status" aria-live="polite">${options.operationLabel()}</p>` : ''}
            </div>
          </div>

          <div class="editorial-proof sample-plate" aria-labelledby="sample-title" data-testid="landing-mini-inspector">
            <div class="editorial-proof-title"><span>Follow one selection</span><h2 id="sample-title">${escapeHtml(selectedLabel)}</h2><span>${selection.length} bytes</span></div>
            ${renderByteStrip(options.sample, selection, true, 'landing-', 48)}
            <ol class="manuscript-path" aria-label="Selection path from bytes to meaning">
              <li><span>Source bytes</span><code>${spanLabel(selection)}</code></li>
              <li><span>Structure</span><strong>${escapeHtml(selectedStructure?.label ?? 'Unmapped span')}</strong></li>
              <li><span>Meaning</span><strong>${escapeHtml(selectedLabel)}</strong></li>
            </ol>
            <nav class="landing-structure-map" aria-label="PNG sample Structures">${renderStructureTree(options.sample, selection, true, 'landing-')}</nav>
            ${renderLandingSelectionNote(selection)}
            <footer>${localMark(narrow)}<span>No upload. No account.</span></footer>
            <figure class="source-preview-mini"><figcaption>Source preview · original-file rendering</figcaption><img src="${options.sourceDataUrl('png')}" alt="A one-pixel PNG Sample rendered as a tiny transparent image" /></figure>
          </div>
        </section>

        <section class="editorial-connection landing-beat landing-beat-mechanism" id="how-it-works" aria-labelledby="mechanism-heading" data-testid="landing-beat-mechanism">
          <header><h2 id="mechanism-heading">A span is the explanation.</h2><p>Select a named Structure or a byte. HexLens keeps the decoded value, its explanation, and the exact source range in the same view.</p></header>
          <div class="editorial-connection-rows" aria-label="How a Selection connects bytes and meaning">
            <div data-manuscript-step="bytes"><code>${escapeHtml(selectionHex(options.sample.bytes, selection))}</code><strong>Bytes</strong><p>The original values stay in source order. HexLens never substitutes a decoded preview for this evidence.</p></div>
            <div data-manuscript-step="structure"><code>${spanLabel(selection)}</code><strong>Structure</strong><p>${escapeHtml(selectedStructure?.label ?? 'Selected span')} claims this exact range under the Format's rules.</p></div>
            <div data-manuscript-step="meaning"><code>${escapeHtml(selectedLabel)}</code><strong>Meaning</strong><p>${escapeHtml(resolution.field?.explanation ?? selectedStructure?.description ?? 'The parser has not assigned a semantic meaning to this span.')}</p></div>
          </div>
        </section>

        <section class="editorial-coverage landing-beat landing-beat-coverage" aria-labelledby="coverage-heading" data-testid="landing-beat-coverage">
          <header><h2 id="coverage-heading">Two Formats. One honest contract.</h2><p>HexLens explains the parts it understands and keeps compressed payloads visible without pretending to decode them.</p></header>
          <dl><div><dt><strong>PNG</strong><span>image structure</span></dt><dd><span>Signature · IHDR · PLTE · IDAT · IEND</span><small>Compressed image Payload remains opaque.</small></dd></div><div><dt><strong>WAV</strong><span>audio structure</span></dt><dd><span>RIFF/WAVE · fmt · data · LIST/INFO</span><small>Audio sample Payload remains opaque.</small></dd></div></dl>
        </section>

        <section class="editorial-teach landing-beat" aria-labelledby="teach-heading">
          <div><h2 id="teach-heading">Learn the format while you inspect it.</h2><p>The Info tab explains why each Structure exists and how to read its bytes. The lesson follows your current Selection.</p><a class="button button-primary" href="${options.routeHref('/inspect?sample=png&panel=info')}">Open the educational view ${arrowIcon('right')}</a></div>
          <aside><strong>The file's ID card</strong><p>Every PNG starts with a fixed eight-byte signature. Software can identify the format before decoding pixels.</p></aside>
        </section>

        <section class="editorial-close landing-beat landing-beat-local" aria-labelledby="local-heading" data-testid="landing-beat-local">
          <div><h2 id="local-heading">Your file stays with you.</h2><p>HexLens keeps file bytes, names, metadata, offsets, and Diagnostics in memory on this device. They do not enter URLs, storage, logs, telemetry, or outgoing requests.</p></div>
          <div>${localMark(narrow)}<a class="button button-primary landing-final-action" href="${options.routeHref('/inspect?sample=png')}" data-testid="try-sample-final">Inspect the sample ${arrowIcon('right')}</a></div>
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
