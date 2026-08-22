# Detector evidence

The Impeccable detector was run once on the changed UI targets:

```text
node /Users/darshm/.agents/skills/impeccable/scripts/detect.mjs --json index.html src/main.ts src/styles.css
```

The environment fell back to the regex detector because parser modules were unavailable, so custom properties, selector matching, and computed contrast were not evaluated. The run returned advisory `design-system-font-size` findings for the existing literal type ramp (including the new landing-ledger sizes) and no mechanical side-tab, radius, shadow, gradient, or generic-card blockers. No second detector run was performed, per the workflow.
