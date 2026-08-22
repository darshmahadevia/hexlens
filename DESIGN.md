---
name: HexLens
description: A local conservation workbench for reading binary structure.
colors:
  paper: "#f2ead8"
  paper-deep: "#e6dac1"
  paper-quiet: "#ece2ce"
  outer-field: "#d5c9b2"
  ink: "#1d2826"
  ink-soft: "#53605b"
  rule: "rgba(29, 40, 38, 0.42)"
  oxide: "#a94f39"
  oxide-dark: "#813523"
  verdigris: "#39756b"
  focus: "#155e55"
  paper-light: "#fffaf0"
typography:
  display:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "clamp(3.2rem, 5.3vw, 5.5rem)"
    fontWeight: 500
    lineHeight: 0.92
    letterSpacing: "-0.055em"
  body:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "1rem"
    lineHeight: 1.45
  label:
    fontFamily: "SFMono-Regular, Cascadia Code, Roboto Mono, ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.08em"
rounded:
  none: "0"
  micro: "1px"
  circle: "50%"
spacing:
  hairline: "1px"
  compact: "8px"
  control: "14px"
  panel: "30px"
  frame: "clamp(34px, 6vw, 92px)"
components:
  button-primary:
    backgroundColor: "{colors.oxide}"
    textColor: "{colors.paper-light}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "13px 24px"
    height: "52px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "13px 24px"
    height: "52px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.frame}"
  selection-span:
    backgroundColor: "{colors.oxide}"
    textColor: "{colors.paper-light}"
    rounded: "{rounded.none}"
    height: "100%"
---

# Design System: HexLens

## Overview

**Creative North Star: “The Conservation Workbench”**

HexLens treats a binary file as a carefully labeled artifact on a conservation desk. Warm paper, thin registration rules, editorial serif notes, and compact measured data make the byte-to-Structure relationship feel precise without turning the interface into a terminal or a generic dashboard. The app stays flat and quiet: its material comes from paper grain, ink, and annotation rather than floating cards or shadows.

The same grammar runs from the landing specimen sheet to the desktop Sample Inspection: the visitor reads a promise, sees a real PNG tracer, then selects a Byte span and follows its Field note. Oxide marks selected ranges and actions; verdigris signals local status and the selected IHDR family; charcoal carries structure and reading text.

**Key Characteristics:**

- Warm paper field with a subtle authored raster grain.
- Serif reading voice paired with monospace labels, offsets, and values.
- Hairline rules, registration marks, and bracketed Byte spans.
- Rectangular controls and flat tonal depth.

## Colors

The palette is a low-saturation paper-and-ink field with two rare structure accents. Accents are reserved for selection, status, labels, and the primary action so the byte grid remains readable.

### Primary

- **Oxide** (`#a94f39`): Primary action, selected Byte spans, and the signature family of Structure labels.
- **Verdigris** (`#39756b`): Local-only status, IHDR family cues, and secondary structural emphasis.

### Secondary

- **Oxide Dark** (`#813523`): Text-safe oxide for labels, metadata, rules, and hover states.
- **Focus Teal** (`#155e55`): High-contrast keyboard focus outline.

### Neutral

- **Conservation Paper** (`#f2ead8`): The sheet surface.
- **Deep Paper** (`#e6dac1`): Tonal paper variation when a surface needs separation.
- **Quiet Paper** (`#ece2ce`): Reserved quiet surface tone.
- **Outer Field** (`#d5c9b2`): The browser-edge field around the sheet.
- **Charcoal Ink** (`#1d2826`): Primary reading text and structural rules.
- **Soft Ink** (`#53605b`): Supporting prose, captions, and metadata.
- **Paper Light** (`#fffaf0`): Text on the oxide action and selected cells.
- **Rule** (`rgba(29, 40, 38, 0.42)`): Hairline dividers and registration geometry.

### Named Rules

**The Rare Accent Rule.** Oxide and verdigris mark meaning or state; they do not decorate every surface.

## Typography

**Display Font:** Iowan Old Style with Palatino Linotype, Palatino, and Georgia fallbacks.

**Body Font:** The same editorial serif stack keeps explanatory prose continuous with the display voice.

**Label/Mono Font:** SFMono-Regular with Cascadia Code, Roboto Mono, and ui-monospace fallbacks.

**Character:** The serif is literary and measured, with a compact large headline silhouette. Monospace is reserved for labels, offsets, byte values, metadata, and status so technical information has a dependable rhythm.

### Hierarchy

- **Display** (500, `clamp(3.2rem, 5.3vw, 5.5rem)`, `0.92` line-height, `-0.055em` tracking): Landing promise, with each sentence on its own line at wide widths.
- **Headline** (500, `clamp(3.2rem, 6vw, 6rem)`, `0.92` line-height): Empty and large sheet states.
- **Title** (500, `clamp(1.35rem, 2vw, 2.2rem)`, `1` line-height): Inspector toolbar title.
- **Body** (regular, roughly `0.9rem–1.58rem`, `1.4–1.52` line-height): Explanatory copy and Field notes, constrained by readable measure.
- **Label** (regular, `0.6rem–0.8rem`, uppercase where it names a panel, with `0.04–0.1em` tracking): Byte values, offsets, metadata, buttons, status, and captions.

### Named Rules

**The Two-Voice Rule.** Serif carries the human explanation; monospace carries measurements and state. Do not reverse those jobs without a strong content reason.

## Layout

The outer `.app-shell` centers one `.sheet-frame` and uses a `clamp(18px, 3.5vw, 48px)` browser-edge padding. Sheets are capped at `1480px`, carry a 1px border, and keep a 14px inset registration rule. The landing surface opens with a two-column grid (`0.77fr / 1.23fr`) with a left promise and right selectable PNG tracer, then continues as four connected beats: the live specimen, a span-mechanism ledger, a bounded PNG/WAV coverage ledger, and a local-only close. These beats use rules and measured ledgers instead of cards. The inspector uses three flexible columns for Structure tree, dominant Bytes, and Field inspector, with the middle panel receiving the widest measure.

Spacing is ruled rather than card-based: panel headings, byte rows, fields, and footer regions are separated by hairlines and measured gaps. At `1120px`, the masthead simplifies; at `900px`, the landing stacks and inspector Field inspector moves below the first two panes; at `620px`, controls become full width, the landing remains a readable vertical sheet, and the inspector becomes a stacked Sample view. The byte grid preserves its 16-byte row rhythm and uses an internal narrow-screen scroll only where the inspector's desktop-width grid cannot be compressed without losing byte identity.

## Elevation & Depth

This is a flat-by-default system with no box shadows. Depth comes from the paper grain raster, the warm outer field, 1px rules, tonal background changes, and sparse registration geometry. Selection is a color-and-bracket state, not a lift effect. Hover uses a short color or 2px translation response, and reduced-motion preferences collapse transitions to an immediate update.

### Named Rules

**The Flat Workbench Rule.** Use material, rule, and state contrast to establish depth; do not turn the sheet into a stack of floating cards.

## Shapes

Most surfaces and controls are square: the form language is an annotated sheet, not a rounded application shell. Borders are generally 1px, with 2px reserved for the short oxide rule and the selection marker. Circles are reserved for registration marks and the small footer stamp. The authored lock mark and bracket are geometric, not font glyphs.

## Components

### Buttons

- **Shape:** Square, 1px border, `0` radius.
- **Primary:** Oxide fill with paper-light text, monospace uppercase label, `13px 24px` padding, and a 52px minimum height.
- **Hover / Focus:** Primary darkens to Oxide Dark and lifts 2px on hover; all controls use a 3px Focus Teal outline with a 4px offset.
- **Secondary:** Transparent paper field with charcoal border; disabled `Open a file` remains quiet and keeps its intent visible.

### Cards / Containers

- **Sheet:** One flat paper container with an outer 1px rule and an inset registration rule; use a sheet for a coherent surface rather than a collection of cards.
- **Panel:** Inspector panes remain transparent on the sheet and divide with hairlines.
- **Internal Padding:** Landing and toolbar padding use the responsive frame scale; inspector panels use roughly `20px–40px` horizontal padding.

### Inputs / Fields

- **Style:** Field rows and Structure rows are semantic buttons with transparent backgrounds, 1px rules, and compact labels. They do not mimic form inputs.
- **Focus:** The shared Focus Teal outline is visible for keyboard interaction; selected rows use an oxide tint and a thin oxide edge.
- **Selection:** The Field inspector always names the selected label, Byte span, encoded bytes, interpreted value, and representation when supported.

### Navigation

- **Landing:** The HexLens wordmark returns home; `Try the sample` is the single strong route into the Sample Inspection.
- **Inspector:** A small monospace `Back to landing` link sits above the workbench. Sample identity and byte count stay visible in the toolbar.

### Byte Grid and Span Bracket

The byte grid uses 16-byte rows, uppercase two-digit values, uppercase zero-padded offsets, and a printable-ASCII gutter where space allows. A selected Structure or byte paints the matching cells oxide and draws a thin oxide bracket around the exact span. The Structure list and Field inspector update from the same Byte span model.

### Source Preview

The Source preview is explicitly labeled as the original-file rendering. For the PNG Sample it is a tiny native image rendering, visually subordinate to the parsed Structure and Field data; it is never described as parser output.

## Do's and Don'ts

### Do:

- **Do** keep a real Sample, its exact Byte spans, and the primary action visible early.
- **Do** use serif for explanation and monospace for technical measurements.
- **Do** use oxide and verdigris as semantic signals, with non-color rules and labels alongside them.
- **Do** preserve the warm paper grain and hairline registration language across new surfaces.
- **Do** label original-file Source previews so browser rendering cannot be mistaken for parsed output.

### Don't:

- **Don't** turn the workbench into a dashboard of rounded cards, metric tiles, or terminal chrome.
- **Don't** add gradients, box shadows, or decorative accent fields that compete with the selected span.
- **Don't** decode opaque Payload content or imply that a Source preview is parser output.
- **Don't** spend the primary accent on every label; selection and local status should remain the brightest signals.
