# GFM Compatibility

Use GitHub and VS Code style Markdown anchor links in Obsidian.

If you keep Markdown notes in a repo and jump between Obsidian, GitHub, and VS Code, this plugin makes their anchor links work the same way inside Obsidian.

## What it fixes

- Supports same-note anchor links such as `[Section](#my-section)`.
- Supports cross-note anchor links such as `[Section](Other Note.md#my-section)`.
- Supports duplicate heading slugs such as `#my-section-1`.
- Supports manual HTML anchors such as `<a id="my-section"></a>`.
- Works in reading view and when opening links from other notes.

## Installation

### Community Plugins

After the plugin is available in Community Plugins:

1. Open `Settings -> Community plugins`.
2. Disable `Restricted mode` if needed.
3. Select `Browse` and search for `GFM Compatibility`.
4. Install and enable the plugin.

### Manual installation

1. Download the latest release from GitHub.
2. Create the folder `<your-vault>/.obsidian/plugins/gfm-compatibility/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian and enable the plugin.

## Examples

Same note:

```md
[Role](#gdd-role)
```

Another note:

```md
[Controls](Design/Controls.md#movement-controls)
```

Manual HTML anchor:

```md
<a id="custom-anchor"></a>

[Jump](#custom-anchor)
```

## Privacy

This plugin does not send network requests, collect telemetry, show ads, or require an account. It only reads note metadata and Markdown contents from your vault to resolve anchor targets.

## Development

```bash
npm install
npm run dev
```

Obsidian loads the plugin from the plugin folder, so local development only requires an up-to-date `main.js`.
