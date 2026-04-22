export type MediaType = 'video' | 'image';

const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'm4v']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);

export interface MediaEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  playlist: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
  mediaType: MediaType;
}

/** @deprecated Use MediaEntry instead */
export type VideoEntry = MediaEntry;

export interface ScanResult {
  rootName: string;
  videos: MediaEntry[];
  playlists: string[];
}

const ext = (n: string) => {
  const i = n.lastIndexOf('.');
  return i < 0 ? '' : n.slice(i + 1).toLowerCase();
};

const stripExt = (n: string) => {
  const i = n.lastIndexOf('.');
  return i < 0 ? n : n.slice(0, i);
};

export async function scanDirectory(
  root: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<ScanResult> {
  const entries: MediaEntry[] = [];
  const playlists = new Set<string>();

  async function walk(
    dir: FileSystemDirectoryHandle,
    relPath: string,
    topLevel: string,
  ): Promise<void> {
    for await (const [name, handle] of dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file') {
        const e = ext(name);
        const isVideo = VIDEO_EXT.has(e);
        const isImage = IMAGE_EXT.has(e);
        if (!isVideo && !isImage) continue;

        const fh = handle as FileSystemFileHandle;
        const file = await fh.getFile();
        entries.push({
          id: relPath ? `${relPath}/${name}` : name,
          title: stripExt(name),
          filename: name,
          path: relPath ? `${relPath}/${name}` : name,
          playlist: topLevel || 'Home',
          handle: fh,
          size: file.size,
          lastModified: file.lastModified,
          mediaType: isVideo ? 'video' : 'image',
        });
        if (topLevel) playlists.add(topLevel);
        onProgress?.(entries.length);
      } else if (handle.kind === 'directory') {
        const sub = handle as FileSystemDirectoryHandle;
        await walk(
          sub,
          relPath ? `${relPath}/${name}` : name,
          topLevel || name,
        );
      }
    }
  }

  await walk(root, '', '');

  return {
    rootName: root.name,
    videos: entries,
    playlists: [...playlists].sort((a, b) => a.localeCompare(b)),
  };
}
