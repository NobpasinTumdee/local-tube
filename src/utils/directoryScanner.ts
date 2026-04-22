export type MediaType = 'video' | 'image';

const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'm4v']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);

export interface MediaEntry {
  id: string;
  title: string;
  filename: string;
  /** Full relative path from root, e.g. "Movies/Action/film.mp4" */
  path: string;
  /** Direct parent folder path, e.g. "Movies/Action". Empty string = root. */
  parentPath: string;
  /** Legacy: top-level folder name or "Home" */
  playlist: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
  mediaType: MediaType;
}

/** @deprecated Use MediaEntry instead */
export type VideoEntry = MediaEntry;

/** A node in the recursive folder tree */
export interface FolderNode {
  name: string;
  /** Full path from root, e.g. "Movies/Action". Empty = root. */
  path: string;
  children: FolderNode[];
  /** Total media count (recursive) */
  mediaCount: number;
}

export interface ScanResult {
  rootName: string;
  videos: MediaEntry[];
  /** @deprecated kept for backward compat */
  playlists: string[];
  directoryTree: FolderNode;
}

/* ── helpers ── */
const getExt = (n: string) => {
  const i = n.lastIndexOf('.');
  return i < 0 ? '' : n.slice(i + 1).toLowerCase();
};
const stripExt = (n: string) => {
  const i = n.lastIndexOf('.');
  return i < 0 ? n : n.slice(0, i);
};

/* ── main scanner ── */
export async function scanDirectory(
  root: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<ScanResult> {
  const entries: MediaEntry[] = [];
  const topLevelFolders = new Set<string>();

  /** Returns media count for this subtree */
  async function walk(
    dir: FileSystemDirectoryHandle,
    relPath: string,       // path of THIS directory (empty = root)
    topLevel: string,      // first-level folder name (empty = root)
    node: FolderNode,      // tree node for THIS directory
  ): Promise<void> {
    for await (const [name, handle] of dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file') {
        const e = getExt(name);
        const isVideo = VIDEO_EXT.has(e);
        const isImage = IMAGE_EXT.has(e);
        if (!isVideo && !isImage) continue;

        const fh = handle as FileSystemFileHandle;
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
        if (topLevel) topLevelFolders.add(topLevel);
        node.mediaCount++;
        onProgress?.(entries.length);

      } else if (handle.kind === 'directory') {
        const sub = handle as FileSystemDirectoryHandle;
        const childPath = relPath ? `${relPath}/${name}` : name;
        const childNode: FolderNode = { name, path: childPath, children: [], mediaCount: 0 };
        node.children.push(childNode);

        await walk(
          sub,
          childPath,
          topLevel || name,
          childNode,
        );

        // bubble up count
        node.mediaCount += childNode.mediaCount;
      }
    }

    // sort children alphabetically
    node.children.sort((a, b) => a.name.localeCompare(b.name));
  }

  const rootNode: FolderNode = { name: root.name, path: '', children: [], mediaCount: 0 };
  await walk(root, '', '', rootNode);

  return {
    rootName: root.name,
    videos: entries,
    playlists: [...topLevelFolders].sort((a, b) => a.localeCompare(b)),
    directoryTree: rootNode,
  };
}

/** Returns immediate child FolderNodes of a given path */
export function getChildFolders(tree: FolderNode, folderPath: string): FolderNode[] {
  if (folderPath === '') return tree.children;
  const parts = folderPath.split('/');
  let node: FolderNode = tree;
  for (const part of parts) {
    const next = node.children.find((c) => c.name === part);
    if (!next) return [];
    node = next;
  }
  return node.children;
}

/** Navigates to the FolderNode at the given path ('' = root). Returns null if not found. */
export function getFolderNode(tree: FolderNode, folderPath: string): FolderNode | null {
  if (folderPath === '') return tree;
  const parts = folderPath.split('/');
  let node: FolderNode = tree;
  for (const part of parts) {
    const next = node.children.find((c) => c.name === part);
    if (!next) return null;
    node = next;
  }
  return node;
}

/**
 * Recursively collect all MediaEntry IDs that live under a given folder node.
 * The caller passes in the full flat `videos` array and filters by matching path prefix.
 */
export function getAllFilesRecursively(
  allFiles: readonly { id: string; parentPath: string }[],
  folderPath: string,
): string[] {
  // A file belongs to this subtree if its parentPath equals folderPath
  // or starts with folderPath + '/'
  const prefix = folderPath === '' ? '' : folderPath + '/';
  return allFiles
    .filter((f) =>
      folderPath === ''
        ? true
        : f.parentPath === folderPath || f.parentPath.startsWith(prefix),
    )
    .map((f) => f.id);
}
