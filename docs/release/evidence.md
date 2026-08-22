# HexLens release evidence

This is the release record for issue #12. The commands below are reproducible from the repository root. File bytes stay in memory in the browser; the release has no parser service, account flow, telemetry, or error-reporting endpoint.

## Release decision

- Stack: Vite 7 client, TypeScript 5, browser-native `File`, `URL.createObjectURL`, a module Web Worker for local Format parsing, and a dependency-free virtual byte grid. `LocalFileFlow` and `FileJobController` keep worker lifecycle and stale-job suppression outside the render module. The format contract remains the shared Byte-span model in ADR-0001.
- Hosting: GitHub Pages through `.github/workflows/deploy-pages.yml`. `npm run build:pages` emits a `/hexlens/`-prefixed artifact and a `404.html` SPA fallback for `/inspect` deep links.
- Public target: `https://darshmahadevia.github.io/hexlens/`. The ticket branch is intentionally not pushed. A public deployment succeeded from the separate `release-pages` branch at workflow run [32547295493](https://github.com/darshmahadevia/hexlens/actions/runs/32547295493) for commit `a5a8ead`; the environment also permits the integrated `main` branch for the eventual merge deployment. The root returned HTTP 200, and a real browser rendered `/hexlens/inspect?sample=png` from the fallback body. Static GitHub Pages returns HTTP 404 for that deep-link response even though the SPA renders; this is the remaining hosting evidence limitation.
- Scope: PNG and WAV only. The release does not claim ZIP, ELF, RF64, WAVE_FORMAT_EXTENSIBLE, compressed WAV codecs, PNG pixel decoding, arbitrary phone-file inspection, or server parsing.

## Thresholds fixed before the final run

The release policy is recorded in [thresholds.json](./thresholds.json) before the final verification commands. The 100,000-Structure provisional value was replaced with 50,000 after a bounded stress profile showed materially lower semantic-heap growth at the smaller cap. The 25 MiB byte cap, 1,000 Diagnostic cap, two-second slow notice, and 250 ms cancellation deadline were affirmed.

## Performance, memory, and safety profile

Run with `npm run profile:release`. The script profiles project-owned representative fixtures, all declared PNG chunks, metadata WAV, 50,000-Structure adversarial inputs, 1,000-Diagnostic adversarial inputs, and a 25 MiB + 1 byte size cap. It records parse time, structure count, Diagnostic count, completion state, and Node memory deltas. The final recorded run was `2026-08-22T03:23:15Z`.

| Case | Size | Parse time | Structures | Diagnostics | Result | Memory observation |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| PNG Sample | 68 B | 0.776 ms | 4 | 0 | ready | 0.10 MiB heap delta |
| PNG declared-chunk fixture | 253 B | 0.482 ms | 12 | 1 | ready | 0.20 MiB heap delta |
| PNG 50,000-Structure cap | 650,149 B | 143.141 ms | 50,000 | 2 | limit-reached | 89.6 MiB heap delta; 152.3 MiB RSS allocator delta |
| PNG 1,000-Diagnostic cap | 13,149 B | 2.827 ms | 1,002 | 1,000 | limit-reached | 6.8 MiB heap delta |
| PNG size cap | 26,214,401 B | 3.778 ms | 1 | 1 | limit-reached | input remains bounded to the cap-plus-one read |
| WAV Sample | 52 B | 0.674 ms | 3 | 0 | ready | 0.07 MiB heap delta |
| WAV metadata fixture | 160 B | 0.424 ms | 10 | 0 | ready | 0.27 MiB heap delta |
| WAV 50,000-Structure cap | 500,126 B | 71.598 ms | 50,000 | 1 | limit-reached | 98.8 MiB heap delta; 19.6 MiB RSS allocator delta |
| WAV 1,000-Diagnostic cap | 10,102 B | 9.631 ms | 1,001 | 1,000 | limit-reached | 11.1 MiB heap delta |
| WAV size cap | 26,214,401 B | 1.905 ms | 1 | 1 | limit-reached | input remains bounded to the cap-plus-one read |

The profile stays under the pre-recorded 50/100/500/250/100 ms parse budgets and the 128 MiB semantic-heap budget. RSS deltas include the Node allocator and are reported separately rather than mistaken for retained semantic objects. The 50,000-Structure cap is intentionally conservative for a client-only browser.

Cancellation uses `FileJobController` with the release values. The slow callback arrived at about 2,002 ms, Abort was acknowledged at about 2,032 ms, and the bounded termination callback arrived about 251 ms after Abort. Local Format parsing runs in `inspection-worker.ts`, so slow notice, Abort, replacement, and hard termination remain available on the interface thread. Cooperative abort is signal-checked by the parser; the deadline can terminate the worker, and replacement terminates the stale worker before starting the next job. The controller's stale-job tests prove that a superseded result cannot publish into the active Inspection. Worker startup/termination is not separately profiled in this release; the lifecycle contract and browser journeys are the evidence boundary.

The virtual byte grid mounts a bounded overscan window. `npm run audit:release` verifies no more than 12 row elements in the DOM, a spacer representing the full file, an accessible grid row count, and a persistent selected-span summary. Existing browser coverage also verifies go-to-offset, keyboard movement, Selection retention, and reduced motion.

## Privacy and network audit

The release network test in `tests/browser/release-audit.spec.ts` starts request capture before opening `/inspect?sample=png`, selects a local PNG under the hostile name `private/<script>alert(1)</script> report.wav`, and checks the resulting local Inspection. No request URL contains the filename, MIME type, Diagnostic text, offset, size, or exception-like content. The URL is `/inspect` with no local identity. `localStorage` and `sessionStorage` remain empty.

The static-code audit found no `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, WebSocket, telemetry, or error-reporting integration. The only runtime URL creation is for local preview blobs and deterministic `data:` Sample previews, both revoked or kept in memory. GitHub Pages serves only the built static assets. Native image/audio playback is explicitly labeled as original-file Source preview and does not send the selected local file to HexLens.

## Browser and accessibility evidence

The Chromium desktop project is the supported automated desktop target for this release. `npm run test:browser` covers the following journeys:

| Journey | Evidence |
| --- | --- |
| PNG and WAV Samples | `sample.spec.ts`, `wav-sample.spec.ts` |
| Local replacement and URL/privacy behavior | `local-png.spec.ts`, `release-audit.spec.ts` |
| Malformed, unsupported raw-byte Inspection, hostile filename, and Source-preview failure | `png-contract.spec.ts`, `wav-contract.spec.ts`, `safety.spec.ts` |
| Abort, slow notice, stale replacement | `safety.spec.ts` plus `tests/file-session.test.ts` |
| Keyboard, focus retention, live announcements, reduced motion | `accessibility.spec.ts` |
| Virtualization and offset navigation | `byte-grid.spec.ts`, `release-audit.spec.ts` |
| Narrow Sample tabs and Back navigation | `narrow-sample.spec.ts` |

`tests/browser/release-audit.spec.ts` runs Axe against the landing and PNG/WAV Sample surfaces at desktop and narrow widths. The recorded threshold is zero serious or critical violations. Keyboard tests keep semantic focus after Selection updates, and the screen-reader smoke test checks the debounced selected-span live region and immediate operation-failure live region. A physical VoiceOver/NVDA session was not available in this headless run; the DOM/live-region smoke test is the documented limitation.

## Two-minute fresh-session walkthrough

1. Open a fresh private browser session at `/` with no account.
2. Read `Read the file. See the structure.` and the visible PNG tracer.
3. Select `IHDR · image header` or the byte at offset `0C`; confirm the oxide selection and Field note change together.
4. Activate `Try the sample`; confirm `/inspect?sample=png` opens a real Sample Inspection.
5. Select the PNG signature, then `IHDR`, and read offset/length in the selected-span summary.
6. Use `Back to landing` to return without a login or persisted file.

This is a scripted acceptance walkthrough, not a measured user-behavior claim.

## Sample provenance and exclusions

- `public/samples/hexlens-1x1.png` is the project-owned deterministic 1×1 PNG emitted by `scripts/create-sample.mjs`. Its base64 and expected Structure contract are checked in and contain no user data.
- `src/sample.ts` contains the project-owned deterministic mono PCM WAV Sample: 8-bit, 8 kHz, eight opaque audio Payload bytes. The matching fixture helpers and WAV contract tests are checked in.
- `src/assets/paper-texture.webp` is a project-owned visual asset with its generation prompt and timestamp recorded in `src/assets/paper-texture.webp.json`; it contains no text or personal data.
- Excluded from this release: accounts, uploads, persistence, telemetry, server parsing, editing/export, PNG pixel decoding, audio decoding/waveforms, semantic parsing for unsupported Formats (their bounded raw-byte Inspection remains available), RF64/WAVE_FORMAT_EXTENSIBLE, and arbitrary local-file inspection on phones.

## Impeccable finish evidence

The required route briefs and direction contract were read through `context.mjs` and `surface-brief.mjs`. The bounded visual round uses the captures in `.impeccable/review/` for landing, desktop inspector, narrow Sample inspector, empty state, and failure state. The detector was run once after the final UI changes across `index.html`, `src/main.ts`, and `src/styles.css`; its optional HTML parser modules were unavailable in this worktree, so it used the documented regex fallback and reported only advisory type/radius scale findings, with no primary UI findings. The finish disposition is recorded in `.impeccable/finish-review.md`, while the post-correction documenter update is recorded in `DESIGN.md` and `.impeccable/design.json`. The documenter pass preserves the Conservation Workbench tokens and does not canonize any temporary audit artifact as product UI.

| Surface | Capture | Viewport / extent | Result |
| --- | --- | --- | --- |
| Landing desktop | `.impeccable/review/desktop.png` | 1280×720 viewport | valid bounded capture |
| Landing narrow | `.impeccable/review/mobile.png` | 390×844 viewport | valid bounded capture |
| Desktop Sample Inspector | `.impeccable/review/desktop-inspect.png` | 1280×1200 full page | pass |
| Narrow Sample Inspector | `.impeccable/review/mobile-inspect.png` | 390×1009 full page | pass |
| Empty Inspector | `.impeccable/review/empty-desktop.png` | 1280×999 full page | pass |
| Unsupported/failure recovery | `.impeccable/review/failure-desktop.png` | 1280×1302 full page | pass |

The landing full-page request was discarded because the browser compositor duplicated the continuation; the valid desktop and narrow viewport captures above are the release evidence for that surface. The other route states rendered without that artifact.
