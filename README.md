<div align="center">

# 🎬 LocalTube

**A modern, 100% local, zero-backend media streaming experience for your own videos & images — right in the browser.**

Point it at a folder on your disk and get a premium, Netflix-style library. Nothing is uploaded. Nothing is tracked. Nothing on your disk is ever modified.

![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-16a34a)
![Network](https://img.shields.io/badge/Network-Zero%20by%20Default-16a34a)
![P2P](https://img.shields.io/badge/P2P-Opt--In%20%C2%B7%20E2E%20Encrypted-8b5cf6)
![Filesystem](https://img.shields.io/badge/Disk%20Access-Read--Only-2563eb)
![Vault](https://img.shields.io/badge/Vault-AES--256--GCM-a855f7)
![Workspace](https://img.shields.io/badge/Workspace-Multi--Folder-f59e0b)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Vite](https://img.shields.io/badge/Vite-5-646cff)

</div>

---

## 📖 Project Overview

**LocalTube** is a browser-based media library and player for the videos and images already sitting on your computer. Using the browser's **File System Access API**, you grant read access to **one or more folders** and LocalTube merges them into a single polished streaming app — thumbnails, hover previews, playlists, tags, themes, multi-video layouts, and more.

There is **no server, no database, and no account**. Every byte stays inside your browser tab. What persists is deliberately small and entirely local:

| Where | What | Why there |
|---|---|---|
| `localStorage` | Favorites, playlists, tags, theme, watch progress, display prefs, stealth shortcut | Small, plain JSON |
| **IndexedDB** | Workspace folder handles + presets, the encrypted Vault, the scrub-preview frame cache | A `FileSystemDirectoryHandle` **cannot** be JSON-serialized — `JSON.stringify` yields `{}` and the reference is lost. IndexedDB's structured-clone is the only mechanism that preserves it across a reload |

Nothing in either store is readable by a server, because there isn't one.

The one exception is the **opt-in P2P Watch Party** — a browser-to-browser, password-protected room for pushing individual files and live-streaming what you're watching. It is completely inert until you switch it on, and it still never involves a server that can see your data. [Jump to the details ↓](#-p2p-watch-party-opt-in)

---

## 🔒 Privacy & Security Guarantee

LocalTube is built around three hard guarantees, each **verified by a source-code audit**:

### 1. 🟢 Local by Default — No Network Exfiltration
There are **zero** `fetch`, `XMLHttpRequest`, `sendBeacon`, or `EventSource` calls anywhere in the codebase, and **no analytics, telemetry, or third-party trackers**. Your folder paths, files, thumbnails, Blob URLs, and metadata **never leave the browser** on their own. The app loads only its own bundled assets — no CDNs, no remote fonts.

> The landing page's background video is part of that guarantee: it is `import`ed so the bundler fingerprints it into `dist/`, rather than pulled from a CDN at runtime. A cold load fetches nothing but same-origin files the build produced.

> **The one qualifier:** the [P2P Watch Party](#-p2p-watch-party-opt-in) uses WebRTC, and therefore a `WebSocket` to a signaling broker — but **only after you explicitly open or join a room**. Until then the PeerJS library is not even downloaded (it lives behind a dynamic `import()`), so a cold session makes exactly zero network requests. You can verify this in DevTools → Network: nothing peer-related appears until you press **Open room**.

### 2. 🔵 Read-Only — No File Modification
LocalTube opens your folder with the **default `'read'` permission only**. It never requests `'readwrite'`, never creates a `FileSystemWritableFileStream`, and never calls `removeEntry`, `move`, or `rename`. **There is no code path capable of deleting, moving, renaming, or altering a single file on your disk.**

### 3. 🟣 Sandbox Security — No Escape, No XSS
All file access is confined to the single directory handle *you* explicitly authorize — the browser sandbox enforces this, and the code performs no path-string manipulation to reach outside it. There is **no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`** in the project, eliminating common XSS sinks. Blob URLs are created lazily and revoked deterministically.

> **Virtual, not physical:** Favorites, Virtual Playlists, Custom Tags, **Workspace presets** and the **Private Vault** are stored *only* as strings (media IDs = mount-prefixed relative paths). They reorganize your **view**, never your **disk**. "Moving" a file into the Vault adds its id to an encrypted list — the file itself never moves, and deleting the Vault deletes only that list.

---

## ✨ Key Features

| | Feature | Description |
|---|---|---|
| 🗂️ | **Virtual Multi-Path Workspace** | Mount **several folders at once** into one merged library, and save combinations as named **Presets** ("Anime + Movies"). Nothing is moved or copied — a workspace is just a list of directory handles. |
| 🕶️ | **Stealth Mode** | A customizable **panic shortcut** that instantly blanks the screen, mutes every player, and swaps the tab title. Blackout or fake-terminal cover. |
| 🔐 | **Private Vault** | A PIN-locked virtual playlist. Its membership is **encrypted at rest** (PBKDF2 → AES-256-GCM), and while locked its items disappear from the entire library. |
| 🪟 | **Document Picture-in-Picture** | Pop the whole multi-media grid — tiles, controls and all — into a floating always-on-top window, not just a bare video track. |
| 🎞️ | **Hover Scrub Previews** | YouTube-style thumbnail filmstrip on the progress bar, extracted locally on an offscreen canvas and cached in IndexedDB. |
| 🎞️ | **Multi-Media Support** | Videos **and** images live together in one unified, uniform grid. |
| 🧩 | **Multi-Media Layout Mode** | Watch/view several items at once in custom grid templates (Single, 1+2, 2×2, 3×3, **Auto**, and a fully **Custom** N×M grid) — freely mixing videos and images, with per-tile and master controls + fullscreen. |
| 📐 | **Customizable Uniform Grid** | Choose a card **aspect ratio** (16:9 · 9:16 · 1:1) and **column count** (Auto · 2–6). All cards stay perfectly uniform; media fills cleanly via `object-cover`. |
| 🎨 | **Dynamic Theme System** | Six CSS-variable-driven themes — **Default Dark, OLED Black, Retro Terminal, Deep Sea, Cyberpunk, Soft Light** — swap instantly with live swatch previews, under **Settings → Appearance**. |
| 🍿 | **Streaming-Service UI/UX** | Cinematic cards, hover video previews, folder "shelves", and a YouTube-style **Ambient Glow** (cinema mode) behind the player. |
| ❤️ | **Virtual Library** | Favorites, Virtual Playlists, and Custom Tagging + an advanced tag/type **Filter Bar** — all virtual, all local. |
| 💾 | **Backup Export / Import** | One-click **JSON backup** of all your favorites, playlists, tags, theme, and watch progress — restore on any device. Never touches physical files. |
| ⏯️ | **Continue Watching** | Playback position is remembered per video and resumes automatically. |
| 🤝 | **P2P Watch Party** *(opt-in)* | Password-protected browser-to-browser rooms: **push** individual files to verified peers and **live-broadcast** the video you're watching. No server ever sees your data. |
| 🛑 | **Global Kill Switch** | One prominent button destroys every data channel, media stream and signaling socket, and releases received files from memory. |

---

## 🗂️ Virtual Multi-Path Workspace

Your library no longer has to be one folder. Mount as many as you like — they merge into a single browsable tree — and save the combination as a **Preset** you can reopen in one click.

Open it from the **Workspace** button in the header, or from **My Presets** on the welcome screen.

### Virtual, never physical
A workspace is a list of directory handles and nothing else. Adding a folder does not copy, move, index or touch a single file; removing one just forgets the handle. Your disk is identical before and after.

### Why folder names prefix every path
`MediaEntry.id` is the key for favorites, tags and resume positions. Merge two folders that each contain `movie.mp4` and, without a namespace, those two different files become **one item** as far as the store is concerned — silently sharing a watch position and a favorite state.

So every path is prefixed with its mounted folder's name (`Anime/Season 1/ep01.mp4`), under one synthetic workspace root:

```
''  (workspace root — not a real directory)
├── Anime/          ← mounted folder
│   └── Season 1/
└── Movies/         ← mounted folder
```

Two properties fall out of this:

- The synthetic root is shaped exactly like a real folder node, so breadcrumbs, the sidebar tree and flat/nested browsing all work unmodified.
- **An id depends only on its own mount**, never on how many other folders happen to be open. Adding a second folder cannot re-key the first one's favorites.

Two folders that share a name (`Downloads` on two drives) are disambiguated as `Downloads` and `Downloads (2)`.

> **Upgrading from a single-folder library?** Ids gained that prefix, which would have orphaned every existing favorite, tag and resume point. A one-time migration re-points any saved id that has exactly one unambiguous match under a mount. Ambiguous ones are deliberately left alone — losing a favorite is recoverable, silently attaching it to the *wrong* file is not.

### Permissions after a restart
Browsers drop folder access when they restart, and re-granting legally requires a click. On cold start LocalTube only *queries* permission (prompting without a user gesture is suppressed by the browser), so folders whose grant lapsed are held aside and the Workspace panel offers a single **Grant access** button. Everything in the active list is guaranteed readable, so a scan can never hit `NotAllowedError`. A folder that has been moved or unplugged is reported by name instead of silently emptying your library.

---

## 🕶️ Privacy Suite

Two independent features for two different threats: someone **looking at your screen**, and someone **using your computer**.

### Stealth Mode — the panic key

Press your shortcut (default <kbd>Ctrl</kbd>+<kbd>Esc</kbd>, fully rebindable in **Settings**) and the screen is instantly covered, every player muted, and the tab title changed. Press it again to come back exactly where you were — playback keeps running underneath.

Three things it does differently from an ordinary shortcut, because a panic key has different requirements:

| Choice | Why |
|---|---|
| **Capture phase + `stopImmediatePropagation`** | `stopPropagation` stops the event reaching other *nodes*, but not other listeners on the same one — and the player also listens on `window` for Escape. Without this, <kbd>Ctrl</kbd>+<kbd>Esc</kbd> would hide the screen **and close the player underneath it**. |
| **No input guard** | Every other shortcut bails when you're typing in a field. This one must not: mid-search is exactly when you need it. |
| **Restore, don't unmute** | The previous `muted` value is remembered per element, so leaving stealth can never turn audio **on** for something you had deliberately muted. |

A `MutationObserver` also mutes any `<video>` that mounts *while* the screen is hidden — autoplay-next would otherwise start a fresh, unmuted element behind a black screen.

Covers: **Blackout** (plain black) or **Fake terminal** (a self-typing build log with no app branding). Optional **hide on window blur** covers alt-tabbing and screen-share pickers; off by default because it also fires every time you click into another app.

> The way back out is intentionally quiet — a large "PRESS CTRL+ESC TO RETURN" banner would defeat the point in front of the person you're hiding from. The hint is dim and only appears after you move the mouse.

### Private Vault — the PIN lock

A virtual playlist whose **membership list is encrypted at rest**. Set a PIN (6+ digits, or a full passphrase), then move items in from any card's menu. It auto-locks after **5 minutes of inactivity**, or instantly from the sidebar.

- **PBKDF2-SHA256 (600,000 iterations) → AES-256-GCM**, all via `window.crypto.subtle`. No crypto library, no network.
- **The GCM auth tag *is* the PIN check.** A wrong key fails the tag and decryption throws, so there is no separate password hash stored for an attacker to attack more cheaply than the KDF itself.
- The derived key is **non-extractable** and lives in a module-level variable — *not* in the Zustand store, where it would be enumerable, visible to devtools, and swept into any state dump.
- A fresh IV per save: reusing one with the same GCM key leaks the XOR of the plaintexts.
- Locking purges the decrypted ids from React state and drops the key reference.

**Items stay hidden while locked.** A vault whose files still show up in *All Media* wouldn't be private in any way a user would recognise — but hiding them needs the id list, which is precisely what's encrypted. LocalTube stores a **salted SHA-256 of each vaulted id** in the clear; locked, it hashes the ids it can see and drops any whose digest is in the list. It filters correctly **without ever learning the set**.

> #### ⚠️ What the Vault actually protects against
> Be clear-eyed: a 6-digit PIN is 10⁶ candidates, and PBKDF2-SHA256 is exactly the kind of function a GPU chews through. **Assume anyone who images your disk recovers the PIN.** The blind digests leak correspondingly — someone with the database *and* a copy of the same library can hash their own filenames to learn which are vaulted.
>
> This defends against the realistic threat: **someone who picks up your unlocked laptop and clicks around.** It is not a defence against forensic analysis. The iteration count and auth tag make the easy attack expensive, not the hard one impossible. If you need the latter, the PIN pad accepts an arbitrary-length passphrase.
>
> **There is no recovery.** Forget the PIN and the contents list is gone (your video files, of course, are untouched — they were never moved).

> 🔐 **Secure context required.** `crypto.subtle` only exists on `https://` or `localhost`. Over plain `http://` the Vault refuses to open and says why, rather than falling back to something weaker.

---

## 🪟 Document Picture-in-Picture

Pop a whole **interactive panel** — not the bare video track `<video>.requestPictureInPicture()` gives you — into a floating always-on-top window. Three surfaces support it:

| Surface | Where the button is | Good for |
|---|---|---|
| **Multi-media grid** | Player controls (**⧉ Pop out**) | Keep watching while you work in another app |
| **Room chat** | Chat drawer header | Chat beside a fullscreen video without a drawer over it |
| **Watch party room** | Room header | Keep the host's stream on top while you browse your own library |

In the player the button falls back to native `<video>` PiP where Document PiP is unsupported. The chat and room buttons simply don't render there — there's no meaningful fallback for a panel, and a dead control is worse than none.

The browser allows **one** popout per document, so opening a second surface replaces the first. Whatever is popped out stands down in the main window: two live copies of the chat would fight over scroll position and composer focus, and two copies of the room would fight over a single `MediaStream`. If the surface goes away underneath it — the chat is closed, the room is left, the kill switch fires — the popout closes itself rather than sitting on top of your screen showing a dead panel.

The popout shares this page's JS realm, so every Zustand store is literally the same object and state sharing needs no bridge. What it does *not* share is the document — which means two things have to be carried across by hand, and both are load-bearing:

- **Stylesheets.** Copied rule-by-rule, with a `<link>` fallback for any sheet whose `cssRules` throws (Vite inlines CSS in dev, links it in production). Without them Tailwind classes resolve to nothing.
- **The `<body>` theme class.** LocalTube's entire palette comes from CSS variables on `body.theme-*`. Copy the sheets but not the class and every colour token falls back to the default — a light-theme user gets a dark popout. It's copied and kept in sync.

Only **one** grid may be live at a time: while popped out, the main window renders a placeholder instead. Two would build their own `<video>` elements for the same files — double decode, double memory, and two soundtracks a few frames out of sync.

---

## 🎞️ Hover Scrub Previews

Hover the progress bar to see a thumbnail of that moment, YouTube-style.

Frames are extracted **locally** by seeking an offscreen `<video>` and painting to a `<canvas>` — the source is a Blob URL from your own file handle, decoded by the browser, in your tab. No upload, no FFmpeg, and the original file is only ever opened for reading.

- 12 frames max at 160px wide (~3–5 KB each), sampled at each segment's **midpoint** — the first frame of a video is usually black or a fade-in, and a filmstrip starting with a black square looks broken.
- Cached in IndexedDB keyed by media id and stamped with the file's `size:mtime`, so an edited file re-extracts instead of showing stale frames. LRU-capped at 40 strips.
- Extraction is deferred behind a warmup + idle callback and serialised one-at-a-time, so it never competes with the video you're actually watching. It aborts the moment you switch videos, and every media event is timeout-bounded — a throttled tab can suspend decoding indefinitely, and an untimed wait would wedge the queue for the rest of the session.

---

## 🤝 P2P Watch Party (Opt-In)

A direct, end-to-end-encrypted link between two browsers — no upload, no relay, no account. **Off until you turn it on.**

### What it does

| | Capability | Description |
|---|---|---|
| 🔐 | **Password-protected rooms** | Pick a 4–10 **digit Room ID** and a passphrase. Both sides prove they know it before anything else is permitted. |
| 📤 | **Selective file push** | Tick specific items from *your* library and send them. The receiver must **accept** before a single byte is buffered. |
| 📡 | **Live Broadcast** | `captureStream()` on the video you're watching is streamed in real time to verified peers. They see **frames, not the file** — no copy lands on their disk. |
| ⚡ | **Dual-mode signaling** | Broadcasting works on the **public broker with zero setup** by tunnelling the media invitation through the encrypted DataChannel — or via a self-hosted PeerServer if you prefer. [Details ↓](#broadcasting-dual-mode-media-signaling) |
| 💬 | **Zero-persistence chat** | Room chat + private whispers, with image and file attachments. Nothing is ever written to disk — [details ↓](#zero-persistence-chat) |
| 🎟️ | **Instant invite links** | One click to join. Credentials ride in the URL **fragment**, so they never reach a server log or proxy — [details ↓](#instant-invite-links) |
| 🛋️ | **Watch Party Lobby** | A room UI with peer list, verification badges, and a waiting state that becomes the player the moment the host goes live. |
| 🧯 | **Kill Switch** | `peer.destroy()` + every `conn.close()` + every native `RTCPeerConnection.close()` + every `track.stop()` + `revokeObjectURL()` on all received blobs, in one click. |

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

**4. Kill switch.** Tears down transport *first* (so nothing can arrive mid-wipe), then revokes blob URLs, stops tracks, and resets state. Idempotent and never throws. This includes the bare `RTCPeerConnection`s created by relay mode, which the PeerJS instance does not own and `peer.destroy()` therefore does not close — they are closed by hand, with their inbound tracks stopped.

### Additional hardening

- **Receiving is opt-in too** — an offer is just an announcement; nothing is buffered until you click Accept.
- **MIME is never taken from the wire.** A Blob URL opens in *our own origin*, so honouring a peer-supplied type would let them script into it. The type is re-derived locally from the extension against an allowlist; anything unknown becomes an inert `application/octet-stream` download.
- **Filenames are reduced to a safe basename** — no path separators, no control characters, no leading dots, bounded length.
- **Backpressure** — chunks (16–64 KB, negotiated from `sctp.maxMessageSize`) are gated on `bufferedAmount`, and files are read lazily via `File.slice()` so a 4 GB video is never resident in memory.
- **Guests never accept inbound connections** (star topology), and media calls from unauthenticated peers are rejected outright.

### Instant invite links

The host can copy a one-click link instead of dictating a Room ID and passphrase:

```
https://your-host/#/p2p-join?d=eyJ2IjoxLCJyIjoiNDgyOTEzIiwicCI6Ii4uLiJ9
```

**Everything after `#` is stripped by the browser before the request goes out.** The credentials never appear in the request line, so they cannot reach a server access log, an intercepting proxy, or a CDN edge log — which is precisely why a query string would be the wrong place for them. The fragment is also excluded from the `Referer` header.

| | |
|---|---|
| **Never on the network** | Verified: a cold load of an invite URL made **zero** non-localhost requests and did not even fetch PeerJS. |
| **Scrubbed on arrival** | `history.replaceState` clears the fragment *before* the prompt renders, so the password is out of the address bar whatever the user does next. It replaces the current entry, so Back cannot return to it. `search` is preserved. |
| **A link cannot join for you** | The prompt is not a formality. Joining reveals your IP to the peer and loads PeerJS — the app's whole opt-in guarantee. Credentials are held in memory while you decide; nothing touches the network until you press **Instant Join**. |
| **Carries the signaling server** | If the host runs their own PeerServer, the invite says so and the prompt shows which host and port — a guest on the public broker would otherwise never find the room. Bounded and shape-checked on parse. |
| **Base64 is not encryption** | It stops shoulder-surfing and screen-shares. It is trivially reversible and is not a confidentiality control. |

Both encodings parse: the base64url payload above (what we emit) and the readable `#/p2p-join?room=123456&pwd=secret` form.

> ⚠️ **An invite link is a bearer credential.** Anyone who has it has the room, and it still lands in your clipboard, your browser history, and whatever you sent it over. A messenger or mail server that sees the link has the room. No amount of client-side care changes that — the UI says so plainly next to the button.

### Zero-persistence chat

Room chat, private whispers, and image/file attachments — all of it in RAM only.

| | |
|---|---|
| **Room + whispers** | One `Room (All)` thread plus a private thread per peer. A whisper is forwarded to exactly one connection, never fanned out. |
| **Attachments** | Images render inline with click-to-zoom; other files become a card with a Save button. Capped at **16 MB** and auto-accepted (a chat that asks permission per image is not a chat) — the library file push keeps its explicit consent step. |
| **Nothing is stored** | `useChatStore` is never wrapped in `persist()` and touches no `localStorage`, `sessionStorage`, `IndexedDB` or disk API. Refresh the tab and the transcript is gone. There is no export and no recovery. |
| **Blob hygiene** | Attachments are Blob URLs, which pin their bytes for the life of the document. All three removal paths — ring-buffer eviction at 500 messages, per-peer cleanup, and the kill switch — route through one `revoke()` helper. |
| **Kill switch** | `disconnectAll()` calls `clearAllChat()`: transcript emptied, every attachment URL revoked. Verified by fetching a URL after the wipe and confirming it no longer resolves. |

**Guest↔guest messages are relayed by the host**, because the room is a star and guests have no connection to each other. Two rules make that safe, and both are enforced in code rather than trusted from the wire:

- **Origin is stamped, never claimed.** When the host relays, it overwrites `from` with the identity of the connection the bytes actually arrived on. Tested by patching a guest's `RTCDataChannel.send` to forge `from`/`fromName` as the host — the message still displayed under the sender's real name.
- **Whispers are not fanned out.** A relayed whisper reaches one connection, and the relaying host does not display it. Tested with three peers: the host forwarded a guest→guest whisper without it appearing in the host's own transcript.

The host also publishes a **roster** so guests can open a whisper thread with peers they have no connection to. Those entries are marked `direct: false` — chat reaches them, file push and media do not, so anything moving bulk bytes filters on it.

> **Not stored ≠ not seen.** A room message is readable by everyone in the room, and a guest→guest whisper passes through the host's browser in plaintext (the DataChannel is encrypted hop-by-hop, but the host is a hop). Whispers are private *from other guests*, not from the host. Do not treat this as end-to-end encrypted messaging.

### Broadcasting: dual-mode media signaling

A WebRTC media connection needs an *invitation* (an SDP offer) to reach the other browser somehow. PeerJS's default public broker relays data offers happily but **silently drops the larger media offer** — which is why live broadcasting used to require running your own server. LocalTube now carries the invitation itself, and lets you choose:

| Mode | How the invitation travels | Setup |
|---|---|---|
| ⚡ **In-band relay** *(default)* | Through the **already-open, authenticated DataChannel** — the same peer-to-peer channel file transfer uses. The broker is bypassed entirely after the initial introduction. | **None.** Works out of the box on the public broker. |
| 🖥️ **Self-hosted PeerServer** | Native PeerJS routing (`peer.call`), i.e. through the signaling server. | `npx peer --port 9000`, then set host + port in **both** browsers. |

Both modes end at the same place: **one direct, DTLS/SRTP-encrypted `RTCPeerConnection`** between the two browsers. Only the route the invitation takes differs. Pick a mode under *Advanced — live video & signaling*; both peers should choose the same one.

The relay is the default because it is both **easier** (no terminal) and **more private** (a broker that never carries the media offer learns strictly less). It is also more reliable by construction: the DataChannel is ordered and reliable, so unlike a broker-relayed offer, the invitation cannot simply go missing.

<details>
<summary>Why this is not a security regression</summary>

- The three relay messages (`media-offer`, `media-answer`, `media-ice`) are **post-auth only** — they are not in `PRE_AUTH_TYPES`, so a stranger who guessed your Room ID has no channel on which to send them.
- The offer is **sendonly**, and the answering side adds no tracks and no transceivers of its own — so answering can never switch on a camera or microphone.
- SDP and ICE candidates are **bounds-checked** before reaching the browser's parser (size caps, `v=0` and `candidate:` prefixes, a required media section), inbound candidates are capped, and a `nid` discriminator makes stale traffic from a superseded negotiation inert.
- Nothing here can *request* anything. A relayed offer carries media the broadcaster chose to push — exactly like the mechanism it replaces. Invariant #1 is untouched.

</details>

> **What a signaling server can and cannot see.** It introduces the two browsers and sees your Room ID and IP. It **never** sees your files, your stream, or your password — media and data flow directly peer-to-peer over DTLS/SRTP. In relay mode it does not see the media invitation either; self-hosting removes the third party entirely.
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
│   │   │                       #    Also holds the legacy media-id migration.
│   │   ├── useLibraryStore.ts  # 🗂️ Workspace: mounted folder handles + named presets,
│   │   │                       #    persisted to IndexedDB via idb-keyval (handles are
│   │   │                       #    NOT JSON-serializable). Invariant: everything in
│   │   │                       #    activeHandles is permission-verified and readable.
│   │   ├── useSettingsStore.ts # 🕶️ Privacy config: stealth shortcut, cover style,
│   │   │                       #    hide-on-blur. isStealthActive is NEVER persisted —
│   │   │                       #    a panic screen surviving a reload would lock you out.
│   │   ├── useVaultStore.ts    # 🔐 Vault: encrypted membership in IndexedDB, 5-min
│   │   │                       #    idle auto-lock. The CryptoKey lives in a module
│   │   │                       #    variable, deliberately OUTSIDE the store.
│   │   ├── useChatStore.ts     # 💬 Chat transcript — 100% VOLATILE. No persist(), no
│   │   │                       #    storage API, ring-buffered at 500 messages, and the
│   │   │                       #    single owner of every attachment Blob URL's lifetime.
│   │   └── useWebRTCStore.ts   # 🤝 P2P session state — NEVER persisted, never touches
│   │                           #    localStorage: room id, passphrase, peers, transfer
│   │                           #    progress, active stream + the disconnectAll()
│   │                           #    kill switch. Holds no PeerJS objects.
│   │
│   ├── services/
│   │   ├── p2pProtocol.ts      # 📜 Wire contract: exhaustive message vocabulary (no
│   │   │                       #    read/list/get verb exists), PBKDF2+HMAC challenge
│   │   │                       #    /response, chunk framing, MIME allowlist, sanitizers,
│   │   │                       #    SDP/ICE validation. Side-effect free — opens nothing.
│   │   ├── webrtcService.ts    # 🔌 The ONLY module that touches the network. Lazily
│   │   │                       #    import()s PeerJS, runs the auth handshake, chunks
│   │   │                       #    files with backpressure, and routes broadcasts down
│   │   │                       #    either signaling branch (in-band relay / peer.call).
│   │   └── mediaElementRegistry.ts # Publishes the live <video> so Broadcast can
│   │                           #    captureStream() it; verifies tracks actually exist.
│   │
│   ├── hooks/
│   │   ├── useStealthMode.ts   # 🕶️ Global capture-phase panic listener + the audio
│   │   │                        #    kill (remembers prior muted state; MutationObserver
│   │   │                        #    silences videos mounted while hidden).
│   │   ├── useDocumentPiP.ts   # 🪟 Document PiP: opens the window, clones stylesheets,
│   │   │                        #    mirrors the body theme class, owns the pip store.
│   │   ├── useVaultGuard.ts    # 🔐 Resolves blind digests → ids to hide, and feeds
│   │   │                        #    the idle auto-lock timer from real user activity.
│   │   └── useScrubFrames.ts   # 🎞️ Cache-first filmstrip loading, deferred behind an
│   │                            #    idle callback and abortable on video change.
│   │
│   ├── utils/
│   │   ├── directoryScanner.ts # 📁 Recursive File System Access walk over N roots →
│   │   │                        #    merged MediaEntry[] + one synthetic folder tree.
│   │   │                        #    Mount-prefixes every path; READ-ONLY. One
│   │   │                        #    unreadable folder can't sink the whole scan.
│   │   ├── permissionUtils.ts  # 🔑 queryPermission (silent, safe on load) vs
│   │   │                        #    verifyPermission (prompts — must be first await
│   │   │                        #    in a click handler or the gesture is consumed).
│   │   ├── cryptoUtils.ts      # 🔐 PBKDF2(600k) → AES-256-GCM encrypt/decrypt +
│   │   │                        #    salted membership digests. Documents its own
│   │   │                        #    threat model. Keys are non-extractable.
│   │   ├── shortcutUtils.ts    # ⌨️ Canonical key-combo capture, exact matching
│   │   │                        #    (an extra modifier must NOT fire) and formatting.
│   │   ├── frameExtractor.ts   # 🎞️ Scrub filmstrip: offscreen seek+canvas capture,
│   │   │                        #    single-flight queue, timeout-bounded media events,
│   │   │                        #    IndexedDB cache keyed by id + size:mtime, LRU-capped.
│   │   ├── generateThumbnail.ts# 🖼️ Offscreen <video>+<canvas> frame extraction with
│   │   │                        #    a concurrency-limited queue (returns data: URL).
│   │   ├── layoutGrid.ts       # Grid template → inline CSS-grid styles + DnD MIME types
│   │   ├── backupUtils.ts      # Export/import user-data JSON (validate + sanitize)
│   │   ├── p2pInviteUtils.ts   # 🎟️ Invite links: build/parse a base64url payload that
│   │   │                        #    lives ONLY in the URL fragment, plus the
│   │   │                        #    replaceState scrub. Hostile input → null.
│   │   └── format.ts           # Duration / size / relative-time / resolution helpers
│   │
│   └── components/
│       ├── Welcome.tsx         # Cinematic landing: bundled background video, canvas
│       │                       #    dust particles, "Select Media Folder" + "My Presets"
│       ├── LibraryManager.tsx  # 🗂️ Workspace panel: mounted folders, add/remove,
│       │                       #    save/load/delete presets, re-grant permissions
│       ├── StealthOverlay.tsx  # 🕶️ The z-9999 privacy screen (blackout / fake
│       │                       #    terminal) + tab-title swap. Portalled to <body>.
│       ├── VaultModal.tsx      # 🔐 PIN pad: setup, confirm, unlock, destroy
│       ├── PiPStage.tsx        # 🪟 Portals the grid / chat / room into the Doc
│       │                       #    PiP window; closes it if the surface dies
│       ├── PopOutButton.tsx    # 🪟 Shared Doc PiP trigger (renders nothing where
│       │                       #    unsupported rather than showing a dead control)
│       ├── Scrubber.tsx        # 🎞️ Progress bar + hover thumbnail tooltip
│       ├── Header.tsx          # Top bar: search, Workspace button, layout, settings
│       ├── Sidebar.tsx         # Library nav, folder tree, Favorites, Vault, Playlists
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
│       ├── ThemeSwitcher.tsx   # Theme picker list with live swatches — hosted by
│       │                       #    SettingsModal, no longer its own header button
│       ├── SettingsModal.tsx   # Appearance (themes) + Stealth Mode config
│       │                       #    + Data Management: backup export / restore
│       ├── WebRTCBar.tsx       # 🤝 P2P entry point: create/join room, peer list,
│       │                       #    security log, chat toggle + KILL SWITCH
│       ├── InviteJoinModal.tsx # 🎟️ Detects an invite in the hash, scrubs it, then
│       │                       #    ASKS. A link never starts the network by itself.
│       ├── ChatPanel.tsx       # 💬 Chat drawer: room + whisper tabs, image/file
│       │                       #    bubbles, click-to-zoom, emoji, attach. Renders
│       │                       #    Blob URLs the store owns — mints/revokes none.
│       ├── WatchPartyLobby.tsx # 🛋️ The room: waiting → connecting → watching, over
│       │                       #    one persistent <video> (never remounts mid-stream)
│       ├── ShareModal.tsx      # 📤 Pick library items + peers → push; transfer
│       │                       #    progress; accept/decline + view/save received files
│       └── BroadcastView.tsx   # 📡 Host "Go live" controls, the in-player LIVE
│                               #    button, and the fullscreen viewer
│
├── bg-red-ball.mp4             # Landing-page background — bundled, NOT a CDN fetch
├── tailwind.config.js          # Semantic color tokens mapped to CSS variables
├── vite.config.ts              # Vite + React plugin (dev server only)
└── package.json                # 7 runtime deps: react, react-dom, zustand,
                                #   framer-motion, lucide-react, idb-keyval,
                                #   peerjs (lazy-loaded)
```

---

## ⚙️ How It Works (Technical Flow)

LocalTube has **no backend** — the browser itself is the runtime, storage, and media server.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. AUTHORIZE   User clicks "Select Folder" → window.showDirectoryPicker()   │
│                Browser sandbox grants a READ-ONLY FileSystemDirectoryHandle  │
│                Handles are stored in IndexedDB, so the workspace survives a   │
│                restart (re-granting permission needs one click on return)     │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. SCAN        directoryScanner.ts walks EVERY mounted handle and merges     │
│                them into one flat MediaEntry[] + one synthetic folder tree.   │
│                Each path is prefixed with its mount name, so ids stay unique  │
│                across folders. Each entry keeps a read-only file handle.      │
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
│                localStorage. The heavy library is never stored.              │
│                IndexedDB holds folder handles + presets, the encrypted        │
│                Vault, and the scrub-frame cache — nothing else.              │
└───────────────────────────────────────────────────────────────────────────┘
```

- **File System Access API** provides sandboxed, read-only access to one user-chosen directory — the trust boundary.
- **IntersectionObserver** keeps large libraries fast by deferring all file reads and thumbnail work until content is actually visible.
- **`<canvas>` extraction** turns a video frame into a lightweight inline `data:` thumbnail without a server or FFmpeg.
- **Zustand + persist** gives a single reactive store and durable-yet-minimal preferences, so the app "remembers you" without a database.
- **IndexedDB (via `idb-keyval`)** is used only where `localStorage` physically cannot work: directory handles are opaque platform objects that structured-clone preserves and `JSON.stringify` destroys, and the Vault stores raw `Uint8Array` ciphertext.

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
│ 3b. BROADCAST  captureStream() on the live <video> → offered to every        │
│                VERIFIED peer, by one of two routes:                          │
│                  ⚡ in-band relay  — SDP + ICE over the DataChannel (default)│
│                  🖥️ native routing — peer.call() via the signaling server    │
│                Guest answers receive-only (no camera/mic ever offered back)  │
│                and attaches the MediaStream via srcObject.                   │
├───────────────────────────────────────────────────────────────────────────┤
│ 4. KILL        disconnectAll() → transport torn down FIRST, then blob URLs   │
│                revoked, tracks stopped, state wiped. Browser is isolated.    │
└───────────────────────────────────────────────────────────────────────────┘
```

- **A MediaStream must be attached via `srcObject`, never `src`** — it has no URL, and stringifying it yields `"[object MediaStream]"` and a silently blank element. Both viewers do this imperatively through a ref + effect.
- **Media offers are signaling traffic**, so a broker can drop them while the peer-to-peer DataChannel stays perfectly healthy — the failure that motivated the in-band relay. A watchdog still asks for a re-offer over the reliable channel and gives up with a **mode-specific** actionable message rather than hanging forever.
- **The two branches share one delivery path.** Whichever route the offer took, the received stream lands in `commitIncomingStream()`, which rejects zero-track streams, cancels the watchdog, and re-commits on `addtrack` so audio negotiated a beat after video is not lost.

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
Then open the printed URL (default **http://localhost:5173**), click **Select Media Folder**, and choose any folder of videos/images.

### Build for production
```bash
npm run build      # type-checks (tsc -b) then bundles with Vite → dist/
npm run preview    # serve the production build locally
```

### Supported formats
- **Video:** `.mp4`, `.webm`, `.ogg`, `.ogv`, `.mov`, `.mkv`, `.m4v`
- **Image:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`

### Building a multi-folder workspace

1. Open **Workspace** in the header (or **My Presets** on the welcome screen).
2. **Add folder to workspace** — repeat for as many folders as you want. They merge into one library immediately.
3. Type a name and press **Save** to store the combination as a preset.
4. Next session, click the preset to reopen all of its folders at once. Browsers drop folder access on restart, so you'll get one permission prompt per folder — that click is required by the browser and can't be skipped.

### Setting up Stealth Mode

1. **Settings** (gear icon) → **Stealth Mode**.
2. Click the shortcut button and press your combination — at least one modifier plus a key. <kbd>Esc</kbd> alone cancels recording.
3. Pick a cover: **Blackout** or **Fake terminal**. **Try it now** demonstrates it safely.

### Using the Vault

1. **Set up Vault** in the sidebar → choose a PIN of 6+ digits (or a longer passphrase) and confirm it. Deriving the key takes a few hundred milliseconds by design.
2. Add items from any card's playlist menu → **Move to Private Vault**.
3. While locked, those items are gone from the grid, from search, and from the playback queue. Unlock from the sidebar to see them again; it re-locks after 5 minutes idle.

> Read [what the Vault does and does not protect against](#private-vault--the-pin-lock) before trusting it with anything that genuinely matters.

### Using the P2P Watch Party

1. Click the **share icon** in the header (it's also on the welcome screen — a guest who only wants to watch or receive doesn't need a folder).
2. **Host a room** → generate a Room ID and set a strong passphrase → **Open room**.
3. Share the digits and passphrase with your guest **over a channel you trust** — anyone who has both can join. Or press **Copy invite link** for a one-click join URL (same caveat: anyone holding it can join).
4. The guest picks **Join a room**, enters the same two values, and lands in the Watch Party Lobby once verified.
5. **Send files** pushes selected library items; **Go live** broadcasts the video you're currently playing. Once a peer is verified, a **Go Live** button also appears directly on the player's control bar (next to Theater / Ambient) and turns into a pulsing **LIVE** badge you can click to stop. With no peers connected it is not rendered at all, so solo viewing is unchanged.
6. The **chat icon** in the header opens the room chat — group thread, per-peer private whispers, and image/file attachments. Nothing there is ever written to disk.

> ⚡ **Live Broadcast works with no setup.** It defaults to the in-band relay, which tunnels the video invitation through the encrypted DataChannel instead of the public broker. If you'd rather run your own signaling server (`npx peer --port 9000`), switch to **Self-hosted PeerServer** under *Advanced — live video & signaling* in **both** browsers. See [the section above](#broadcasting-dual-mode-media-signaling) for the trade-offs.

> 🔐 **Secure context required.** Room passphrases use WebCrypto, which only exists on `https://` or `localhost`. Serving LocalTube over plain `http://` on a LAN IP will fail loudly rather than fall back to something weaker.

---

## 🗺️ Roadmap (Not Yet Implemented)

These are planned and **not currently in the codebase**:

- 🔤 **Local Subtitle Support** — drag-and-drop `.srt` / `.vtt` files and auto-discover sidecar subtitle tracks.
- ⌨️ Global keyboard-shortcut cheatsheet.
- 🗃️ Moving tags/playlists to IndexedDB for very large datasets. *(IndexedDB is already used for workspace handles, the Vault and the frame cache — this item is specifically about the tag/playlist store.)*
- 🔐 Optional Argon2id KDF for the Vault, to blunt the GPU advantage a PIN currently gives an offline attacker.

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
| Multi-folder: still read-only | ✅ Verified | `showDirectoryPicker({ mode: 'read' })`; the scanner only ever calls `getFile()`. Adding/removing a folder mutates a handle list, never the disk |
| Media ids unique across folders | ✅ Verified | Node harness: two mounts each containing `clip.mp4` keep distinct ids; a folder's ids are byte-identical whether or not other folders are mounted |
| Stealth: cannot be swallowed | ✅ Verified | Capture phase + `stopImmediatePropagation`; confirmed the player's own Escape handler no longer fires, and the shortcut still works from a focused `<input>` |
| Stealth: audio kill is reversible | ✅ Verified | Prior `muted` restored per element — a video the user had muted stays muted after exit; a video mounted *while* hidden is born muted |
| Vault: no plaintext at rest | ✅ Verified | The stored IndexedDB record was inspected: filenames appear nowhere in ciphertext, salt, IV or digests |
| Vault: wrong PIN rejected | ✅ Verified | GCM tag failure. Tampered ciphertext and substituted salt are rejected identically — the error deliberately can't distinguish wrong-PIN from corruption |
| Vault: IV never reused | ✅ Verified | 8 encryptions of identical plaintext → 8 distinct IVs **and** 8 distinct ciphertexts |
| Vault: hidden while locked | ✅ Verified | Vaulted items absent from the grid, from global search, and from the playback queue while locked; restored on unlock |
| Vault: offline brute force | ⚠️ **Limited by design** | A 6-digit PIN is 10⁶ candidates against a GPU-friendly KDF. Protects against casual access to an unlocked machine, **not** against disk imaging — see [the threat model](#private-vault--the-pin-lock) |
| Doc PiP: no network | ✅ By construction | The popout shares this page's realm; stylesheets are cloned from already-loaded local sheets, never re-fetched |
| Scrub previews: local only | ✅ Verified | Blob URL → offscreen `<video>` → `<canvas>`; frames cached in IndexedDB. No `fetch`, no upload |
| P2P: no remote read | ✅ Verified | Protocol has no read/list/get message; service holds no library reference or file handle |
| P2P: room auth | ✅ Verified | Mutual PBKDF2(250k)+HMAC proof, constant-time compare, 3-strike lockout, 15 s timeout; wrong password drops the connection (tested) |
| P2P: session secrets | ✅ Verified | `useWebRTCStore` is **not** wrapped in `persist`; room id and passphrase die with the tab |
| P2P: kill switch | ✅ Verified | Transport destroyed first, then blobs revoked and state wiped; propagation to the remote peer tested. Relayed `RTCPeerConnection`s observed reaching `closed` and inbound tracks `ended` after one click |
| P2P: relay signaling | ✅ Verified | `media-*` messages are post-auth only; SDP/ICE bounds-checked and candidate-capped; answering side adds no tracks, so it is receive-only by construction |
| Chat: zero persistence | ✅ Verified | No `persist()`, no storage API in the chat path; after a session, `indexedDB.databases()` empty and `localStorage` held only the two pre-existing LocalTube keys with no chat content |
| Chat: blob revocation | ✅ Verified | Attachment URL fetched successfully before the kill switch and failed to resolve after it |
| Chat: origin spoofing | ✅ Verified | Forged `from`/`fromName` injected at the guest's `RTCDataChannel.send` were discarded; the host attributed the message to the real connection |
| Chat: whisper isolation | ✅ Verified | Three-peer test: host relayed a guest→guest whisper without displaying it |
| Invite: no server leakage | ✅ Verified | Loading an invite URL produced zero non-localhost requests and did not fetch PeerJS; credentials sit only in the fragment |
| Invite: URL scrubbed | ✅ Verified | `location.href` back to origin before the prompt rendered, on both the page-load and `hashchange` paths |
| Invite: no drive-by join | ✅ Verified | PeerJS loaded only after the user pressed Instant Join, never on link open |
| Invite: hostile input | ✅ Verified | 14-case battery — bad route, corrupt base64, non-JSON, arrays, wrong version, out-of-range room/password, 5 KB hash — all return `null`; unknown payload keys dropped, `Object.prototype` untouched; signaling host/port/path bounds-checked |

**Recommended production hardening:** ship a strict Content-Security-Policy. Without P2P:
`default-src 'self'; connect-src 'none'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'`

With the Watch Party enabled, `connect-src` must allow your signaling server only — e.g.
`connect-src wss://peer.example.com` (or `wss://0.peerjs.com` for the default broker) — which keeps the "no exfiltration" guarantee browser-enforced while permitting the one connection you chose. Note that `connect-src` does not govern `RTCPeerConnection`; ICE/STUN reachability is controlled separately, and in-band relay mode adds no new origin beyond the broker.

---

<div align="center">

**LocalTube** — your media, your machine, your rules. No cloud required.

</div>
