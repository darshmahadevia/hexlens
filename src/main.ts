import './styles.css';
import type { ByteSpan, Field, Inspection, Structure } from './domain/inspection.ts';
import { spanContains, spanIntersects, spanLabel } from './domain/inspection.ts';
import { sampleInspection, PNG_SAMPLE_BASE64 } from './sample.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('HexLens mount point is missing.');
const mount = app;

const sample = sampleInspection();

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

function selectedStructure(inspection: Inspection, selection: ByteSpan): Structure {
  const containing = inspection.structures.filter((structure) => spanContains(structure.span, selection));
  return [...containing].sort((a, b) => a.span.length - b.span.length)[0] ?? inspection.structures[0];
}

function selectedField(structure: Structure, selection: ByteSpan): Field | undefined {
  const containing = structure.fields.filter((field) => spanContains(field.span, selection));
  return [...containing].sort((a, b) => a.span.length - b.span.length)[0];
}

function renderByteStrip(inspection: Inspection, selection?: ByteSpan, interactive = false): string {
  const visibleBytes = interactive ? inspection.bytes : inspection.bytes.slice(0, 24);
  const limitNote = interactive && inspection.bytes.length > 48 ? '' : interactive ? '' : '<span class="plate-caption">first 24 bytes</span>';
  const rows = [];
  for (let start = 0; start < visibleBytes.length; start += 16) {
    const rowEnd = Math.min(start + 16, visibleBytes.length);
    const selectedStart = selection ? Math.max(start, selection.offset) : start;
    const selectedEnd = selection ? Math.min(rowEnd, selection.offset + selection.length) : start;
    const selectedLength = Math.max(0, selectedEnd - selectedStart);
    const bracket = selectedLength > 0
      ? `<span class="span-bracket" style="--selection-start: ${selectedStart - start}; --selection-length: ${selectedLength}" aria-hidden="true"></span>`
      : '';
    rows.push(`<div class="byte-row"><span class="byte-offset">${start.toString(16).toUpperCase().padStart(4, '0')}</span><div class="byte-cells${selectedLength > 0 ? ' has-selection' : ''}">${bracket}${Array.from(visibleBytes.slice(start, start + 16), (value, index) => {
      const offset = start + index;
      const isSelected = selection ? offset >= selection.offset && offset < selection.offset + selection.length : false;
      const label = `${hexByte(value)} at offset ${offset.toString(16).toUpperCase().padStart(2, '0')}`;
      return interactive
        ? `<button class="byte-cell${isSelected ? ' is-selected' : ''}" type="button" data-byte-offset="${offset}" aria-label="${label}" aria-pressed="${isSelected}">${hexByte(value)}</button>`
        : `<span class="byte-cell${isSelected ? ' is-selected' : ''}" aria-label="${label}">${hexByte(value)}</span>`;
    }).join('')}</div><span class="ascii-gutter">${Array.from(visibleBytes.slice(start, start + 16), (value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : '·').join('')}</span></div>`);
  }
  return `<div class="byte-strip" data-testid="byte-strip">${rows.join('')}</div>${limitNote}`;
}

function renderStructureLabels(inspection: Inspection, selection?: ByteSpan, interactive = false): string {
  return inspection.structures.map((structure) => {
    const active = selection ? spanIntersects(structure.span, selection) : false;
    const tag = structure.kind === 'payload' ? 'Payload' : structure.kind === 'header' ? 'Header' : 'Chunk';
    const content = `<span class="structure-index">${spanLabel(structure.span)}</span><span class="structure-copy"><strong>${escapeHtml(structure.label)}</strong><small>${tag} · ${structure.span.length} bytes</small></span>`;
    return interactive
      ? `<button class="structure-row${active ? ' is-selected' : ''}" type="button" data-structure-id="${structure.id}" aria-pressed="${active}">${content}</button>`
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

function renderFieldInspector(structure: Structure, selected: ByteSpan): string {
  const focused = selectedField(structure, selected) ?? (selected.offset === structure.span.offset && selected.length === structure.span.length
    ? structure.fields.find((item) => item.name === 'width') ?? structure.fields[0]
    : undefined);
  const fields = structure.fields.map((field) => {
    const active = focused?.id === field.id;
    const encoded = field.encodedBytes.map(hexByte).join(' ');
    return `<button class="field-row${active ? ' is-selected' : ''}" type="button" data-field-id="${field.id}" aria-pressed="${active}"><span class="field-label"><strong>${escapeHtml(field.label)}</strong><small>${spanLabel(field.span)} · ${field.span.length} bytes</small></span><span class="field-value">${escapeHtml(formatValue(field.value))}</span></button>`;
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

function renderInspector(inspection: Inspection, selection: ByteSpan = { offset: 0, length: 8 }): void {
  const structure = selectedStructure(inspection, selection);
  const field = selectedField(structure, selection);
  const selectedLabel = field ? field.label : structure.label;
  const selectedSummary = `Selected ${selectedLabel}, offset ${selection.offset}, length ${selection.length} bytes.`;
  mount.innerHTML = `
    <main class="app-shell inspector-shell">
      <section class="sheet-frame inspector-sheet" aria-labelledby="inspector-title">
        <div class="registration registration-top-left" aria-hidden="true"></div>
        <div class="registration registration-top-right" aria-hidden="true"></div>
        <header class="inspector-toolbar">
          <a href="/" class="back-link">← Back to landing</a>
          <div class="toolbar-title"><span class="wordmark wordmark-small">HexLens</span><span class="toolbar-divider" aria-hidden="true"></span><h1 id="inspector-title">Sample Inspection</h1></div>
          <div class="file-identity"><strong>${escapeHtml(inspection.sourceName)}</strong><span>${inspection.bytes.length} bytes · PNG</span></div>
        </header>
        <div class="inspector-status" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span>${inspection.state === 'ready' ? 'Ready' : 'Partial Inspection'} · Sample bytes are held in memory only</div>

        <div class="inspector-layout">
          <aside class="structure-panel" aria-labelledby="structure-heading"><div class="panel-heading"><span id="structure-heading">Structures</span><span class="panel-rule" aria-hidden="true"></span></div><p class="panel-intro">The PNG's named parts, in source order.</p><nav class="structure-list" aria-label="PNG Structures">${renderStructureLabels(inspection, selection, true)}</nav><div class="structure-legend"><span class="legend-mark legend-structure" aria-hidden="true"></span><span>Structure span</span><span class="legend-mark legend-selection" aria-hidden="true"></span><span>Selected span</span></div></aside>

          <section class="byte-panel" aria-labelledby="bytes-heading"><div class="panel-heading"><span id="bytes-heading">Bytes</span><span class="panel-rule" aria-hidden="true"></span><span class="panel-meta">16 bytes / row</span></div><p class="panel-intro">Select a byte to focus the smallest matching Field.</p>${renderByteStrip(inspection, selection, true)}<div class="selection-summary" data-testid="selection-summary"><span class="summary-mark" aria-hidden="true"></span><span>${escapeHtml(selectedSummary)}</span></div><div class="ascii-note"><span class="mono">·</span> non-printable byte <span class="mono">·</span> printable ASCII appears at right</div></section>

          <aside class="field-panel" aria-labelledby="field-heading">${renderFieldInspector(structure, selection)}<figure class="source-preview"><figcaption id="field-heading">Source preview <span>· original-file rendering</span></figcaption><img src="${sourceDataUrl()}" alt="A one-pixel PNG Sample rendered as the original file" /></figure></aside>
        </div>
        <footer class="sheet-footer inspector-footer"><span>Inspection: <strong>PNG Sample</strong></span><span>Source preview is not parsed output.</span><span class="footer-local">Local only · no telemetry</span></footer>
      </section>
    </main>
  `;

  mount.querySelectorAll<HTMLElement>('[data-structure-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.structureId;
      const next = inspection.structures.find((item) => item.id === id);
      if (next) renderInspector(inspection, next.span);
    });
  });
  mount.querySelectorAll<HTMLElement>('[data-byte-offset]').forEach((element) => {
    element.addEventListener('click', () => {
      const offset = Number(element.dataset.byteOffset);
      if (Number.isInteger(offset)) renderInspector(inspection, { offset, length: 1 });
    });
  });
  mount.querySelectorAll<HTMLElement>('[data-field-id]').forEach((element) => {
    element.addEventListener('click', () => {
      const id = element.dataset.fieldId;
      const next = structure.fields.find((item) => item.id === id);
      if (next) renderInspector(inspection, next.span);
    });
  });
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
