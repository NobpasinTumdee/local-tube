const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'm4v']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);
/* ── helpers ── */
const getExt = (n) => {
    const i = n.lastIndexOf('.');
    return i < 0 ? '' : n.slice(i + 1).toLowerCase();
};
const stripExt = (n) => {
    const i = n.lastIndexOf('.');
    return i < 0 ? n : n.slice(0, i);
};
/* ─────────────────────────────────────────────────────────────
 *  MULTI-DIRECTORY SCANNER
 * ─────────────────────────────────────────────────────────────
 *  Every picked folder is *mounted* under its own name inside one synthetic
 *  workspace tree:
 *
 *      ''  (workspace root, not a real directory)
 *      ├── Anime/          ← mount, root.name
 *      │   └── Season 1/
 *      └── Movies/         ← mount
 *
 *  Two consequences make the merge work without touching the rest of the app:
 *
 *  1. Because the mount name prefixes every path, `MediaEntry.id` stays
 *     globally unique across folders. That id is the key for favorites, tags
 *     and resume positions — without the prefix, "movie.mp4" in two different
 *     folders would be one item as far as the store is concerned, and the two
 *     would silently share a watch position.
 *  2. The synthetic root is shaped exactly like a real FolderNode, so
 *     getChildFolders / getAllFilesRecursively / Breadcrumb / the sidebar
 *     tree all keep working unmodified — a merged workspace is navigated the
 *     same way a single folder always was.
 *
 *  An id therefore depends only on the file's own mount, never on how many
 *  other folders happen to be open. Adding a second folder cannot re-key the
 *  first one's favorites.
 * ───────────────────────────────────────────────────────────── */
/**
 * Two folders can legitimately share a name ("Downloads" on two drives).
 * Since the mount name is the id prefix, collisions would merge them into
 * one branch and re-introduce exactly the id clash the prefix exists to
 * prevent — so later duplicates are suffixed.
 */
function uniqueMountName(folderName, taken) {
    const base = folderName || 'Folder';
    if (!taken.has(base))
        return base;
    for (let i = 2;; i++) {
        const candidate = `${base} (${i})`;
        if (!taken.has(candidate))
            return candidate;
    }
}
/**
 * Scans every folder and merges the results into one flat library.
 *
 * A folder that cannot be read (grant revoked, drive unplugged, folder
 * deleted) is recorded on its MountedRoot as an `error` instead of rejecting
 * the whole scan — losing one folder should not empty the workspace.
 */
export async function scanMultipleDirectories(rootHandles, onProgress) {
    const entries = [];
    const roots = [];
    const takenNames = new Set();
    const workspaceNode = { name: 'Workspace', path: '', children: [], mediaCount: 0 };
    async function walk(dir, relPath, // path of THIS directory, mount-prefixed
    mountName, // the workspace folder this subtree belongs to
    node) {
        for await (const [name, handle] of dir.entries()) {
            if (handle.kind === 'file') {
                const e = getExt(name);
                const isVideo = VIDEO_EXT.has(e);
                const isImage = IMAGE_EXT.has(e);
                if (!isVideo && !isImage)
                    continue;
                const fh = handle;
                const file = await fh.getFile();
                const filePath = `${relPath}/${name}`;
                entries.push({
                    id: filePath,
                    title: stripExt(name),
                    filename: name,
                    path: filePath,
                    parentPath: relPath,
                    rootFolderName: mountName,
                    playlist: mountName,
                    handle: fh,
                    size: file.size,
                    lastModified: file.lastModified,
                    mediaType: isVideo ? 'video' : 'image',
                });
                node.mediaCount++;
                onProgress?.(entries.length);
            }
            else if (handle.kind === 'directory') {
                const sub = handle;
                const childPath = `${relPath}/${name}`;
                const childNode = { name, path: childPath, children: [], mediaCount: 0 };
                node.children.push(childNode);
                await walk(sub, childPath, mountName, childNode);
                node.mediaCount += childNode.mediaCount;
            }
        }
        node.children.sort((a, b) => a.name.localeCompare(b.name));
    }
    /* Sequential rather than Promise.all: each walk is already I/O-bound on the
       same disk, and interleaving them would make onProgress jump around. */
    for (const handle of rootHandles) {
        const mountName = uniqueMountName(handle.name, takenNames);
        takenNames.add(mountName);
        const mountNode = { name: mountName, path: mountName, children: [], mediaCount: 0 };
        const before = entries.length;
        try {
            await walk(handle, mountName, mountName, mountNode);
            workspaceNode.children.push(mountNode);
            workspaceNode.mediaCount += mountNode.mediaCount;
            roots.push({ name: mountName, folderName: handle.name, handle, mediaCount: mountNode.mediaCount });
        }
        catch (err) {
            /* Roll back this mount's partial entries so the library never shows a
               half-scanned folder. */
            entries.length = before;
            roots.push({
                name: mountName,
                folderName: handle.name,
                handle,
                mediaCount: 0,
                error: err instanceof Error ? err.message : 'Folder could not be read',
            });
        }
    }
    workspaceNode.children.sort((a, b) => a.name.localeCompare(b.name));
    const ok = roots.filter((r) => !r.error);
    const rootName = ok.length === 0 ? '' : ok.length === 1 ? ok[0].name : `${ok.length} folders`;
    return {
        rootName,
        roots,
        videos: entries,
        playlists: ok.map((r) => r.name),
        directoryTree: workspaceNode,
    };
}
/**
 * Single-folder scan.
 * @deprecated Prefer scanMultipleDirectories — kept so callers that only ever
 * hold one handle don't have to wrap it themselves.
 */
export async function scanDirectory(root, onProgress) {
    return scanMultipleDirectories([root], onProgress);
}
/** The library with every folder unmounted. */
export function emptyScanResult() {
    return {
        rootName: '',
        roots: [],
        videos: [],
        playlists: [],
        directoryTree: { name: 'Workspace', path: '', children: [], mediaCount: 0 },
    };
}
/** Returns immediate child FolderNodes of a given path */
export function getChildFolders(tree, folderPath) {
    if (folderPath === '')
        return tree.children;
    const parts = folderPath.split('/');
    let node = tree;
    for (const part of parts) {
        const next = node.children.find((c) => c.name === part);
        if (!next)
            return [];
        node = next;
    }
    return node.children;
}
/** Navigates to the FolderNode at the given path ('' = root). Returns null if not found. */
export function getFolderNode(tree, folderPath) {
    if (folderPath === '')
        return tree;
    const parts = folderPath.split('/');
    let node = tree;
    for (const part of parts) {
        const next = node.children.find((c) => c.name === part);
        if (!next)
            return null;
        node = next;
    }
    return node;
}
/**
 * Recursively collect all MediaEntry IDs that live under a given folder node.
 * The caller passes in the full flat `videos` array and filters by matching path prefix.
 */
export function getAllFilesRecursively(allFiles, folderPath) {
    // A file belongs to this subtree if its parentPath equals folderPath
    // or starts with folderPath + '/'
    const prefix = folderPath === '' ? '' : folderPath + '/';
    return allFiles
        .filter((f) => folderPath === ''
        ? true
        : f.parentPath === folderPath || f.parentPath.startsWith(prefix))
        .map((f) => f.id);
}
