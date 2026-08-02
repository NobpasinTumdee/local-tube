<div align="center">

# 🎬 LocalTube

**A modern, 100% local, zero-backend media streaming experience for your own videos & images — right in the browser.**

Point it at a folder on your disk and get a premium, Netflix-style library. Nothing is uploaded. Nothing is tracked. Nothing on your disk is ever modified.

![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-16a34a)
![Network](https://img.shields.io/badge/Network-Zero%20Requests-16a34a)
![Filesystem](https://img.shields.io/badge/Disk%20Access-Read--Only-2563eb)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Vite](https://img.shields.io/badge/Vite-5-646cff)

</div>

---

## 📖 Project Overview

**LocalTube** is a browser-based media library and player for the videos and images already sitting on your computer. Using the browser's **File System Access API**, you grant read access to a folder and LocalTube renders it as a polished streaming app — thumbnails, hover previews, playlists, tags, themes, multi-video layouts, and more.

There is **no server, no database, and no account**. Every byte stays inside your browser tab. When you close it, the media handles are gone; only your lightweight preferences (favorites, playlists, tags, theme) persist in `localStorage`.

---

## 🔒 Privacy & Security Guarantee

LocalTube is built around three hard guarantees, each **verified by a source-code audit**:

### 1. 🟢 100% Local — No Network Exfiltration
There are **zero** `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, or `EventSource` calls anywhere in the codebase, and **no analytics, telemetry, or third-party trackers**. Your folder paths, files, thumbnails, Blob URLs, and metadata **never leave the browser**. The app loads only its own bundled assets — no CDNs, no remote fonts.

### 2. 🔵 Read-Only — No File Modification
LocalTube opens your folder with the **default `'read'` permission only**. It never requests `'readwrite'`, never creates a `FileSystemWritableFileStream`, and never calls `removeEntry`, `move`, or `rename`. **There is no code path capable of deleting, moving, renaming, or altering a single file on your disk.**

### 3. 🟣 Sandbox Security — No Escape, No XSS
All file access is confined to the single directory handle *you* explicitly authorize — the browser sandbox enforces this, and the code performs no path-string manipulation to reach outside it. There is **no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`** in the project, eliminating common XSS sinks. Blob URLs are created lazily and revoked deterministically.

> **Virtual, not physical:** Favorites, Virtual Playlists, and Custom Tags are stored *only* as strings (media IDs = relative paths) in `localStorage`. They reorganize your **view**, never your **disk**.

---

## ✨ Key Features

| | Feature | Description |
|---|---|---|
| 🎞️ | **Multi-Media Support** | Videos **and** images live together in one unified, uniform grid. |
| 🧩 | **Multi-Media Layout Mode** | Watch/view several items at once in custom grid templates (Single, 1+2, 2×2, 3×3, **Auto**, and a fully **Custom** N×M grid) — freely mixing videos and images, with per-tile and master controls + fullscreen. |
| 📐 | **Customizable Uniform Grid** | Choose a card **aspect ratio** (16:9 · 9:16 · 1:1) and **column count** (Auto · 2–6). All cards stay perfectly uniform; media fills cleanly via `object-cover`. |
| 🎨 | **Dynamic Theme System** | Six CSS-variable-driven themes — **Default Dark, OLED Black, Retro Terminal, Deep Sea, Cyberpunk, Soft Light** — swap instantly with live swatch previews. |
| 🍿 | **Streaming-Service UI/UX** | Cinematic cards, hover video previews, folder "shelves", and a YouTube-style **Ambient Glow** (cinema mode) behind the player. |
| ❤️ | **Virtual Library** | Favorites, Virtual Playlists, and Custom Tagging + an advanced tag/type **Filter Bar** — all virtual, all local. |
| 💾 | **Backup Export / Import** | One-click **JSON backup** of all your favorites, playlists, tags, theme, and watch progress — restore on any device. Never touches physical files. |
| ⏯️ | **Continue Watching** | Playback position is remembered per video and resumes automatically. |

---

## 🗂️ Directory & Architecture Guide

```
LocalTube/
├── index.html                  # App shell; inline script seeds saved theme (no-flash)
├── src/
│   ├── main.tsx                # Entry point — applies persisted theme, mounts React
│   ├── App.tsx                 # Root: folder picker + master filter pipeline + layout
│   ├── index.css               # Tailwind layers + all theme CSS variables + scrollbars
│   │
│   ├── store/
│   │   └── useStore.ts         # 🧠 Zustand store (persist middleware) — single source
│   │                           #    of truth: library, navigation, player, layout,
│   │                           #    themes, favorites/playlists/tags, watch progress,
│   │                           #    display prefs. Persists ONLY prefs to localStorage.
│   │
│   ├── utils/
│   │   ├── directoryScanner.ts # 📁 Recursive File System Access walk → MediaEntry[]
│   │   │                        #    + folder tree; classifies video/image; READ-ONLY.
│   │   ├── generateThumbnail.ts# 🖼️ Offscreen <video>+<canvas> frame extraction with
│   │   │                        #    a concurrency-limited queue (returns data: URL).
│   │   ├── layoutGrid.ts       # Grid template → inline CSS-grid styles + DnD MIME types
│   │   ├── backupUtils.ts      # Export/import user-data JSON (validate + sanitize)
│   │   └── format.ts           # Duration / size / relative-time / resolution helpers
│   │
│   └── components/
│       ├── Welcome.tsx         # First-run landing → triggers showDirectoryPicker()
│       ├── Header.tsx          # Top bar: search, folder re-pick, layout/theme/settings
│       ├── Sidebar.tsx         # Library nav, folder tree, Favorites, Playlists, Recent
│       ├── Breadcrumb.tsx      # Folder path breadcrumb
│       ├── FilterBar.tsx       # Media-type + dynamic tag filters (Framer Motion)
│       ├── GridSettingsBar.tsx # Aspect-ratio + column-count selectors
│       ├── MediaGrid.tsx       # Main grid: shelves, folder cards, uniform media grid
│       ├── MediaCard.tsx       # A card: lazy thumbnail, hover preview, fav/tag/playlist
│       ├── Player.tsx          # Single-video player: full/mini/theater, Up Next, resume
│       ├── ImageViewer.tsx     # Fullscreen single-image viewer (prev/next)
│       ├── MediaViewer.tsx     # Multi-media grid container + master controls + fullscreen
│       ├── MediaTile.tsx       # One layout slot: video player OR image (zoom/pan)
│       ├── AmbientGlow.tsx     # Canvas-sampled cinema-glow effect (perf-guarded)
│       ├── LayoutSelector.tsx  # Layout toggle + templates + custom grid builder
│       ├── ThemeSwitcher.tsx   # Theme picker with live swatches
│       └── SettingsModal.tsx   # Data Management: backup export / restore
│
├── tailwind.config.js          # Semantic color tokens mapped to CSS variables
├── vite.config.ts              # Vite + React plugin (dev server only)
└── package.json                # 4 runtime deps: react, react-dom, zustand, framer-motion
```

---

## ⚙️ How It Works (Technical Flow)

LocalTube has **no backend** — the browser itself is the runtime, storage, and media server.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. AUTHORIZE   User clicks "Select Folder" → window.showDirectoryPicker()   │
│                Browser sandbox grants a READ-ONLY FileSystemDirectoryHandle  │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. SCAN        directoryScanner.ts recursively walks the handle,            │
│                classifying files by extension into a flat MediaEntry[]       │
│                + a folder tree. Each entry keeps a read-only file handle.    │
├───────────────────────────────────────────────────────────────────────────┤
│ 3. LAZY LOAD   Each MediaCard registers an IntersectionObserver. Only when  │
│                a card scrolls into view does it read its file:              │
│                  • Video → generateThumbnail.ts draws a frame to <canvas>    │
│                    → canvas.toDataURL() (inline, no blob to leak)            │
│                  • Image → URL.createObjectURL(file) (revoked on re-scan)    │
├───────────────────────────────────────────────────────────────────────────┤
│ 4. PLAY        On click, the file handle → getFile() → Blob URL fed to a    │
│                native <video>/<img>. Blob URLs are revoked on unmount,       │
│                source-change, and player close (no memory leaks).            │
├───────────────────────────────────────────────────────────────────────────┤
│ 5. PERSIST     Zustand's persist middleware writes ONLY your preferences    │
│                (favorites, playlists, tags, theme, progress, display) to     │
│                localStorage. The heavy library + handles are never stored.   │
└───────────────────────────────────────────────────────────────────────────┘
```

- **File System Access API** provides sandboxed, read-only access to one user-chosen directory — the trust boundary.
- **IntersectionObserver** keeps large libraries fast by deferring all file reads and thumbnail work until content is actually visible.
- **`<canvas>` extraction** turns a video frame into a lightweight inline `data:` thumbnail without a server or FFmpeg.
- **Zustand + persist** gives a single reactive store and durable-yet-minimal preferences, so the app "remembers you" without a database.

---

## 🚀 Getting Started

### Requirements
- **Node.js** ≥ 18
- A **Chromium-based browser** (Chrome or Edge) — the File System Access API (`showDirectoryPicker`) is required and is not yet supported in Firefox/Safari.

### Installation
```bash
git clone <your-repo-url>
cd LocalTube
npm install
```

### Run locally (development)
```bash
npm run dev
```
Then open the printed URL (default **http://localhost:5173**), click **Select Folder**, and choose any folder of videos/images.

### Build for production
```bash
npm run build      # type-checks (tsc -b) then bundles with Vite → dist/
npm run preview    # serve the production build locally
```

### Supported formats
- **Video:** `.mp4`, `.webm`, `.ogg`, `.ogv`, `.mov`, `.mkv`, `.m4v`
- **Image:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`

---

## 🗺️ Roadmap (Not Yet Implemented)

These are planned and **not currently in the codebase**:

- 🔤 **Local Subtitle Support** — drag-and-drop `.srt` / `.vtt` files and auto-discover sidecar subtitle tracks.
- ⌨️ Global keyboard-shortcut cheatsheet.
- 🗃️ Optional IndexedDB backend for very large tag/playlist datasets.

---

## 🛡️ Security Posture (Summary)

| Guarantee | Status | Evidence |
|---|---|---|
| No network / telemetry | ✅ Verified | Zero `fetch`/XHR/WebSocket/beacon; no analytics deps |
| Read-only filesystem | ✅ Verified | `showDirectoryPicker()` with no `readwrite`; no write/delete APIs |
| No XSS sinks | ✅ Verified | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` |
| Blob-URL hygiene | ✅ Hardened | Deterministic `revokeObjectURL`; image thumbnails revoked on re-scan |
| Virtual-only customizations | ✅ Verified | Favorites/playlists/tags are `localStorage` strings |

**Recommended production hardening:** ship a strict Content-Security-Policy, e.g.
`default-src 'self'; connect-src 'none'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'` —
to make the "no exfiltration" guarantee browser-enforced.

---

<div align="center">

**LocalTube** — your media, your machine, your rules. No cloud required.

</div>
