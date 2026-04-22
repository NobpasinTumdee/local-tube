const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'm4v']);

export interface VideoEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  playlist: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
}

export interface ScanResult {
  rootName: string;
  videos: VideoEntry[];
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
  const videos: VideoEntry[] = [];
  const playlists = new Set<string>();

  async function walk(
    dir: FileSystemDirectoryHandle,
    relPath: string,
    topLevel: string,
  ): Promise<void> {
    for await (const [name, handle] of dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file') {
        if (!VIDEO_EXT.has(ext(name))) continue;
        const fh = handle as FileSystemFileHandle;
        const file = await fh.getFile();
        videos.push({
          id: relPath ? `${relPath}/${name}` : name,
          title: stripExt(name),
          filename: name,
          path: relPath ? `${relPath}/${name}` : name,
          playlist: topLevel || 'Home',
          handle: fh,
          size: file.size,
          lastModified: file.lastModified,
        });
        if (topLevel) playlists.add(topLevel);
        onProgress?.(videos.length);
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
    videos,
    playlists: [...playlists].sort((a, b) => a.localeCompare(b)),
  };
}
