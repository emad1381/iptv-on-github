# NeonStream IPTV

A modular, client-side IPTV dashboard built with vanilla JavaScript. No frameworks, no backend — runs entirely on GitHub Pages.

## Features

- **Channel Management** — Add, delete, categorize IPTV channels (M3U8/HLS + MPD/DASH)
- **Category System** — Custom categories with counts, filter, drag-assign
- **CORS Proxy** — Configurable proxy for cross-origin streams (corsproxy.io, allorigins)
- **Stream Testing** — Segment counting through proxy, ping fallback
- **Global Search** — 40,000+ channels from [iptv-org](https://github.com/iptv-org/iptv) with logos
- **HLS.js + dash.js** — Adaptive bitrate, stall recovery, quality display
- **M3U Import** — Drag & drop or upload `.m3u` playlist files
- **Export/Import JSON** — Backup and restore your channel list
- **PWA** — Installable, offline support via service worker
- **Dark/Light Theme** — Toggle with persistent preference
- **Keyboard Shortcuts** — `Ctrl+K` search, `F` fullscreen, `Space` play/pause
- **Responsive** — Desktop, tablet, mobile, TV layouts

## Project Structure

```
iptv/
├── index.html                 # Main HTML shell (no inline JS/CSS)
├── css/
│   ├── themes.css             # Day/night theme variables
│   ├── main.css               # Layout, typography, buttons, cards, categories
│   ├── player.css             # Video player and fullscreen
│   ├── modal.css              # Modal overlays, search, settings, diagnostics
│   └── mobile.css             # Responsive breakpoints
├── js/
│   ├── app.js                 # Main entry point, event wiring, bootstrap
│   ├── storage.js             # localStorage abstraction layer
│   ├── ui.js                  # Toast, DOM helpers, theme, modals
│   ├── player.js              # HLS.js / dash.js playback engine
│   ├── channels.js            # Channel CRUD, rendering, testing
│   ├── categories.js          # Category management, picker
│   ├── search.js              # IPTV-org global search
│   ├── import-export.js       # M3U and JSON import/export
│   ├── settings.js            # Settings modal, proxy, clear data
│   ├── shortcuts.js           # Keyboard shortcut bindings
│   └── diagnostics.js         # Debug log engine
├── assets/
│   ├── logo.svg               # App logo
│   ├── favicon.svg            # Browser favicon
│   ├── icons/                 # PWA icons (placeholder)
│   └── screenshots/           # App screenshots (placeholder)
├── data/
│   └── default-categories.json
├── manifest.json              # PWA manifest
├── sw.js                      # Service worker (offline support)
├── README.md
└── LICENSE
```

## Architecture

### Module Dependency Graph

```
app.js (entry)
├── storage.js      (no deps)
├── ui.js           (no deps)
├── diagnostics.js  (no deps)
├── player.js       ← ui.js, diagnostics.js
├── channels.js     ← ui.js, diagnostics.js, categories.js
├── categories.js   ← ui.js
├── search.js       ← ui.js
├── import-export.js ← ui.js
├── settings.js     ← ui.js, storage.js, channels.js, categories.js, import-export.js
└── shortcuts.js    ← ui.js, player.js
```

### Key Design Decisions

1. **ES6 Modules** — All JS files use `import`/`export`. No bundler needed.
2. **Single Storage Layer** — `storage.js` is the ONLY file that touches `localStorage`.
3. **No Frameworks** — Pure vanilla JavaScript. No React, Vue, jQuery, etc.
4. **Separation of Concerns** — CSS, HTML, and JS are fully separated.
5. **Shared State** — A single `state` object in `app.js` is passed to modules via `init()`.
6. **Event Delegation** — Channel and category events use delegated handlers on containers.

## Deploy on GitHub Pages

1. Create a new GitHub repository
2. Push all files to the repo
3. Go to **Settings → Pages** → Source: **Deploy from a branch**
4. Select `main` branch, `/ (root)` folder
5. Your site will be live at `https://<username>.github.io/<repo>/`

### Subpath Handling

All asset references use relative paths (`./css/main.css`), so the app works correctly when hosted under a subpath like `https://username.github.io/repo/`.

## CORS Proxy

Some IPTV streams block cross-origin requests. To play them:

1. Click the **Settings** gear icon
2. Enter a CORS proxy URL or click a preset:
   - `https://corsproxy.io/?` — Recommended
   - `https://api.allorigins.win/raw?url=` — Alternative
3. All streams and tests will now go through the proxy

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Global Search |
| `Ctrl+Enter` | Add Channel |
| `Ctrl+D` | Toggle Theme |
| `Ctrl+,` | Settings |
| `Esc` | Close Modal |
| `Space` | Play/Pause |
| `F` | Fullscreen |

## Development

No build step required. Open `index.html` in a browser or use a local server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# VS Code
# Use Live Server extension
```

## License

MIT
