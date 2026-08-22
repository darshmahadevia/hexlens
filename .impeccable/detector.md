# Detector evidence

The Impeccable detector was run once on the UI targets:

```text
node /Users/darshm/.agents/skills/impeccable/scripts/detect.mjs --json index.html src/main.ts src/styles.css
```

The environment fell back to the regex detector because parser modules were unavailable. It reported one warning, `side-tab` / “Side-tab accent border”, at the 3px left accent border in `src/styles.css`. That mechanical finding was fixed by reducing the structure and legend accent borders to 1px. No second detector run was performed, per the workflow.
