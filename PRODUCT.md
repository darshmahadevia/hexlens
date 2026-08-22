# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: a small Vite-powered TypeScript client with a browser-native test runner, chosen because the repository is empty and the first slice needs a fast local development loop without a server parser or runtime service.

## Users

HexLens is for students, recruiters, and engineers who need to understand how a binary file is laid out. They open a small known sample or one local file in a desktop browser and inspect the relationship between raw bytes and the format's named Structures.

## Product Purpose

HexLens makes binary structure legible. A visitor should understand the promise, open a deterministic PNG Sample, and select the PNG signature or IHDR across the Structure tree, byte grid, and Field inspector in about two minutes. File contents stay in memory on the device.

## Positioning

HexLens links format-defined Structures and Fields to exact Byte spans in the original file, so the reader can move between meaning and bytes without treating a decoded preview as the parsed result.

## Operating Context

The first release is a client-only, read-only web application. The landing page lives at `/`; the inspector lives at `/inspect`. A bundled Sample is selected with a deterministic `sample=png` query value. The initial desktop layout has a toolbar, Structure tree, dominant byte grid, and Field inspector.

## Capabilities and Constraints

The first slice supports a project-owned PNG Sample with the signature, IHDR, and IEND Structures. Each Structure exposes Fields and Byte spans through the shared inspection contract from ADR-0001. Structure selection highlights its bytes and shows Field details. Byte selection focuses its matching Field or Structure. The Source preview is an original-file rendering, never parsed output.

The app accepts a Sample in this slice. Local-file input, WAV, malformed-file recovery, and the remaining inspector hardening arrive in later tickets. No parser runs on a server. File bytes, names, and derived details never enter URLs, storage, logs, telemetry, or outgoing requests. Raw PNG content is not decoded into pixels by HexLens.

## Brand Commitments

Use the name HexLens and the domain vocabulary in `CONTEXT.md`: Format, Inspection, Sample file, Source preview, Structure, Byte span, Selection, Field, Payload, Unmapped span, Derived value, and Diagnostic. The page must name only PNG and WAV as supported Formats when coverage copy expands beyond this slice.

## Evidence on Hand

The product specification in GitHub issue #1 and the accepted PNG Sample contract in issue #2 are the source of truth. No customer quotes, usage metrics, logos, or commercial claims are available. Do not invent them.

## Product Principles

- Keep the file local and the promise visible.
- Connect every semantic claim to an exact Byte span.
- Show the original rendering as a Source preview, never as parsed output.
- Preserve the smallest complete path before adding breadth.

## Accessibility & Inclusion

The product must be keyboard accessible, preserve DOM focus when Selection changes, expose compact selected-span summaries, distinguish ownership without color alone, and respect reduced-motion preferences. The first slice should provide labeled controls and semantic relationships that later accessibility work can extend.
