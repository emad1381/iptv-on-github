# NeonStream IPTV

Personal IPTV dashboard. Client-side only — no backend, no server, no account.

Runs on GitHub Pages. Stores everything in IndexedDB.

---

## Quick Start

1. Push files to a GitHub repo
2. Go to **Settings → Pages** → Deploy from branch (`main`, `/`)
3. Open `https://<username>.github.io/<repo>/`
4. Done. Add channels and play.

---

## CORS Proxy — Critical Notes

### Why You Need a Proxy

Most IPTV streams block browser requests (CORS policy). The browser says:

```
Access to fetch at 'https://example.com/stream.m3u8' from origin 
'https://your-site.github.io' has been blocked by CORS policy
```

**A CORS proxy sits between your browser and the stream server.** It fetches the stream on your behalf and adds `Access-Control-Allow-Origin: *` headers so the browser accepts it.

### How HLS Streaming Works (and Why Simple Proxies Break)

This is the most important thing to understand:

```
Step 1: Browser fetches manifest
        GET /proxy/?url=https://example.com/live.m3u8
        → Returns: #EXTM3U
                    segment001.ts
                    segment002.ts
                    segment003.ts

Step 2: HLS.js parses manifest, finds "segment001.ts"
        Resolves to: https://example.com/segment001.ts  ← DIRECT! Not through proxy!

Step 3: Browser tries direct fetch → CORS BLOCKED ❌
```

**A simple URL-forwarding proxy is NOT enough.** You need a proxy that:

1. Fetches the M3U8 manifest
2. **Parses the M3U8 content**
3. **Rewrites ALL relative URLs inside the manifest** to go through the proxy
4. Returns the rewritten manifest to the browser

### Correct Worker Implementation

Your Cloudflare Worker MUST rewrite M3U8 content. Here's the pattern:

```javascript
// Inside the worker's fetch handler:
if (isM3U8 && response.ok) {
  let text = await response.text();
  
  // Get base URL for resolving relative paths
  const baseUrl = responseUrl.origin + responseUrl.pathname
    .substring(0, responseUrl.pathname.lastIndexOf('/') + 1);
  
  // Preserve query string (for auth tokens)
  const originalQuery = responseUrl.search || '';
  
  // Rewrite each non-comment line
  text = text.replace(/^([^\s#][^\r\n]*)/gm, (match, line) => {
    line = line.trim();
    if (!line || line.startsWith('data:') || line.startsWith('blob:')) return match;
    
    let absoluteUrl;
    try {
      absoluteUrl = new URL(line, baseUrl + originalQuery);
    } catch {
      return match;
    }
    
    // Don't double-proxy
    if (absoluteUrl.href.startsWith(workerOrigin)) return match;
    
    // Return proxied URL
    return workerOrigin + '/?url=' + encodeURIComponent(absoluteUrl.href);
  });
  
  // Also rewrite URI="..." for AES-128 keys
  text = text.replace(/(URI=")([^"]+)(")/gi, (match, prefix, uri, suffix) => {
    if (uri.startsWith('data:') || uri.startsWith('blob:')) return match;
    let absoluteUrl;
    try { absoluteUrl = new URL(uri, baseUrl + originalQuery); } 
    catch { return match; }
    if (absoluteUrl.href.startsWith(workerOrigin)) return match;
    return prefix + workerOrigin + '/?url=' + encodeURIComponent(absoluteUrl.href) + suffix;
  });
  
  return new Response(text, { status: 200, headers: corsHeaders });
}
```

**Without this rewriting, streams will load the manifest but fail to play segments.**

### Setting Up Your Own Proxy

1. Go to [Cloudflare Workers](https://dash.cloudflare.com/)
2. Create a new Worker
3. Paste the full proxy code (see `worker.js` in this repo)
4. Deploy it
5. Copy the Worker URL (e.g., `https://my-proxy.username.workers.dev/?url=`)
6. In NeonStream → Settings → paste the URL in CORS Proxy field

### Built-in Proxy Presets

| Preset | URL | Notes |
|--------|-----|-------|
| Direct | (empty) | No proxy — only works with CORS-friendly streams |
| CF Worker | `https://iptv-proxy-github.nikiali823.workers.dev/?url=` | Pre-configured, M3U8-aware |
| corsproxy.io | `https://corsproxy.io/?` | Public, may have rate limits |
| allorigins | `https://api.allorigins.win/raw?url=` | Public, may be slow |

### Adding Custom Proxies

1. Open Settings
2. Click **+** button next to proxy presets
3. Enter a name and URL
4. It's saved to IndexedDB and persists across sessions
5. Custom proxies are included in JSON export/import

### Testing Your Proxy

After setting a proxy, use the **Latency Graph** below the player:

```
User ──→ Proxy ──→ Origin
 15ms     45ms     120ms
```

If you see "Direct" mode, no proxy is active. If proxy times out, the proxy URL may be wrong.

---

## Architecture

```
iptv/
├── index.html              # HTML shell — zero inline JS/CSS
├── css/
│   ├── themes.css          # Day/night CSS variables
│   ├── main.css            # Layout, buttons, cards, categories, toasts
│   ├── player.css          # Video player, fullscreen, latency graph
│   ├── modal.css           # Modals: search, settings, diagnostics
│   └── mobile.css          # Responsive breakpoints
├── js/
│   ├── app.js              # Entry point — event wiring, bootstrap, shared state
│   ├── storage.js          # IndexedDB abstraction (channels, categories, settings, backups)
│   ├── ui.js               # Toast, DOM helpers, theme, modals
│   ├── player.js           # HLS.js + dash.js engine, stall recovery
│   ├── channels.js         # Channel CRUD, render list, stream testing
│   ├── categories.js       # Category management, picker
│   ├── search.js           # IPTV-org global search
│   ├── import-export.js    # M3U/JSON import/export
│   ├── settings.js         # Settings modal, proxy, custom proxies
│   ├── shortcuts.js        # Keyboard shortcuts
│   └── diagnostics.js      # Debug log engine
├── assets/
│   ├── logo.svg
│   └── favicon.svg
├── data/
│   └── default-categories.json
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline cache)
├── worker.js               # Cloudflare Worker CORS proxy (deploy separately)
├── README.md
└── LICENSE
```

### Module Dependency Graph

```
app.js (entry point)
├── storage.js       (no deps — IndexedDB only)
├── ui.js            (no deps — DOM helpers)
├── diagnostics.js   (no deps — log engine)
├── player.js        ← ui.js, diagnostics.js
├── channels.js      ← ui.js, diagnostics.js, categories.js
├── categories.js    ← ui.js
├── search.js        ← ui.js
├── import-export.js ← ui.js
├── settings.js      ← ui.js, storage.js, channels.js, categories.js, import-export.js
└── shortcuts.js     ← ui.js, player.js
```

### Key Design Decisions

- **ES6 modules** — `import`/`export` everywhere. No bundler.
- **Single storage layer** — `storage.js` is the ONLY file touching IndexedDB.
- **Write-through cache** — Reads are synchronous (from RAM), writes go to IDB async.
- **No frameworks** — Vanilla JS. No React, Vue, jQuery.
- **Shared state** — One `state` object in `app.js` passed to modules via `init()`.
- **Event delegation** — Channel/category events use delegated handlers.

---

## Features

- Add/delete/categorize IPTV channels (M3U8/HLS + MPD/DASH)
- CORS proxy with M3U8 URL rewriting
- Custom proxy presets (saved to IndexedDB)
- Latency graph: User → Proxy → Origin (visual ping)
- Global search from IPTV-org (40,000+ channels)
- HLS.js + dash.js playback with stall recovery
- M3U file import (drag & drop)
- JSON export/import (channels + categories + settings)
- Dark/Light theme
- Keyboard shortcuts
- PWA installable + offline support
- Responsive (desktop/mobile/tablet/TV)

---

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

---

## Default Channels

The app ships with one default channel:

- **Iran International** — `https://live.livetvstream.co.uk/LS-63503-4/index.m3u8`

This channel is added automatically on first launch (when IndexedDB is empty).

---

## Development

No build step. Open `index.html` or use a local server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# VS Code Live Server extension
```

---

## License

MIT
