export type MediaType = 'video' | 'image';

const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'm4v']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);

export interface MediaEntry {
  id: string;
  title: string;
  filename: string;
  /**
   * Full path from the workspace root, ALWAYS prefixed by the mount name:
   * "Movies/Action/film.mp4" where "Movies" is the picked folder.
   */
  path: string;
  /** Direct parent folder path, e.g. "Movies/Action". Never empty. */
  parentPath: string;
  /** The workspace folder this file came from (its unique mount name). */
  rootFolderName: string;
  /** Legacy: now mirrors rootFolderName. */
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
  /** Full path from the workspace root, e.g. "Movies/Action". Empty = workspace root. */
  path: string;
  children: FolderNode[];
  /** Total media count (recursive) */
  mediaCount: number;
}

/** One picked folder, mounted into the workspace under a unique name. */
export interface MountedRoot {
  /** Unique display/mount name — the folder name, suffixed on collision. */
  name: string;
  /** The folder's own name as reported by the OS (may repeat across mounts). */
  folderName: string;
  handle: FileSystemDirectoryHandle;
  mediaCount: number;
  /** Set when the folder could not be read (revoked grant, moved, unplugged). */
  error?: string;
}

export interface ScanResult {
  /** Display label for the workspace: the folder name, or "N folders". */
  rootName: string;
  roots: MountedRoot[];
  videos: MediaEntry[];
  /** @deprecated kept for backward compat — now the mount names. */
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
function uniqueMountName(folderName: string, taken: Set<string>): string {
  const base = folderName || 'Folder';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Scans every folder and merges the results into one flat library.
 *
 * A folder that cannot be read (grant revoked, drive unplugged, folder
 * deleted) is recorded on its MountedRoot as an `error` instead of rejecting
 * the whole scan — losing one folder should not empty the workspace.
 */
export async function scanMultipleDirectories(
  rootHandles: readonly FileSystemDirectoryHandle[],
  onProgress?: (count: number) => void,
): Promise<ScanResult> {
  const entries: MediaEntry[] = [];
  const roots: MountedRoot[] = [];
  const takenNames = new Set<string>();

  const workspaceNode: FolderNode = { name: 'Workspace', path: '', children: [], mediaCount: 0 };

  async function walk(
    dir: FileSystemDirectoryHandle,
    relPath: string,   // path of THIS directory, mount-prefixed
    mountName: string, // the workspace folder this subtree belongs to
    node: FolderNode,  // tree node for THIS directory
  ): Promise<void> {
    for await (const [name, handle] of dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file') {
        const e = getExt(name);
        const isVideo = VIDEO_EXT.has(e);
        const isImage = IMAGE_EXT.has(e);
        if (!isVideo && !isImage) continue;

        const fh = handle as FileSystemFileHandle;
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

      } else if (handle.kind === 'directory') {
        const sub = handle as FileSystemDirectoryHandle;
        const childPath = `${relPath}/${name}`;
        const childNode: FolderNode = { name, path: childPath, children: [], mediaCount: 0 };
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

    const mountNode: FolderNode = { name: mountName, path: mountName, children: [], mediaCount: 0 };
    const before = entries.length;

    try {
      await walk(handle, mountName, mountName, mountNode);
      workspaceNode.children.push(mountNode);
      workspaceNode.mediaCount += mountNode.mediaCount;
      roots.push({ name: mountName, folderName: handle.name, handle, mediaCount: mountNode.mediaCount });
    } catch (err) {
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
  const rootName =
    ok.length === 0 ? '' : ok.length === 1 ? ok[0].name : `${ok.length} folders`;

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
export async function scanDirectory(
  root: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<ScanResult> {
  return scanMultipleDirectories([root], onProgress);
}

/** The library with every folder unmounted. */
export function emptyScanResult(): ScanResult {
  return {
    rootName: '',
    roots: [],
    videos: [],
    playlists: [],
    directoryTree: { name: 'Workspace', path: '', children: [], mediaCount: 0 },
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
