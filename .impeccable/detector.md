# Detector evidence

The Impeccable detector was run once on the changed UI targets:

```text
node /Users/darshm/.agents/skills/impeccable/scripts/detect.mjs --json index.html src/main.ts src/styles.css
```

The environment fell back to the regex detector because parser modules were unavailable, so custom properties, selector matching, and computed contrast were not evaluated. The single run returned 64 advisory `design-system-font-size` findings for the existing literal type ramp (including the landing-ledger sizes) and one advisory `design-system-radius` finding for an existing `7px` rule. It returned no side-tab, shadow, gradient, or generic-card findings, and no blocker-severity findings. The findings are intentional adaptations already represented by the shipped visual language; no UI correction was made after this run, and no second detector run was performed, per the workflow.
