---
version: 1
slug: "route-inspect"
primary_target: "route:/inspect"
related_targets: ["route:/"]
---

## Scope and visitor mode

Desktop Inspector at `/inspect`. Operate mode. A visitor is already inside an Inspection and needs to connect a Structure to its bytes and Field details. Phone-sized viewports return to `/` because the Inspector is not available there.

## Audience, task, proof, constraints

Students and engineers select the PNG signature or IHDR, read its exact offset and length, and move back and forth between semantic and raw views. The shared Byte-span contract is the proof. Keep the layout to toolbar, Structure tree, dominant byte grid, and Field inspector. The Source preview must be labeled as the original-file rendering. No server parsing, decoded pixels, file uploads, or URL-derived file identity.

## Chosen direction and memorable moment

The Conservation Workbench. The inspector is a measured paper desk: a narrow Structure index, large byte strip with registration rules, and a Field note that feels pinned to the selected span. The memorable moment is selecting IHDR in either the Structure list or byte row and seeing the same 13-byte bracket plus decoded width, height, bit depth, and color type.

## Visual inventory

Use semantic HTML/CSS for panes, buttons, labels, and data. Use CSS geometry for rules, selected spans, and the field-note pin. Keep the byte values monospace and editorial copy serif. The future parser can add Structures without changing the visual grammar.

## Responsive behavior

This ticket targets desktop. Narrow Sample tabs arrive later. Keep pane widths flexible enough for 900px and above and allow the toolbar to wrap without hiding the Sample identity.

## Unresolved decisions

WAV, malformed states, arbitrary local files, and the full keyboard/a11y hardening remain later slices.
