# HexLens release evidence

This is the release record for issue #12. The commands below are reproducible from the repository root. File bytes stay in memory in the browser; the release has no parser service, account flow, telemetry, or error-reporting endpoint.

## Release decision

- Stack: Vite 7 client, TypeScript 5, browser-native `File`, `URL.createObjectURL`, a module Web Worker for local Format parsing, and a dependency-free virtual byte grid. `routing.ts`, `byte-grid-view.ts`, and `narrow-navigation.ts` own route, virtualization, and tab/accessibility seams; `LocalFileFlow` and `FileJobController` keep worker lifecycle and stale-job suppression outside the render module; `structure-tree.ts` and `field-inspector.ts` keep semantic rendering responsibilities out of the route/lifecycle module. The format contract remains the shared Byte-span model in ADR-0001.
- Hosting: Vercel through `vercel.json`. Vercel runs `npm run build`, serves `dist`, and rewrites app routes to `index.html` so `/inspect` deep links reach the client router.
- Public target: `https://hexlens-five.vercel.app/`. The production root and `/inspect?sample=png` deep link both returned HTTP 200 after deployment.
- Scope: PNG and WAV only. The release does not claim ZIP, ELF, RF64, WAVE_FORMAT_EXTENSIBLE, compressed WAV codecs, PNG pixel decoding, arbitrary phone-file inspection, or server parsing.

## Thresholds fixed before the final run

The release policy is recorded in [thresholds.json](./thresholds.json) before the final verification commands. The 100,000-Structure provisional value was replaced with 50,000 after a bounded stress profile showed materially lower semantic-heap growth at the smaller cap. The 25 MiB byte cap, 1,000 Diagnostic cap, two-second slow notice, and 250 ms cancellation deadline were affirmed.

## Performance, memory, and safety profile

Run with `npm run profile:release`. The script profiles project-owned representative fixtures, all declared PNG chunks, metadata WAV, 50,000-Structure adversarial inputs, 1,000-Diagnostic adversarial inputs, and a 25 MiB + 1 byte size cap. It records parse time, structure count, Diagnostic count, completion state, and Node memory deltas. The final recorded run was `2026-08-22T03:51:05Z`.

| Case | Size | Parse time | Structures | Diagnostics | Result | Memory observation |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| PNG Sample | 68 B | 0.704 ms | 4 | 0 | ready | 0.13 MiB heap delta |
| PNG declared-chunk fixture | 253 B | 0.525 ms | 12 | 1 | ready | 0.24 MiB heap delta |
| PNG 50,000-Structure cap | 650,149 B | 145.718 ms | 50,000 | 2 | limit-reached | 92.9 MiB heap delta; 153.1 MiB RSS allocator delta |
| PNG 1,000-Diagnostic cap | 13,149 B | 3.313 ms | 1,002 | 1,000 | limit-reached | 6.8 MiB heap delta |
| PNG size cap | 26,214,401 B | 4.103 ms | 1 | 1 | limit-reached | input remains bounded to the cap-plus-one read |
| WAV Sample | 52 B | 0.665 ms | 3 | 0 | ready | 0.07 MiB heap delta |
| WAV metadata fixture | 160 B | 0.442 ms | 10 | 0 | ready | 0.11 MiB heap delta |
| WAV 50,000-Structure cap | 500,126 B | 74.171 ms | 50,000 | 1 | limit-reached | 98.7 MiB heap delta; 19.5 MiB RSS allocator delta |
| WAV 1,000-Diagnostic cap | 10,102 B | 9.438 ms | 1,001 | 1,000 | limit-reached | 11.1 MiB heap delta |
| WAV size cap | 26,214,401 B | 2.043 ms | 1 | 1 | limit-reached | input remains bounded to the cap-plus-one read |

The profile stays under the pre-recorded 50/100/500/250/100 ms parse budgets and the 128 MiB semantic-heap budget. RSS deltas include the Node allocator and are reported separately rather than mistaken for retained semantic objects. The 50,000-Structure cap is intentionally conservative for a client-only browser.

Cancellation uses `FileJobController` with the release values. The slow callback arrived at about 2,002 ms, Abort was acknowledged at about 2,032 ms, and the bounded termination callback arrived about 251 ms after Abort. Local Format parsing runs in `inspection-worker.ts`, so slow notice, Abort, replacement, and hard termination remain available on the interface thread. Cooperative abort is signal-checked by the parser; the deadline can terminate the worker, and replacement terminates the stale worker before starting the next job. The controller's stale-job tests prove that a superseded result cannot publish into the active Inspection. Worker startup/termination is not separately profiled in this release; the lifecycle contract and browser journeys are the evidence boundary.

The virtual byte grid mounts a bounded overscan window. `npm run audit:release` verifies no more than 12 row elements in the DOM, a spacer representing the full file, an accessible grid row count, and a persistent selected-span summary. Existing browser coverage also verifies go-to-offset, keyboard movement, Selection retention, and reduced motion.

## Privacy and network audit

The release network test in `tests/browser/release-audit.spec.ts` starts request capture before opening `/inspect?sample=png`, selects a local PNG under the hostile name `private/<script>alert(1)</script> report.wav`, and checks the resulting local Inspection. No request URL contains the filename, MIME type, Diagnostic text, offset, size, or exception-like content. The URL is `/inspect` with no local identity. `localStorage` and `sessionStorage` remain empty.

The static-code audit found no `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, WebSocket, telemetry, or error-reporting integration. The only runtime URL creation is for local preview blobs and deterministic `data:` Sample previews, both revoked or kept in memory. Vercel serves only the built static assets. Native image/audio playback is explicitly labeled as original-file Source preview and does not send the selected local file to HexLens.

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
3. Select `IHDR · image header` or the byte at offset `0C`; confirm the cobalt selection and Field note change together.
4. Activate `Try the sample`; confirm `/inspect?sample=png` opens a real Sample Inspection.
5. Select the PNG signature, then `IHDR`, and read offset/length in the selected-span summary.
6. Use `Back to landing` to return without a login or persisted file.

This is a scripted acceptance walkthrough, not a measured user-behavior claim.

## Sample provenance and exclusions

- `public/samples/hexlens-1x1.png` is the project-owned deterministic 1×1 PNG emitted by `scripts/create-sample.mjs`. Its base64 and expected Structure contract are checked in and contain no user data.
- `src/sample.ts` contains the project-owned deterministic mono PCM WAV Sample: 8-bit, 8 kHz, eight opaque audio Payload bytes. The matching fixture helpers and WAV contract tests are checked in.
- `src/assets/paper-texture.webp` is a retained legacy asset with its generation prompt recorded beside it. The current build does not import or ship it.
- Excluded from this release: accounts, uploads, persistence, telemetry, server parsing, editing/export, PNG pixel decoding, audio decoding/waveforms, semantic parsing for unsupported Formats (their bounded raw-byte Inspection remains available), RF64/WAVE_FORMAT_EXTENSIBLE, and arbitrary local-file inspection on phones.

## Impeccable finish evidence

The required route briefs and direction contract were read through `context.mjs` and `surface-brief.mjs`. The bounded visual round covers the landing page and inspector in both themes at desktop and narrow widths. The detector ran once after the final UI changes. Its optional parser modules were unavailable, so it used the documented regex fallback and reported the expected mismatch between the new implementation and the replaced design documentation. The finish reviewer requested one fix: remove the inherited foreground-color transition that briefly reduced contrast during a dark-theme switch. Recaptured mobile evidence resolved the finding, and the final disposition is `ship`. `DESIGN.md` and `.impeccable/design.json` record the new Calibrated Lens Console system.

| Surface | Capture | Viewport / extent | Result |
| --- | --- | --- | --- |
| Landing desktop light | `.impeccable/review/desktop.png` | 1440×1000 viewport | pass |
| Landing narrow dark | `.impeccable/review/mobile.png` | 390×844 viewport | pass after contrast recapture |
| Inspector desktop light | `.impeccable/review/inspect-desktop-light.png` | 1440×1000 viewport | pass |
| Inspector desktop dark | `.impeccable/review/inspect-desktop-dark.png` | 1440×1000 viewport | pass |
| Inspector narrow dark | `.impeccable/review/inspect-mobile.png` | 390×844 viewport | pass after contrast recapture |

The landing full-page request was discarded because the browser compositor duplicated the continuation; the valid desktop and narrow viewport captures above are the release evidence for that surface. The other route states rendered without that artifact.
