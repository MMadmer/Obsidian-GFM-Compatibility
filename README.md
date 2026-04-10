# GFM Compatibility

Obsidian plugin that adds GitHub and VS Code style Markdown anchor compatibility.

## Features

- Resolves same-note links like `[Section](#my-section)`.
- Resolves cross-note links like `[Section](Note.md#my-section)`.
- Supports duplicate heading slugs like `#my-section-1`.
- Supports manual HTML anchors like `<a id="my-section"></a>`.
- Uses Obsidian navigation APIs so links behave consistently in reading view and editor navigation.

## Usage

- Enable the plugin in Community Plugins.
- Write standard Markdown links like `[Section](#my-section)` in the current note.
- Write cross-note links like `[Section](Other Note.md#my-section)` for another note.
- Keep using manual anchors like `<a id="my-section"></a>` if your docs already depend on them.

## Privacy and disclosures

- No network requests.
- No telemetry.
- No ads or external account requirements.
- Reads note metadata and Markdown contents from your vault only to resolve anchor targets.

## Development

```bash
npm install
npm run dev
```

For local development, Obsidian only needs an up-to-date `main.js` in the plugin folder.
