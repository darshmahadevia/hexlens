import type { ByteSpan, Inspection, Structure } from './domain/inspection.ts';
import { spanIntersects, spanLabel } from './domain/inspection.ts';
import { PNG_TYPED_CHUNK_TYPES } from './format.ts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function structureTag(structure: Structure): string {
  return structure.type !== undefined && !PNG_TYPED_CHUNK_TYPES.has(structure.type)
    ? 'Unknown chunk'
    : structure.kind === 'payload' ? 'Payload' : structure.kind === 'header' ? 'Header' : 'Structure';
}

/** Render source-ordered Structures as a containment tree keyed by parentId. */
export function renderStructureTree(inspection: Inspection, selection?: ByteSpan, interactive = false, dataPrefix = ''): string {
  const knownIds = new Set(inspection.structures.map((structure) => structure.id));
  const groups = new Map<string, Structure[]>();
  for (const structure of inspection.structures) {
    const parentKey = structure.parentId && knownIds.has(structure.parentId) ? structure.parentId : '';
    const siblings = groups.get(parentKey) ?? [];
    siblings.push(structure);
    groups.set(parentKey, siblings);
  }

  const renderGroup = (parentKey: string, depth: number): string => (groups.get(parentKey) ?? []).map((structure) => {
    const active = selection ? spanIntersects(structure.span, selection) : false;
    const tag = structureTag(structure);
    const diagnosticMarker = structure.diagnosticCodes?.length
      ? `<span class="structure-diagnostics" data-testid="structure-diagnostics">Diagnostic: ${escapeHtml(structure.diagnosticCodes.join(' · '))}</span>`
      : '';
    const content = `<span class="structure-index">${spanLabel(structure.span)}</span><span class="structure-copy"><strong>${escapeHtml(structure.label)}</strong><small>${tag} · ${structure.span.length} bytes</small>${diagnosticMarker}</span>`;
    const accessibleLabel = `${structure.label}, ${tag}, bytes ${spanLabel(structure.span)}${active ? ', selected' : ''}${structure.diagnosticCodes?.length ? `, Diagnostics ${structure.diagnosticCodes.join(', ')}` : ''}`;
    const row = interactive
      ? `<button class="structure-row${active ? ' is-selected' : ''}" type="button" data-${dataPrefix}structure-id="${escapeHtml(structure.id)}" data-structure-depth="${depth}" aria-label="${escapeHtml(accessibleLabel)}" aria-controls="${dataPrefix ? 'landing-selection-summary' : 'field-inspector selection-summary'}" aria-pressed="${active}" aria-keyshortcuts="Enter Space ArrowDown ArrowUp">${content}</button>`
      : `<div class="structure-row${active ? ' is-selected' : ''}">${content}</div>`;
    const children = groups.has(structure.id)
      ? `<div class="structure-children" data-structure-children="${escapeHtml(structure.id)}" role="group">${renderGroup(structure.id, depth + 1)}</div>`
      : '';
    return `<div class="structure-node" data-structure-node="${escapeHtml(structure.id)}">${row}${children}</div>`;
  }).join('');

  return renderGroup('', 1);
}
