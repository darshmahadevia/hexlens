import type { ByteSpan, Field, Inspection } from './domain/inspection.ts';
import { spanIntersects, spanLabel } from './domain/inspection.ts';
import {
  fieldValueText,
  formatByte,
  formatOffset,
  type SelectionResolution,
} from './domain/byte-grid.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

function fieldStatusLabel(field: Field): string {
  if (field.status === 'absent') return 'Absent';
  if (field.status === 'opaque') return 'Opaque Payload';
  if (field.status === 'invalid') return 'Invalid value';
  return 'Interpreted';
}

function fieldDisplayValue(field: Field): string {
  if (field.status === 'opaque' || field.status === 'invalid') return `${fieldStatusLabel(field)} · ${formatValue(field.value)}`;
  if (field.status === 'absent') return fieldValueText(field);
  return formatValue(field.value);
}

export function renderSemanticDetail(inspection: Inspection, resolution: SelectionResolution): string {
  const structure = resolution.structure;
  const selectedLabel = resolution.field?.label ?? structure?.label ?? resolution.unmapped?.label ?? 'Unmapped span';
  const relatedFields = resolution.intersectingFields.filter((field) => field.id !== resolution.field?.id);
  const intersecting = relatedFields.length > 0
    ? `<p class="related-fields"><strong>Also intersects</strong> ${relatedFields.map((field) => escapeHtml(field.label)).join(' · ')}</p>`
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
      <h3>${escapeHtml(selectedLabel)}</h3>
      ${resolution.field ? `<p class="detail-explanation">${escapeHtml(resolution.field.explanation)}</p>` : `<p class="detail-explanation">${escapeHtml(structure?.description ?? 'This Byte span is not claimed by a parsed Structure.')}</p>`}
      <button class="inline-focus" type="button" data-focus-bytes aria-label="Focus ${escapeHtml(byteTargetLabel)} in the byte grid">Focus ${escapeHtml(byteTargetLabel)}</button>
      ${intersecting}
      <dl class="field-facts">
        <div><dt>Byte span</dt><dd>${spanLabel(resolution.selection)} <span>offset ${resolution.selection.offset}, ${resolution.selection.length} bytes</span>${resolution.field ? ` <button class="inline-copy" type="button" data-copy-kind="field-offset" data-field-id="${escapeHtml(resolution.field.id)}">Copy offset</button>` : ''}</dd></div>
        ${resolution.field ? `<div><dt>Encoded</dt><dd class="mono">${resolution.field.encodedBytes.map(formatByte).join(' ')} <button class="inline-copy" type="button" data-copy-kind="field-bytes" data-field-id="${escapeHtml(resolution.field.id)}">Copy</button></dd></div><div><dt>${fieldStatusLabel(resolution.field)}</dt><dd>${escapeHtml(fieldDisplayValue(resolution.field))} <button class="inline-copy" type="button" data-copy-kind="field-value" data-field-id="${escapeHtml(resolution.field.id)}">Copy</button></dd></div><div><dt>Representation</dt><dd>${escapeHtml(resolution.field.representation)}${resolution.field.endianness && resolution.field.endianness !== 'n/a' ? ` · ${resolution.field.endianness}` : ''}</dd></div>` : `<div><dt>Ownership</dt><dd>${escapeHtml(resolution.unmapped ? 'Unmapped span' : 'Structure span')}</dd></div>`}
      </dl>
      ${bitDetails}${derivedDetails}${unmappedDetails}${diagnosticDetails}
    </div>`;
}

export function renderFieldInspector(inspection: Inspection, resolution: SelectionResolution): string {
  const structure = resolution.structure ?? inspection.structures[0];
  const fields = structure?.fields.map((field) => {
    const active = resolution.field?.id === field.id || resolution.intersectingFields.some((item) => item.id === field.id);
    const statusLabel = fieldStatusLabel(field);
    const accessibleLabel = `${field.label}, ${statusLabel} Field, bytes ${spanLabel(field.span)}${active ? ', selected' : ''}`;
    return `<button class="field-row${active ? ' is-selected' : ''}" type="button" data-field-id="${escapeHtml(field.id)}" aria-label="${escapeHtml(accessibleLabel)}" aria-controls="selection-summary byte-grid" aria-pressed="${active}" aria-keyshortcuts="Enter Space ArrowDown ArrowUp"> <span class="field-label"><strong>${escapeHtml(field.label)}</strong><small>${spanLabel(field.span)} · ${field.span.length} bytes · ${statusLabel}</small></span><span class="field-value field-value-${statusLabel.toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(fieldDisplayValue(field))}</span></button>`;
  }).join('') ?? '';
  const heading = structure
    ? `<div class="field-structure-heading"><span class="plate-index">${spanLabel(structure.span)}</span><strong>${escapeHtml(structure.label)}</strong></div>`
    : '<p class="field-empty">No parsed Structure claims this Selection.</p>';
  return `<div class="field-inspector" id="field-inspector"><div class="panel-heading"><span id="field-inspector-heading">Field inspector</span><span class="panel-rule" aria-hidden="true"></span></div>${heading}<div class="field-list" aria-labelledby="field-inspector-heading">${fields}</div>${renderSemanticDetail(inspection, resolution)}</div>`;
}
