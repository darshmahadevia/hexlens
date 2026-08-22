---
name: HexLens
description: An editorial byte map that makes binary structure readable, exact, and local.
colors:
  canvas: "#f5f1e9"
  canvas-dark: "#17130f"
  paper: "#fffdf8"
  paper-dark: "#211c17"
  paper-deep: "#eee7dc"
  paper-deep-dark: "#120f0c"
  paper-quiet: "#f5f1e9"
  paper-quiet-dark: "#2b241d"
  ink: "#15130f"
  ink-dark: "#faf4e9"
  ink-soft: "#6d665c"
  ink-soft-dark: "#b9afa0"
  rule: "rgba(21, 19, 15, 0.15)"
  rule-dark: "rgba(250, 244, 233, 0.14)"
  rule-strong: "rgba(21, 19, 15, 0.28)"
  rule-strong-dark: "rgba(250, 244, 233, 0.27)"
  red: "#c43b24"
  red-dark: "#a92f1b"
  red-theme-dark: "#ff8068"
  red-theme-dark-hover: "#ff9a86"
  mint: "#14755d"
  mint-dark: "#69d3b2"
  focus: "#a72f1c"
  focus-dark: "#ffac9b"
  accent-soft: "#f7ddd6"
  accent-soft-dark: "#4b2923"
  success-soft: "#dfeee8"
  success-soft-dark: "#173a30"
  close: "#15130f"
  close-ink: "#faf4e9"
  close-soft: "#c3b8a8"
  close-red: "#ff7359"
  close-mint: "#72d8b6"
typography:
  display:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "clamp(4rem, 7vw, 6rem)"
    fontWeight: 550
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "clamp(3rem, 6vw, 6rem)"
    fontWeight: 540
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  title:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "1.45rem"
    fontWeight: 620
    lineHeight: 1.1
  body:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "1rem"
    fontWeight: 450
    lineHeight: 1.7
  label:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "0.62rem"
    fontWeight: 450
    lineHeight: 1.35
    letterSpacing: "0.05em"
  control:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "0.84rem"
    fontWeight: 620
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  none: "0"
  control: "2px"
  circle: "50%"
spacing:
  xs: "8px"
  sm: "14px"
  md: "24px"
  lg: "38px"
  section: "clamp(96px, 10vw, 156px)"
  hero-inline: "clamp(38px, 6vw, 100px)"
  hero-block: "clamp(72px, 9vh, 120px)"
  mobile-inline: "24px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.close-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "13px 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "13px 24px"
    height: "48px"
  theme-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    width: "40px"
    height: "40px"
  offset-input:
    backgroundColor: "{colors.paper-quiet}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
    height: "40px"
  structure-row-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
    height: "54px"
  byte-cell-selected:
    backgroundColor: "{colors.red}"
    textColor: "{colors.close-ink}"
    rounded: "{rounded.none}"
    padding: "13px 2px"
    height: "44px"
  info-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "clamp(70px, 8vw, 130px)"
---

# Design System: HexLens

## Overview

**Creative North Star: “Editorial Split.”**

HexLens is a full-screen editorial exchange between a promise and its proof. The landing route gives an oversized manifesto headline the left side of the page and a live byte/Structure proof the right side. Warm paper, near-black ink, restrained red, and hard rules make the binary file feel like a readable artifact rather than a terminal wall. Manrope carries the argument; JetBrains Mono measures offsets, bytes, and compact labels.

The desktop Inspector keeps a Structure rail beside a large Map workspace, with Info as the educational counterpart. A selected Structure or byte is one semantic thread: it updates the raw span, Field interpretation, and the lesson that explains why the span exists. Phone-sized viewports remain on the complete landing story and present the Inspector as coming soon; direct Inspector URLs return to the landing page.

**Key Characteristics:**

- Asymmetrical editorial landing with a live PNG proof and substantive ruled sections.
- Warm paper light mode paired with a near-black warm dark mode.
- Red is the action and Selection signal; mint is reserved for local/ready status.
- Square controls, hard rules, flat surfaces, and almost no ornament or shadow.
- Manrope for display/body; JetBrains Mono for technical data and labels.
- One Selection synchronizes Structure, bytes, Fields, and an educational Info lesson.

## Colors

The palette behaves like a printed page: paper and ink establish the field, red marks the current action or semantic Selection, and mint marks local ownership or readiness. Dark mode keeps the same roles in a near-black, warm register.

### Primary

- **Signal Red** (`#c43b24`): The primary action, selected byte fill, and active interaction cue in light mode.
- **Deep Signal Red** (`#a92f1b`): Hover, label-safe emphasis, and red text on light paper.
- **Dark Signal Red** (`#ff8068`): The dark-theme Selection/action signal; its hover value is `#ff9a86`.

### Secondary

- **Local Mint** (`#14755d`): Local-only, ready, healthy, and ownership status. It is never a second Selection color.
- **Dark Local Mint** (`#69d3b2`): The same status role in dark mode.

### Neutral

- **Canvas Paper** (`#f5f1e9`): Browser-edge and ruled landing-section field.
- **Warm Paper** (`#fffdf8`): Proof surfaces, Inspector workspaces, and readable content areas.
- **Deep Paper** (`#eee7dc`): Recessed bands and dark-mode structural contrast.
- **Ink** (`#15130f`): Primary text, hard rules, and active tab surfaces in light mode.
- **Soft Ink** (`#6d665c`): Supporting copy, metadata, and explanatory text.
- **Rule** (`rgba(21, 19, 15, 0.15)`): Quiet dividers; **Strong Rule** (`rgba(21, 19, 15, 0.28)`) marks structural boundaries.
- **Warm Dark Canvas** (`#17130f`) and **Warm Dark Paper** (`#211c17`): Dark-mode background and workspace surfaces.
- **Dark Ink** (`#faf4e9`) and **Dark Soft Ink** (`#b9afa0`): Dark-mode foreground and supporting copy.

### Named Rules

**The One Red Signal Rule.** Red means action or the current semantic Selection. Do not spend it on decoration.

**The Mint Local Rule.** Mint means local, ready, or healthy status. It never means “selected.”

## Typography

**Display Font:** Manrope Variable, with Manrope and sans-serif fallbacks.

**Body Font:** Manrope Variable, with Manrope and sans-serif fallbacks.

**Label/Mono Font:** JetBrains Mono Variable, with JetBrains Mono, ui-monospace, and monospace fallbacks.

**Character:** Manrope is direct, contemporary, and editorial at display scale while remaining calm in explanatory copy. JetBrains Mono is a measuring instrument for bytes, offsets, status labels, and small technical facts—not a replacement for prose.

### Hierarchy

- **Display** (550, `clamp(4rem, 7vw, 6rem)`, 0.9 line-height, -0.04em tracking): The landing manifesto and Info lesson title.
- **Headline** (540, `clamp(3rem, 6vw, 6rem)`, 0.94 line-height, -0.04em tracking): Ruled landing beats and closing statements.
- **Title** (620, approximately 1.45rem, 1.1 line-height): Proof headings, selected Structure names, and key panel titles.
- **Body** (450, approximately 1rem, 1.7 line-height): Promise copy, format explanations, and lesson prose; keep it in a moderate readable measure.
- **Label** (450, 0.62rem, 1.35 line-height, 0.05em tracking): Offsets, byte values, statuses, captions, and compact technical metadata.
- **Control** (620, 0.84rem, 1 line-height): Button and tab labels; use sentence case unless a technical label is intentionally mono.

### Named Rules

**The Two-Register Rule.** Manrope explains the file; JetBrains Mono measures it.

**The No-Kicker Rule.** Do not add small eyebrow or kicker labels above headings. Let the headline and rule carry the hierarchy.

## Layout

The landing is a full-width, asymmetrical split. A sticky, ruled navigation bar sits above a first viewport with a left manifesto and a wider right proof panel. The hero uses approximately `0.82fr / 1.18fr`; the left column is separated by a hard vertical rule. The proof is a live byte strip followed by a source-order Structure map, not a decorative mockup.

Below the hero, substantive editorial sections alternate warm paper and canvas fields: the Bytes/Structure/Meaning connection rows, PNG/WAV coverage ledger, an educational Info invitation, and the local-only close. Sections use generous `clamp(96px, 10vw, 156px)` vertical padding and hard horizontal rules rather than card stacks.

The Inspector is a two-part desktop workspace: a Structure rail on the left and a large Map or Info workspace on the right. Map contains the virtualized 16-bytes-per-row grid, offset controls, Selection summary, Fields, and the original-file Source preview. Info replaces the Map workspace with a lesson tied to the current Selection. At `980px`, the Inspector rail and workspace become a horizontally scrollable two-column model. At `620px`, the landing stacks and controls become full width; Inspector routes return to the landing page.

## Elevation & Depth

Editorial Split is flat by default. The final production layer removes shell and panel shadows, backdrop blur, perspective, and ornamental lifts. Depth comes from warm-paper tonal changes, a restrained accent wash, hard rules, borders, and the red Selection fill. The primary action retains a small functional control shadow so it reads as actionable; all other depth should remain structural and quiet.

### Shadow Vocabulary

- **Action control:** `0 10px 24px rgba(173, 49, 28, 0.18)` in light mode and `0 10px 26px rgba(0, 0, 0, 0.3)` in dark mode; only for primary actions.
- **Everything else:** no shell, panel, card, or data-surface shadow. Use rules, tonal layering, and selected outlines.

### Named Rules

**The Flat Paper Rule.** If a boundary, tone, or rule can establish hierarchy, do not add a shadow.

## Shapes

The form language is square and typographic. Controls use a barely softened `2px` corner; byte cells, panels, ledgers, tabs, and selection summaries are square (`0`). Circles are reserved for the small local/ready status mark and the wordmark lens. Borders are generally 1px, with stronger ink rules for the page’s major divisions and the selected byte span. Avoid pills, chips, floating rounded cards, and decorative corner treatments.

## Components

### Buttons

- **Shape:** Square with a barely softened 2px corner, 1px boundary, and at least 48px height.
- **Primary:** Signal Red fill with warm light text, Manrope control type, and an authored inline SVG arrow separated by a deliberate gap. Hover deepens the red; active state returns to rest.
- **Secondary:** Transparent paper field with a strong rule and Ink text. It supports file ingress and low-priority actions without becoming a pill.
- **Focus:** A 3px Focus Red outline with a 4px offset is shared by buttons, links, inputs, tabs, and the byte grid.

### Theme Toggle

The 40px square control is transparent with a quiet rule. Its authored sun/moon SVGs transition briefly, while the document foreground and color scheme change immediately. The preference persists under `hexlens-theme`; system preference is used when no value is saved.

### Navigation

The landing navigation is sticky, short, and ruled. It uses a wordmark at left, two quiet links centered, and the theme toggle at right. The Inspector toolbar follows the same hard-line language and uses an authored inline SVG arrow for “Back to landing.” Never type an arrow glyph into copy.

### Structure Rail

Structure entries are semantic buttons in source-file order. Rows are square, at least 54px high in the landing proof, and separated by quiet rules. A selected row uses the pale red accent wash, a visible boundary, and `aria-pressed`; nesting and span metadata remain legible in mono/soft ink. The legend distinguishes Structure boundary, selected Byte span, and unmapped span without color alone.

### Byte Map and Span Selection

The byte map uses JetBrains Mono, hexadecimal offsets, 16 bytes per row, optional ASCII, and a bounded virtualized row window. A selected span receives a red fill and outline; Structure ownership boundaries remain visible in mint or dashed soft ink. Shift-selection and arrow keys extend an exact span. The shared Selection updates Structure, bytes, Fields, copy actions, Source preview context, and Info lesson together.

### Field Inspector

Fields are ruled rows with a readable label, compact value, encoded bytes, representation, endianness, and decimal/hex offsets. The selected Field uses the red semantic cue; values use mono and mint only where they communicate local/healthy data. Source preview is always labeled “original-file rendering” and remains subordinate to parsed Structure and Field information.

### Info Workspace

Info is the educational workspace, not a modal card. It replaces the Map content on desktop and occupies a ruled, generous paper field. The current lesson title, meaning, “How to read it,” “Where it sits,” and the selected source bytes all follow the active Selection.

## Do's and Don'ts

### Do:

- **Do** lead with the editorial split: oversized promise on the left, live byte/Structure proof on the right.
- **Do** use hard rules, warm paper tones, square controls, and restrained spacing to make hierarchy legible.
- **Do** reserve red for action and Selection, and mint for local/ready status.
- **Do** keep one Selection synchronized across Structure, bytes, Fields, Source preview context, and Info.
- **Do** preserve the two-pane desktop Inspector and keep phone visitors on the landing page with an honest coming-soon state.
- **Do** use Manrope for explanation and JetBrains Mono for measured data.
- **Do** keep compressed PNG/WAV Payload bytes opaque and label previews as original-file rendering.
- **Do** honor keyboard focus, roving tab behavior, and prefers-reduced-motion.

### Don't:

- **Don't** reintroduce the replaced cool-blue console, editorial serif, rounded shell, floating card, gradient, or shadow-heavy system.
- **Don't** add small eyebrow/kicker labels above headings, decorative pills/chips, or gratuitous ornament.
- **Don't** use mint to imply Selection or red to imply privacy/local ownership.
- **Don't** type arrow glyphs; use the authored inline SVG arrow treatment.
- **Don't** turn the landing or Inspector into a terminal wall, metric dashboard, or unrelated tile collection.
- **Don't** decode opaque Payload content or describe browser rendering as parsed output.
- **Don't** collapse the byte grid until offsets and exact spans become ambiguous; preserve internal scroll on narrow screens.
