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
/* ── main scanner ── */
export async function scanDirectory(root, onProgress) {
    const entries = [];
    const topLevelFolders = new Set();
    /** Returns media count for this subtree */
    async function walk(dir, relPath, // path of THIS directory (empty = root)
    topLevel, // first-level folder name (empty = root)
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
                const filePath = relPath ? `${relPath}/${name}` : name;
                entries.push({
                    id: filePath,
                    title: stripExt(name),
                    filename: name,
                    path: filePath,
                    parentPath: relPath,
                    playlist: topLevel || 'Home',
                    handle: fh,
                    size: file.size,
                    lastModified: file.lastModified,
                    mediaType: isVideo ? 'video' : 'image',
                });
                if (topLevel)
                    topLevelFolders.add(topLevel);
                node.mediaCount++;
                onProgress?.(entries.length);
            }
            else if (handle.kind === 'directory') {
                const sub = handle;
                const childPath = relPath ? `${relPath}/${name}` : name;
                const childNode = { name, path: childPath, children: [], mediaCount: 0 };
                node.children.push(childNode);
                await walk(sub, childPath, topLevel || name, childNode);
                // bubble up count
                node.mediaCount += childNode.mediaCount;
            }
        }
        // sort children alphabetically
        node.children.sort((a, b) => a.name.localeCompare(b.name));
    }
    const rootNode = { name: root.name, path: '', children: [], mediaCount: 0 };
    await walk(root, '', '', rootNode);
    return {
        rootName: root.name,
        videos: entries,
        playlists: [...topLevelFolders].sort((a, b) => a.localeCompare(b)),
        directoryTree: rootNode,
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
