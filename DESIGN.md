---
name: HexLens
description: A calibrated local console for tracing binary files from Structure to exact bytes.
colors:
  canvas: "#eef1f6"
  canvas-dark: "#0c1019"
  paper: "#fbfcfe"
  paper-dark: "#121722"
  paper-deep: "#f0f3f8"
  paper-deep-dark: "#0e131d"
  paper-quiet: "#f5f7fb"
  paper-quiet-dark: "#171d29"
  surface: "rgba(251, 252, 254, 0.94)"
  surface-dark: "rgba(18, 23, 34, 0.95)"
  surface-raised: "#ffffff"
  surface-raised-dark: "#181e2a"
  surface-sunken: "#edf1f7"
  surface-sunken-dark: "#0b1019"
  ink: "#172033"
  ink-dark: "#edf0f7"
  ink-soft: "#667085"
  ink-soft-dark: "#9ca6b8"
  rule: "rgba(23, 32, 51, 0.11)"
  rule-dark: "rgba(226, 232, 244, 0.10)"
  rule-strong: "rgba(23, 32, 51, 0.18)"
  rule-strong-dark: "rgba(226, 232, 244, 0.18)"
  cobalt: "#5b61f4"
  cobalt-dark: "#8b90ff"
  cobalt-deep: "#4147d7"
  cobalt-deep-dark: "#a7aaff"
  jade: "#187a66"
  jade-dark: "#55c7ad"
  focus: "#4057e3"
  focus-dark: "#aab7ff"
  accent-soft: "rgba(91, 97, 244, 0.10)"
  accent-soft-dark: "rgba(139, 144, 255, 0.16)"
  accent-softer: "rgba(91, 97, 244, 0.06)"
  accent-softer-dark: "rgba(139, 144, 255, 0.08)"
  success-soft: "rgba(24, 122, 102, 0.10)"
  success-soft-dark: "rgba(85, 199, 173, 0.12)"
  on-accent: "#ffffff"
typography:
  display:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "clamp(3.4rem, 6.2vw, 6rem)"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  control:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "0.82rem"
    fontWeight: 620
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "clamp(2rem, 3.5vw, 3.5rem)"
    fontWeight: 620
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  title:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "1.18rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "1rem"
    fontWeight: 450
    lineHeight: 1.6
  label:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 450
    lineHeight: 1.35
    letterSpacing: "0.02em"
rounded:
  none: "0"
  field: "10px"
  structure: "12px"
  control: "13px"
  summary: "14px"
  data-surface: "15px"
  selection-note: "16px"
  panel: "18px"
  sample-plate: "20px"
  shell: "24px"
  circle: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  shell: "clamp(12px, 2.4vw, 34px)"
  panel: "clamp(24px, 2.6vw, 38px)"
  landing-inline: "clamp(24px, 5.6vw, 90px)"
  landing-block: "clamp(58px, 7vw, 112px)"
  sample-plate: "clamp(22px, 3vw, 36px)"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
    height: "46px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
    height: "46px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.shell}"
    padding: "0"
  sample-inspector:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sample-plate}"
    padding: "{spacing.sample-plate}"
  data-grid:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.data-surface}"
    padding: "0"
  selected-byte:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.none}"
    height: "44px"
  theme-toggle:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    width: "42px"
    height: "42px"
---

# Design System: HexLens

## Overview

**Creative North Star: “Calibrated Lens Console.”**

HexLens is a quiet optical workspace for making binary structure legible. Neutral light and dark environments keep the file itself in focus; Manrope carries the interface and explanation, while JetBrains Mono gives bytes, offsets, labels, and data a stable measuring grid. Cobalt marks the current Selection and action path. Jade marks local-only status and healthy progress.

The landing route presents a readable promise beside a live PNG mini-inspector. The Sample Inspection expands that relationship into a three-pane desktop console: Structures, raw Bytes, and a Field inspector. Surfaces have a soft offset lift, data areas use inset depth, and the landing inspector has a slight optical perspective. The product remains client-only and read-only: a Source preview is explicitly an original-file rendering, never parsed output.

**Key Characteristics:**

- Neutral, theme-aware light and dark console environments.
- Self-hosted Manrope for interface text and JetBrains Mono for bytes and data.
- Cobalt Selection state paired with jade local/privacy status.
- Soft offset shell and panel depth with inset data surfaces.
- Responsive three-pane desktop inspection and three-tab mobile inspection.

## Colors

The palette is intentionally restrained: cool neutrals establish the console, cobalt identifies the current semantic path, and jade identifies local/privacy state. The light values are the default; the dark values are the paired data-theme="dark" environment.

### Primary

- **Cobalt** ("#5b61f4" light / "#8b90ff" dark): The primary Selection color for selected Byte cells, Structure and Field state, active mobile tabs, primary actions, and the landing span bracket.
- **Cobalt Deep** ("#4147d7" light / "#a7aaff" dark): The stronger cobalt used for hover, compact labels, and text-safe emphasis around a selected state.
- **Focus Cobalt** ("#4057e3" light / "#aab7ff" dark): The keyboard focus ring; it stays distinct from the filled Selection state.

### Secondary

- **Jade** ("#187a66" light / "#55c7ad" dark): Local-only status, privacy copy, healthy operation status, and ownership boundaries. Jade is not a substitute for the selected-span signal.

### Neutral

- **Canvas** ("#eef1f6" light / "#0c1019" dark): The browser-edge field and page background, with a quiet radial accent wash.
- **Paper** ("#fbfcfe" light / "#121722" dark): The main shell and inspector panel background.
- **Deep Paper** ("#f0f3f8" light / "#0e131d" dark): The inset band behind inspector columns and mobile tabs.
- **Quiet Paper** ("#f5f7fb" light / "#171d29" dark): Status bands, offset labels, and small supporting surfaces.
- **Surface** ("rgba(251, 252, 254, 0.94)" light / "rgba(18, 23, 34, 0.95)" dark): The translucent rounded shell surface.
- **Raised Surface** ("#ffffff" light / "#181e2a" dark): Primary cards, the live sample inspector, and the data grid.
- **Sunken Surface** ("#edf1f7" light / "#0b1019" dark): Source preview backing and other recessed content.
- **Ink** ("#172033" light / "#edf0f7" dark): Primary foreground and high-priority structure text.
- **Soft Ink** ("#667085" light / "#9ca6b8" dark): Supporting copy, metadata, hints, and secondary labels.
- **Rule** ("rgba(23, 32, 51, 0.11)" light / "rgba(226, 232, 244, 0.10)" dark): Quiet dividers and panel boundaries.
- **Strong Rule** ("rgba(23, 32, 51, 0.18)" light / "rgba(226, 232, 244, 0.18)" dark): Controls, shell edges, and the stronger end of the data grid.
- **On Accent** ("#ffffff"): Text and byte values on filled cobalt.

### Named Rules

**The Cobalt Selection Rule.** Cobalt means “this is the current semantic path.” Pair it with labels, outlines, ownership boundaries, or summaries so Selection is never communicated by color alone.

**The Jade Local Rule.** Jade is reserved for local/privacy status, healthy operation, and ownership cues. Do not use it as a second selection color.

## Typography

**Display Font:** Self-hosted Manrope Variable, with Manrope and sans-serif fallbacks.

**Body Font:** Self-hosted Manrope Variable, with Manrope and sans-serif fallbacks.

**Label/Mono Font:** Self-hosted JetBrains Mono Variable, with JetBrains Mono, ui-monospace, and monospace fallbacks.

**Character:** Manrope keeps the console calm, contemporary, and highly legible at compact sizes. JetBrains Mono gives offsets, hex values, status labels, and Field facts a precise rhythm without turning explanatory copy into terminal chrome.

### Hierarchy

- **Display** (650, clamp(3.4rem, 6.2vw, 6rem), 0.98 line-height, -0.04em tracking): The landing promise and the largest empty-state headings.
- **Headline** (620, clamp(2rem, 3.5vw, 3.5rem), 1.05 line-height, -0.035em tracking): Landing beat headings and the local close.
- **Title** (600, 1.18rem, approximately 1.2 line-height): Structure headings and selected semantic labels. Toolbar context is intentionally smaller at 0.95rem and weight 520.
- **Body** (450, roughly 0.98rem–1.3rem, 1.58–1.65 line-height): Promise copy, explanations, Field notes, and support text; keep readable copy in a moderate measure.
- **Label** (450, 0.6rem–0.82rem, 1.35 line-height, 0.02em–0.08em tracking): Bytes, offsets, status, captions, controls, Diagnostics, and compact metadata.

### Named Rules

**The Two-Register Rule.** Manrope explains the file and carries hierarchy; JetBrains Mono measures it. Use the mono face for data, not for every sentence.

**The Immediate Contrast Rule.** When the theme changes, foreground text changes immediately with the token set. Do not fade text or leave a light-mode foreground in the dark environment.

## Layout

The app lives at / and /inspect; the deterministic PNG entry is /inspect?sample=png. The outer app shell uses clamp(12px, 2.4vw, 34px) page padding and centers a shell capped at 1500px. Desktop shells have a 24px radius; at phone width the app flushes to the viewport and the shell becomes square and shadowless.

The landing route uses a two-column promise-to-inspector grid: approximately .84fr / 1.16fr, with the live Sample inspector on the wider side. The first viewport keeps the promise, the Try the sample action, local-only note, and the first 24 PNG bytes visible together. Supporting sections continue as full-width ruled beats for the Selection mechanism, PNG/WAV coverage, and local-only close.

The desktop Sample Inspection uses three columns: Structure tree, dominant Bytes, and Field inspector, approximately .72fr / 1.72fr / .9fr. The middle column owns the widest measure. It presents the toolbar, status, local-file ingress, Diagnostics, a virtualized 16-bytes-per-row grid, a persistent selected-span summary, and a Source preview. The grid keeps a bounded DOM window while preserving the full row and column counts for assistive technology.

Responsive behavior is structural, not merely smaller type:

- At 1120px, masthead and inspector columns tighten while the three-pane model remains.
- At 900px, the landing stacks, the sample perspective is removed, and the Field inspector moves below Structures and Bytes.
- At 620px, the shell is edge-to-edge, actions become full width, and the inspector exposes Structures, Bytes, and Fields as keyboard-operable tabs. The byte grid keeps a minimum internal width and scrolls horizontally when necessary so byte identity is not compressed away.

## Elevation & Depth

This is a soft layered system. The outer shell and raised panels use offset shadows; the byte grid and selected-span summary use inset shadows to read as measured data surfaces; a restrained translucent surface and background wash keep the environment from feeling flat. The landing sample plate adds perspective(1100px) rotateY(-1.5deg) rotateX(.75deg) as a small optical cue only; it is removed when the landing stacks at 900px.

### Shadow Vocabulary

- **Shell lift:** 0 28px 70px rgba(31, 42, 68, 0.14), 0 4px 14px rgba(31, 42, 68, 0.06) in light mode; 0 30px 80px rgba(0, 0, 0, 0.48), 0 4px 18px rgba(0, 0, 0, 0.26) in dark mode.
- **Panel lift:** 0 16px 40px rgba(31, 42, 68, 0.10), 0 2px 8px rgba(31, 42, 68, 0.05) in light mode; 0 18px 45px rgba(0, 0, 0, 0.32), 0 2px 10px rgba(0, 0, 0, 0.18) in dark mode.
- **Control lift:** 0 7px 16px rgba(65, 71, 215, 0.22), 0 2px 4px rgba(65, 71, 215, 0.12) in light mode; 0 8px 20px rgba(0, 0, 0, 0.34), 0 2px 5px rgba(139, 144, 255, 0.18) in dark mode.
- **Inset data:** inset 0 1px 2px rgba(23, 32, 51, 0.07) in light mode and inset 0 1px 2px rgba(0, 0, 0, 0.28) in dark mode.

### Named Rules

**The Calibrated Depth Rule.** Use one clear lift for a coherent surface and inset treatment for data. Shadows should clarify hierarchy and interaction, never turn the console into a stack of floating tiles.

## Shapes

The form language is rounded but controlled. The shell is 24px; the landing inspector is 20px; ledgers are 18px; the selected-span summary is 14px; controls are 13px; Structure rows are 12px; Field rows are 10px; and the data grid is 15px. Borders remain 1px and low-contrast by default. Filled Selection uses a cobalt outline/trace and a short lock-in animation rather than a new geometry.

Circles are reserved for the wordmark lens, status pulse, and small status marks. Mobile removes shell rounding entirely, and the landing perspective is not used below the stack breakpoint. Preserve generous hit areas: primary controls are 46px high, the theme toggle is 42px square, and mobile tabs are at least 48px high.

## Components

### Buttons

- **Shape:** 13px radius, 1px quiet rule, 46px minimum height, 11px 18px padding.
- **Primary:** Cobalt fill with white text, Manrope label, a short arrow gap, and control lift. Hover deepens to Cobalt Deep; active returns to its resting position.
- **Secondary:** Raised neutral surface with Ink text and a quiet control shadow. Hover adds a cobalt border/text cue; disabled actions use Soft Ink and no shadow.
- **Focus:** A 2px Focus Cobalt outline with a 3px offset is shared by buttons, links, inputs, selects, tabs, and the grid viewport.

### Theme Toggle

The 42px square control uses a 13px radius and a raised neutral surface. Sun and moon SVGs cross-fade/rotate briefly, while the document foreground swaps immediately. initializeTheme uses the system preference when no value is saved; toggleTheme persists light or dark under the hexlens-theme local-storage key.

### Empty Inspector and File Ingress

The empty desktop Inspector invites the visitor to “Bring a PNG or WAV into focus.” Its local-file ingress says the file may be dropped “anywhere in this window.” Keep this direct optical language aligned with the Calibrated Lens Console; preserve the local-only constraint and do not imply broader Format coverage.

### Cards / Containers

- **Shell:** A single translucent rounded surface, capped at 1500px, with the shell lift. It contains each route rather than fragmenting the page into metric tiles.
- **Landing live inspector:** The raised sample plate is the signature surface: 20px radius, panel lift, inset data treatments, and slight perspective on wide screens.
- **Inspector panes:** Structure, Bytes, and Field panes are semantic columns separated by the Deep Paper gutter. They use raised Paper backgrounds and responsive panel padding.
- **Mechanism and coverage ledgers:** Raised 18px-radius surfaces with quiet row rules; hover may reveal a subtle accent wash.

### Structure Tree

Structure rows are semantic buttons with a 12px radius, source-order labels, spans, and concise type/size metadata. Hover uses a neutral surface; selection uses a pale cobalt wash, cobalt edge, and aria-pressed state. Nested children retain a visible boundary. The legend distinguishes Structure boundary, selected Byte span, and Unmapped span without relying on color alone.

### Byte Grid and Span Selection

The byte grid renders 16 bytes per row with JetBrains Mono, hexadecimal offsets, optional ASCII, and a bounded virtualized row window. A selected Byte span receives a cobalt fill, outline, ownership boundary, and an accessible summary. Shift-selection and arrow keys extend an exact span; Go to offset accepts hexadecimal by default and decimal only when explicitly chosen. The selection model is shared: one selected span updates the Structure tree, raw byte cells, Field rows, Field facts, copy actions, and Source preview context together.

### Field Inspector

The Field inspector keeps the selected Structure heading, Field list, interpreted value/status, encoded bytes, representation, endianness, and decimal/hex offsets in one semantic column. Intersecting Fields, Bit fields, Derived values, Unmapped spans, and Diagnostics appear as subordinate subsections. Inline actions can copy bytes or refocus the grid without breaking the current Selection.

### Mobile Inspector Tabs

At the narrow breakpoint, the three desktop panes become Structures, Bytes, and Fields tabs. The active tab gets a cobalt underline or raised neutral tab surface; hidden panels are removed from layout, and tab arrows/Home/End provide keyboard navigation. Selection remains global while the visible panel changes.

### Source Preview

The Source preview is always labeled original-file rendering. PNG uses the tiny native image rendering and WAV uses a native audio control; the preview is subordinate to Structure, Byte, and Field data and is never described as parser output.

## Do's and Don'ts

### Do:

- **Do** keep the local-only promise, deterministic Sample action, and real Byte-to-Structure relationship visible early.
- **Do** use Manrope for hierarchy and explanation and JetBrains Mono for bytes, offsets, statuses, and compact data.
- **Do** reserve cobalt for the current Selection/action path and jade for local/privacy and healthy status.
- **Do** preserve the one-span synchronization contract across Structure, raw bytes, and Field inspector.
- **Do** keep the desktop three-pane model and the mobile tab model legible at their respective breakpoints.
- **Do** change foreground tokens immediately when themes switch and honor prefers-reduced-motion.
- **Do** label every Source preview as original-file rendering and keep opaque Payload bytes opaque.

### Don't:

- **Don't** reintroduce the replaced warm paper, editorial serif, oxide, verdigris, hairline-registration, or paper-and-ink visual system.
- **Don't** turn HexLens into a terminal wall, metric dashboard, or collection of unrelated floating cards.
- **Don't** use jade to imply the current Selection or cobalt to imply privacy.
- **Don't** animate foreground text through a theme change or add decorative motion longer than the functional state response.
- **Don't** decode Payload content in the Source preview or present browser rendering as parsed output.
- **Don't** collapse the byte grid until offsets and exact spans become ambiguous; preserve the internal scroll on narrow screens.
