<div align="center">

# 🎬 LocalTube

**A modern, 100% local, zero-backend media streaming experience for your own videos & images — right in the browser.**

Point it at a folder on your disk and get a premium, Netflix-style library. Nothing is uploaded. Nothing is tracked. Nothing on your disk is ever modified.

![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-16a34a)
![Network](https://img.shields.io/badge/Network-Zero%20by%20Default-16a34a)
![P2P](https://img.shields.io/badge/P2P-Opt--In%20%C2%B7%20E2E%20Encrypted-8b5cf6)
![Filesystem](https://img.shields.io/badge/Disk%20Access-Read--Only-2563eb)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Vite](https://img.shields.io/badge/Vite-5-646cff)

</div>

---

## 📖 Project Overview

**LocalTube** is a browser-based media library and player for the videos and images already sitting on your computer. Using the browser's **File System Access API**, you grant read access to a folder and LocalTube renders it as a polished streaming app — thumbnails, hover previews, playlists, tags, themes, multi-video layouts, and more.

There is **no server, no database, and no account**. Every byte stays inside your browser tab. When you close it, the media handles are gone; only your lightweight preferences (favorites, playlists, tags, theme) persist in `localStorage`.

The one exception is the **opt-in P2P Watch Party** — a browser-to-browser, password-protected room for pushing individual files and live-streaming what you're watching. It is completely inert until you switch it on, and it still never involves a server that can see your data. [Jump to the details ↓](#-p2p-watch-party-opt-in)

---

## 🔒 Privacy & Security Guarantee

LocalTube is built around three hard guarantees, each **verified by a source-code audit**:

### 1. 🟢 Local by Default — No Network Exfiltration
There are **zero** `fetch`, `XMLHttpRequest`, `sendBeacon`, or `EventSource` calls anywhere in the codebase, and **no analytics, telemetry, or third-party trackers**. Your folder paths, files, thumbnails, Blob URLs, and metadata **never leave the browser** on their own. The app loads only its own bundled assets — no CDNs, no remote fonts.

> **The one qualifier:** the [P2P Watch Party](#-p2p-watch-party-opt-in) uses WebRTC, and therefore a `WebSocket` to a signaling broker — but **only after you explicitly open or join a room**. Until then the PeerJS library is not even downloaded (it lives behind a dynamic `import()`), so a cold session makes exactly zero network requests. You can verify this in DevTools → Network: nothing peer-related appears until you press **Open room**.

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
| 🤝 | **P2P Watch Party** *(opt-in)* | Password-protected browser-to-browser rooms: **push** individual files to verified peers and **live-broadcast** the video you're watching. No server ever sees your data. |
| 🛑 | **Global Kill Switch** | One prominent button destroys every data channel, media stream and signaling socket, and releases received files from memory. |

---

## 🤝 P2P Watch Party (Opt-In)

A direct, end-to-end-encrypted link between two browsers — no upload, no relay, no account. **Off until you turn it on.**

### What it does

| | Capability | Description |
|---|---|---|
| 🔐 | **Password-protected rooms** | Pick a 4–10 **digit Room ID** and a passphrase. Both sides prove they know it before anything else is permitted. |
| 📤 | **Selective file push** | Tick specific items from *your* library and send them. The receiver must **accept** before a single byte is buffered. |
| 📡 | **Live Broadcast** | `captureStream()` on the video you're watching is streamed in real time to verified peers. They see **frames, not the file** — no copy lands on their disk. |
| 🛋️ | **Watch Party Lobby** | A room UI with peer list, verification badges, and a waiting state that becomes the player the moment the host goes live. |
| 🧯 | **Kill Switch** | `peer.destroy()` + every `conn.close()` + every `track.stop()` + `revokeObjectURL()` on all received blobs, in one click. |

### The four security invariants

**1. Zero unsolicited access.** The wire protocol has **no** `list`, `get`, `read`, or `browse` message — the vocabulary is exhaustive and a peer literally cannot ask for anything. `webrtcService.ts` holds no reference to the media library and no `FileSystemHandle`; files enter it only through `sendFileToPeers(file, peerIds)`, which the UI calls with `File` objects a local user hand-picked.

**2. Opt-in by construction.** PeerJS sits behind a dynamic `import()` inside `startSession()`. Importing the module does nothing — no `Peer`, no socket, no listener.

**3. Mutual password proof.** Not a plaintext comparison:

```
key   = PBKDF2-SHA256(password, salt="localtube-p2p|<roomId>", 250 000 iterations)
proof = HMAC-SHA256(key, "<direction>|<hostNonce>|<guestNonce>")

host ── hello{nonceH} ─────────────▶ guest
host ◀── auth{nonceG, proofG, name} ─ guest     proofG = HMAC(key,"guest->host|…")
host ── auth-ok{proofH, name} ─────▶ guest     proofH = HMAC(key,"host->guest|…")
```

The passphrase **never goes on the wire in either direction**. Both nonces are bound into every proof and each direction is domain-separated, so a captured proof can be neither replayed nor reflected. Comparison is constant-time. Failure closes the connection immediately; three strikes locks the peer out for the session. The **guest also verifies the host** — if a squatter holds your Room ID but can't prove the password, the guest aborts and says so.

**4. Kill switch.** Tears down transport *first* (so nothing can arrive mid-wipe), then revokes blob URLs, stops tracks, and resets state. Idempotent and never throws.

### Additional hardening

- **Receiving is opt-in too** — an offer is just an announcement; nothing is buffered until you click Accept.
- **MIME is never taken from the wire.** A Blob URL opens in *our own origin*, so honouring a peer-supplied type would let them script into it. The type is re-derived locally from the extension against an allowlist; anything unknown becomes an inert `application/octet-stream` download.
- **Filenames are reduced to a safe basename** — no path separators, no control characters, no leading dots, bounded length.
- **Backpressure** — chunks (16–64 KB, negotiated from `sctp.maxMessageSize`) are gated on `bufferedAmount`, and files are read lazily via `File.slice()` so a 4 GB video is never resident in memory.
- **Guests never accept inbound connections** (star topology), and media calls from unauthenticated peers are rejected outright.

### Live Broadcast requires your own signaling server

⚠️ File transfer works fine on PeerJS's default public broker. **Live Broadcast does not** — that broker relays data offers but silently drops the larger media offer, so the invitation never reaches the viewer. Run your own:

```bash
npx peer --port 9000
```

Then set **host** and **port** under *Advanced — signaling server* in **both** browsers. Verified working end-to-end this way; the app also detects the failure, retries over the DataChannel, and then tells you exactly this.

> **What a signaling server can and cannot see.** It introduces the two browsers and sees your Room ID and IP. It **never** sees your files, your stream, or your password — media and data flow directly peer-to-peer over DTLS/SRTP. Self-hosting removes the third party entirely.
>
> **Honest limitation:** this is not a PAKE. Someone squatting your Room ID who completes one handshake obtains a single HMAC they can attack offline. PBKDF2 at 250 000 iterations makes each guess expensive — but a weak passphrase is still weak. Also note that WebRTC reveals your IP to the peer; that is inherent to the technology.

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
│   │   ├── useStore.ts         # 🧠 Zustand store (persist middleware) — single source
│   │   │                       #    of truth: library, navigation, player, layout,
│   │   │                       #    themes, favorites/playlists/tags, watch progress,
│   │   │                       #    display prefs. Persists ONLY prefs to localStorage.
│   │   └── useWebRTCStore.ts   # 🤝 P2P session state — NEVER persisted, never touches
│   │                           #    localStorage: room id, passphrase, peers, transfer
│   │                           #    progress, active stream + the disconnectAll()
│   │                           #    kill switch. Holds no PeerJS objects.
│   │
│   ├── services/
│   │   ├── p2pProtocol.ts      # 📜 Wire contract: exhaustive message vocabulary (no
│   │   │                       #    read/list/get verb exists), PBKDF2+HMAC challenge
│   │   │                       #    /response, chunk framing, MIME allowlist, sanitizers.
│   │   │                       #    Side-effect free — importing it opens nothing.
│   │   ├── webrtcService.ts    # 🔌 The ONLY module that touches the network. Lazily
│   │   │                       #    import()s PeerJS, runs the auth handshake, chunks
│   │   │                       #    files with backpressure, places/answers media calls.
│   │   └── mediaElementRegistry.ts # Publishes the live <video> so Broadcast can
│   │                           #    captureStream() it; verifies tracks actually exist.
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
│       ├── SettingsModal.tsx   # Data Management: backup export / restore
│       ├── WebRTCBar.tsx       # 🤝 P2P entry point: create/join room, peer list,
│       │                       #    security log, consent toasts + KILL SWITCH
│       ├── WatchPartyLobby.tsx # 🛋️ The room: waiting → connecting → watching, over
│       │                       #    one persistent <video> (never remounts mid-stream)
│       ├── ShareModal.tsx      # 📤 Pick library items + peers → push; transfer
│       │                       #    progress; accept/decline + view/save received files
│       └── BroadcastView.tsx   # 📡 Host "Go live" controls + fullscreen viewer
│
├── tailwind.config.js          # Semantic color tokens mapped to CSS variables
├── vite.config.ts              # Vite + React plugin (dev server only)
└── package.json                # 6 runtime deps: react, react-dom, zustand,
                                #   framer-motion, lucide-react, peerjs (lazy-loaded)
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

### P2P flow (only runs after you opt in)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 0. INERT       PeerJS is behind a dynamic import(). Nothing is downloaded,  │
│                constructed or listening. Zero network requests.             │
├───────────────────────────────────────────────────────────────────────────┤
│ 1. OPT IN      User enters Room ID + passphrase → startSession() → the      │
│                library is fetched for the first time and a Peer is created. │
│                Real peer id is namespaced: "localtube-p2p-v1-<digits>".     │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. HANDSHAKE   Signaling broker introduces the browsers, then the DataChannel│
│                carries a MUTUAL PBKDF2/HMAC challenge-response. Until both   │
│                proofs verify, the ONLY permitted messages are the handshake  │
│                itself — anything else severs the connection.                │
├───────────────────────────────────────────────────────────────────────────┤
│ 3a. PUSH FILE  Owner ticks a file → handle.getFile() → chunks (16–64 KB,    │
│                gated on bufferedAmount, read lazily via File.slice) after    │
│                the receiver ACCEPTS. Reassembled to a Blob whose MIME is     │
│                re-derived locally from an allowlist — never from the wire.   │
├───────────────────────────────────────────────────────────────────────────┤
│ 3b. BROADCAST  captureStream() on the live <video> → peer.call() to every   │
│                VERIFIED peer. Guest answers receive-only (no camera/mic ever │
│                offered back) and attaches the MediaStream via srcObject.     │
├───────────────────────────────────────────────────────────────────────────┤
│ 4. KILL        disconnectAll() → transport torn down FIRST, then blob URLs   │
│                revoked, tracks stopped, state wiped. Browser is isolated.    │
└───────────────────────────────────────────────────────────────────────────┘
```

- **A MediaStream must be attached via `srcObject`, never `src`** — it has no URL, and stringifying it yields `"[object MediaStream]"` and a silently blank element. Both viewers do this imperatively through a ref + effect.
- **Media offers are signaling traffic**, so they can be dropped by a flaky broker while the peer-to-peer DataChannel stays perfectly healthy. A watchdog therefore asks for a re-call over the reliable channel, and gives up with an actionable message rather than hanging forever.

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

### Using the P2P Watch Party

1. Click the **share icon** in the header (it's also on the welcome screen — a guest who only wants to watch or receive doesn't need a folder).
2. **Host a room** → generate a Room ID and set a strong passphrase → **Open room**.
3. Share the digits and passphrase with your guest **over a channel you trust** — anyone who has both can join.
4. The guest picks **Join a room**, enters the same two values, and lands in the Watch Party Lobby once verified.
5. **Send files** pushes selected library items; **Go live** broadcasts the video you're currently playing.

> ⚠️ **Live Broadcast needs your own signaling server.** Run `npx peer --port 9000` and set it under *Advanced — signaling server* in **both** browsers. See [the section above](#live-broadcast-requires-your-own-signaling-server) for why.

> 🔐 **Secure context required.** Room passphrases use WebCrypto, which only exists on `https://` or `localhost`. Serving LocalTube over plain `http://` on a LAN IP will fail loudly rather than fall back to something weaker.

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
| No telemetry / analytics | ✅ Verified | Zero `fetch`/XHR/beacon; no analytics deps |
| No network until opt-in | ✅ Verified | PeerJS behind dynamic `import()`; confirmed in DevTools — zero peer-related requests until **Open room** |
| Read-only filesystem | ✅ Verified | `showDirectoryPicker()` with no `readwrite`; no write/delete APIs |
| No XSS sinks | ✅ Verified | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` |
| Blob-URL hygiene | ✅ Hardened | Deterministic `revokeObjectURL`; received-file MIME from a local allowlist, never from the wire |
| Virtual-only customizations | ✅ Verified | Favorites/playlists/tags are `localStorage` strings |
| P2P: no remote read | ✅ Verified | Protocol has no read/list/get message; service holds no library reference or file handle |
| P2P: room auth | ✅ Verified | Mutual PBKDF2(250k)+HMAC proof, constant-time compare, 3-strike lockout, 15 s timeout; wrong password drops the connection (tested) |
| P2P: session secrets | ✅ Verified | `useWebRTCStore` is **not** wrapped in `persist`; room id and passphrase die with the tab |
| P2P: kill switch | ✅ Verified | Transport destroyed first, then blobs revoked and state wiped; propagation to the remote peer tested |

**Recommended production hardening:** ship a strict Content-Security-Policy. Without P2P:
`default-src 'self'; connect-src 'none'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'`

With the Watch Party enabled, `connect-src` must allow your signaling server only — e.g.
`connect-src wss://peer.example.com` — which keeps the "no exfiltration" guarantee browser-enforced while permitting the one connection you chose.

---

<div align="center">

**LocalTube** — your media, your machine, your rules. No cloud required.

</div>
