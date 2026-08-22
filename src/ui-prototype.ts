/**
 * THROWAWAY UI PROTOTYPE.
 * Five full-product directions on the existing route, switchable with ?variant=.
 * The winner must be rewritten into production code. Do not merge this module to main.
 */
import './ui-prototype.css';
import { sampleInspection } from './sample.ts';

type VariantKey = 'A' | 'B' | 'C' | 'D' | 'E';
type Surface = 'landing' | 'inspect';
type Theme = 'light' | 'dark';

interface PrototypeState {
  variant: VariantKey;
  surface: Surface;
  theme: Theme;
  structureIndex: number;
}

const sample = sampleInspection();
const variants: Array<{ key: VariantKey; name: string; thesis: string }> = [
  { key: 'A', name: 'Live Canvas', thesis: 'The file itself fills the first screen.' },
  { key: 'B', name: 'Editorial Split', thesis: 'One hard divide separates promise from proof.' },
  { key: 'C', name: 'Horizon Bands', thesis: 'Meaning unfolds as a calm sequence of horizontal layers.' },
  { key: 'D', name: 'Focus Room', thesis: 'One instrument sits alone in a spacious room.' },
  { key: 'E', name: 'Index Rail', thesis: 'A narrow index controls one large inspection stage.' },
];

const iconSun = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"></path></svg>`;
const iconMoon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.4A8.5 8.5 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z"></path></svg>`;
const iconArrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>`;

function selected(state: PrototypeState) {
  return sample.structures[state.structureIndex] ?? sample.structures[0];
}

function byteMap(state: PrototypeState, count = sample.bytes.length): string {
  const span = selected(state).span;
  return `<div class="p-byte-map" role="grid" aria-label="PNG byte map">${Array.from(sample.bytes.slice(0, count), (value, offset) => {
    const active = offset >= span.offset && offset < span.offset + span.length;
    return `<button class="p-byte${active ? ' is-active' : ''}" type="button" data-byte="${offset}" aria-label="Byte ${value.toString(16).padStart(2, '0').toUpperCase()} at offset ${offset}">${value.toString(16).padStart(2, '0').toUpperCase()}</button>`;
  }).join('')}</div>`;
}

function structureNav(state: PrototypeState, compact = false): string {
  return `<div class="p-structures${compact ? ' is-compact' : ''}">${sample.structures.map((structure, index) => `<button type="button" data-structure="${index}" class="p-structure${index === state.structureIndex ? ' is-active' : ''}"><span>${structure.span.offset.toString(16).padStart(2, '0').toUpperCase()}–${(structure.span.offset + structure.span.length - 1).toString(16).padStart(2, '0').toUpperCase()}</span><strong>${structure.label}</strong><small>${structure.span.length} bytes</small></button>`).join('')}</div>`;
}

function fieldReadout(state: PrototypeState): string {
  const structure = selected(state);
  const field = structure.fields[0];
  return `<div class="p-field"><span class="p-field-label">Selected structure</span><h3>${structure.label}</h3><p>${structure.description}</p><dl><div><dt>Byte span</dt><dd>${structure.span.offset}–${structure.span.offset + structure.span.length - 1}</dd></div><div><dt>Length</dt><dd>${structure.span.length} bytes</dd></div><div><dt>First field</dt><dd>${field?.label ?? 'Opaque payload'}</dd></div><div><dt>Value</dt><dd>${field?.value ?? 'Not decoded'}</dd></div></dl></div>`;
}

function action(label = 'Inspect the PNG sample'): string {
  return `<button class="p-primary" type="button" data-surface="inspect">${label}${iconArrow}</button>`;
}

function localMark(): string {
  return `<span class="p-local"><i></i>Files stay in this browser</span>`;
}

function VariantA(state: PrototypeState): string {
  if (state.surface === 'inspect') return `<main class="a-inspector p-screen"><header><div><span>hexlens / sample.png</span><h1>Follow meaning through the file.</h1></div>${localMark()}</header><div class="a-inspect-grid"><aside><h2>Structures</h2>${structureNav(state)}</aside><section class="a-data"><div class="p-data-head"><span>0000</span><strong>68-byte PNG</strong><span>16 bytes / row</span></div>${byteMap(state)}</section><aside>${fieldReadout(state)}</aside></div></main>`;
  return `<main class="a-canvas p-screen"><section class="a-copy"><h1>The file is the interface.</h1><p>HexLens ties every named Structure to the exact bytes that support it.</p><div>${action()}<button class="p-secondary" type="button">Open a local file</button></div>${localMark()}</section><section class="a-live"><div class="a-live-head"><span>sample.png</span><strong>Live byte map</strong><span>68 bytes</span></div>${byteMap(state)}${structureNav(state, true)}${fieldReadout(state)}</section></main>`;
}

function VariantB(state: PrototypeState): string {
  if (state.surface === 'inspect') return `<main class="b-inspector p-screen"><aside class="b-index"><span>sample.png</span><h1>Inspect</h1>${structureNav(state)}${localMark()}</aside><section class="b-work"><header><span>PNG / 68 bytes</span><strong>${selected(state).label}</strong></header><div class="b-map">${byteMap(state)}</div><div class="b-detail">${fieldReadout(state)}<p class="b-note">Source preview is the original file rendering, never parsed output.</p></div></section></main>`;
  return `<main class="b-editorial p-screen"><section class="b-manifesto"><a class="p-wordmark" href="?variant=B&surface=landing&theme=${state.theme}">HexLens</a><h1>Read the file.<br>See its structure.</h1><p>PNG and WAV inspection that runs entirely in your browser.</p>${action('Try the sample')}</section><section class="b-proof"><div class="b-proof-title"><span>One selection</span><strong>${selected(state).label}</strong><span>${selected(state).span.length} bytes</span></div>${byteMap(state, 48)}${structureNav(state, true)}<footer>${localMark()}<span>No upload. No account.</span></footer></section></main>`;
}

function VariantC(state: PrototypeState): string {
  if (state.surface === 'inspect') return `<main class="c-inspector p-screen"><section class="c-inspect-band c-summary"><span>sample.png / PNG / 68 bytes</span><h1>${selected(state).label}</h1><p>${selected(state).description}</p></section><section class="c-inspect-band c-structure-band"><h2>Structure</h2>${structureNav(state, true)}</section><section class="c-inspect-band c-byte-band"><div><h2>Bytes</h2><span>Exact source order</span></div>${byteMap(state)}</section><section class="c-inspect-band c-field-band"><h2>Field</h2>${fieldReadout(state)}${localMark()}</section></main>`;
  return `<main class="c-bands p-screen"><section class="c-band c-hero"><div><a class="p-wordmark" href="?variant=C&surface=landing&theme=${state.theme}">HexLens</a><h1>Binary files,<br>made legible.</h1></div><div><p>Select a Structure. See its exact bytes. Read what those bytes mean.</p>${action()}</div></section><section class="c-band c-ribbon"><span>Structure</span>${structureNav(state, true)}</section><section class="c-band c-bytes"><span>Bytes</span>${byteMap(state, 48)}</section><section class="c-band c-meaning"><span>Meaning</span>${fieldReadout(state)}</section><footer class="c-band">${localMark()}<span>PNG and WAV</span><span>Local, read-only inspection</span></footer></main>`;
}

function VariantD(state: PrototypeState): string {
  if (state.surface === 'inspect') return `<main class="d-inspector p-screen"><div class="d-orbit d-orbit-left"><span>Structures</span>${structureNav(state, true)}</div><section class="d-instrument"><header><span>sample.png</span><strong>Byte map</strong><span>68 bytes</span></header>${byteMap(state)}${fieldReadout(state)}</section><div class="d-orbit d-orbit-right"><span>Selection</span><strong>${selected(state).label}</strong><small>${selected(state).span.length} bytes</small>${localMark()}</div></main>`;
  return `<main class="d-room p-screen"><header><a class="p-wordmark" href="?variant=D&surface=landing&theme=${state.theme}">HexLens</a>${localMark()}</header><section class="d-statement"><h1>Look closer.</h1><p>A private, exact view of the structures inside PNG and WAV files.</p>${action('Enter the sample')}</section><section class="d-object"><div class="d-object-top"><span>PNG / 68 bytes</span><strong>${selected(state).label}</strong></div>${byteMap(state, 48)}${structureNav(state, true)}</section></main>`;
}

function VariantE(state: PrototypeState): string {
  if (state.surface === 'inspect') return `<main class="e-shell p-screen"><aside class="e-rail"><a class="p-wordmark" href="?variant=E&surface=landing&theme=${state.theme}">HL</a><button class="is-active" type="button">Map</button><button type="button">Fields</button><button type="button">Source</button><span>${localMark()}</span></aside><section class="e-inspect-stage"><header><div><span>sample.png</span><h1>${selected(state).label}</h1></div><strong>${selected(state).span.length} bytes selected</strong></header><div class="e-stage-grid"><div>${byteMap(state)}</div><aside>${structureNav(state)}${fieldReadout(state)}</aside></div></section></main>`;
  return `<main class="e-shell p-screen"><aside class="e-rail"><a class="p-wordmark" href="?variant=E&surface=landing&theme=${state.theme}">HL</a><button class="is-active" type="button">Start</button><button type="button">Formats</button><button type="button">Privacy</button><span>${localMark()}</span></aside><section class="e-landing-stage"><div class="e-stage-copy"><h1>Every byte has a place.</h1><p>HexLens maps a binary file into Structures, Fields, and exact source spans.</p>${action('Open the live sample')}</div><div class="e-stage-demo"><header><span>sample.png</span><strong>${selected(state).label}</strong></header>${byteMap(state, 48)}${structureNav(state, true)}${fieldReadout(state)}</div></section></main>`;
}

function chrome(state: PrototypeState): string {
  return `<header class="p-chrome"><a class="p-brand" href="?variant=${state.variant}&surface=landing&theme=${state.theme}"><span></span>HexLens</a><nav aria-label="Prototype surface"><button type="button" data-surface="landing" class="${state.surface === 'landing' ? 'is-active' : ''}">Landing</button><button type="button" data-surface="inspect" class="${state.surface === 'inspect' ? 'is-active' : ''}">Inspector</button></nav><button class="p-theme" type="button" data-theme="${state.theme === 'light' ? 'dark' : 'light'}" aria-label="Switch to ${state.theme === 'light' ? 'dark' : 'light'} theme">${state.theme === 'light' ? iconMoon : iconSun}</button></header>`;
}

function switcher(state: PrototypeState): string {
  const meta = variants.find((item) => item.key === state.variant)!;
  return `<div class="p-switcher" role="region" aria-label="Prototype variants"><button type="button" data-cycle="-1" aria-label="Previous variant">${iconArrow}</button><div><strong>${state.variant} · ${meta.name}</strong><span>${state.surface} / ${state.theme} / ${selected(state).label}</span></div><button type="button" data-cycle="1" aria-label="Next variant">${iconArrow}</button></div>`;
}

function parseState(): PrototypeState {
  const params = new URLSearchParams(window.location.search);
  const rawVariant = params.get('variant')?.toUpperCase();
  const variant = variants.some((item) => item.key === rawVariant) ? rawVariant as VariantKey : 'A';
  const surface = params.get('surface') === 'inspect' ? 'inspect' : 'landing';
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  const structureIndex = Math.max(0, Math.min(sample.structures.length - 1, Number(params.get('selection') ?? 0) || 0));
  return { variant, surface, theme, structureIndex };
}

function writeState(state: PrototypeState): void {
  const params = new URLSearchParams();
  params.set('variant', state.variant);
  params.set('surface', state.surface);
  params.set('theme', state.theme);
  params.set('selection', String(state.structureIndex));
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

export function mountUiPrototype(mount: HTMLDivElement): void {
  let state = parseState();

  const render = () => {
    const components: Record<VariantKey, (value: PrototypeState) => string> = { A: VariantA, B: VariantB, C: VariantC, D: VariantD, E: VariantE };
    document.documentElement.dataset.prototypeTheme = state.theme;
    mount.innerHTML = `<div class="prototype-root variant-${state.variant.toLowerCase()} theme-${state.theme}">${chrome(state)}${components[state.variant](state)}${switcher(state)}</div>`;
    writeState(state);
  };

  mount.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const surface = target?.closest<HTMLElement>('[data-surface]')?.dataset.surface as Surface | undefined;
    const theme = target?.closest<HTMLElement>('[data-theme]')?.dataset.theme as Theme | undefined;
    const cycle = Number(target?.closest<HTMLElement>('[data-cycle]')?.dataset.cycle ?? 0);
    const structureIndex = Number(target?.closest<HTMLElement>('[data-structure]')?.dataset.structure);
    const byteOffset = Number(target?.closest<HTMLElement>('[data-byte]')?.dataset.byte);
    if (surface) state = { ...state, surface };
    if (theme) state = { ...state, theme };
    if (cycle) {
      const current = variants.findIndex((item) => item.key === state.variant);
      state = { ...state, variant: variants[(current + cycle + variants.length) % variants.length].key };
    }
    if (Number.isInteger(structureIndex)) state = { ...state, structureIndex };
    if (Number.isInteger(byteOffset)) {
      const match = sample.structures.findIndex((structure) => byteOffset >= structure.span.offset && byteOffset < structure.span.offset + structure.span.length);
      if (match >= 0) state = { ...state, structureIndex: match };
    }
    render();
  });

  window.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, [contenteditable]')) return;
    const current = variants.findIndex((item) => item.key === state.variant);
    state = { ...state, variant: variants[(current + (event.key === 'ArrowRight' ? 1 : -1) + variants.length) % variants.length].key };
    render();
  });

  window.addEventListener('popstate', () => { state = parseState(); render(); });
  render();
}
