import { THEMES } from '../store/useStore';
import type { ImportedUserData, ThemeId, VirtualPlaylist } from '../store/useStore';

/*
 * Client-side backup: serialize the user's customizations to a portable .json
 * file and restore them later. Nothing here touches the physical media library —
 * only favorites, virtual playlists, custom tags, theme, and watch progress.
 */

const APP_MARKER = 'LocalTube';
const BACKUP_TYPE = 'user-data-backup';
const BACKUP_VERSION = 1;

/** The on-disk backup envelope (marker fields let us validate on import). */
export interface BackupFile {
  app: typeof APP_MARKER;
  type: typeof BACKUP_TYPE;
  version: number;
  exportedAt: string;
  data: ImportedUserData;
}

/** The store fields we read when exporting. */
export interface ExportableState {
  favorites: string[];
  virtualPlaylists: VirtualPlaylist[];
  mediaTags: Record<string, string[]>;
  currentTheme: ThemeId;
  playbackProgress: Record<string, number>;
}

/* ─────────────── EXPORT ─────────────── */
export function exportUserData(state: ExportableState): void {
  const payload: BackupFile = {
    app: APP_MARKER,
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      favorites: state.favorites ?? [],
      virtualPlaylists: state.virtualPlaylists ?? [],
      mediaTags: state.mediaTags ?? {},
      currentTheme: state.currentTheme,
      playbackProgress: state.playbackProgress ?? {},
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `localtube-backup-${todayStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* revoke after the download has kicked off to avoid leaking the blob URL */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ─────────────── IMPORT ─────────────── */
export interface ImportResult {
  ok: boolean;
  error?: string;
  summary?: { favorites: number; playlists: number; taggedItems: number; progressItems: number };
}

export async function importUserData(
  file: File,
  updateStore: (data: ImportedUserData) => void,
): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: 'Could not read the selected file.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }

  const result = validateBackup(parsed);
  if (!result.ok) return { ok: false, error: result.error };

  updateStore(result.data);
  return {
    ok: true,
    summary: {
      favorites: result.data.favorites.length,
      playlists: result.data.virtualPlaylists.length,
      taggedItems: Object.keys(result.data.mediaTags).length,
      progressItems: Object.keys(result.data.playbackProgress).length,
    },
  };
}

/* ─────────────── VALIDATION / SANITIZE ─────────────── */
function validateBackup(
  parsed: unknown,
): { ok: true; data: ImportedUserData } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Unrecognized backup format.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== APP_MARKER || obj.type !== BACKUP_TYPE) {
    return { ok: false, error: 'This does not look like a LocalTube backup file.' };
  }

  const data = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      favorites: sanitizeStringArray(data.favorites),
      virtualPlaylists: sanitizePlaylists(data.virtualPlaylists),
      mediaTags: sanitizeTagMap(data.mediaTags),
      playbackProgress: sanitizeNumberMap(data.playbackProgress),
      currentTheme: sanitizeTheme(data.currentTheme),
    },
  };
}

const sanitizeStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function sanitizeTagMap(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const arr = sanitizeStringArray(val);
      if (arr.length) out[k] = arr;
    }
  }
  return out;
}

function sanitizeNumberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    }
  }
  return out;
}

function sanitizePlaylists(v: unknown): VirtualPlaylist[] {
  if (!Array.isArray(v)) return [];
  const out: VirtualPlaylist[] = [];
  for (const p of v) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.title !== 'string') continue;
    out.push({
      id: o.id,
      title: o.title,
      createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
      mediaIds: sanitizeStringArray(o.mediaIds),
    });
  }
  return out;
}

const sanitizeTheme = (v: unknown): ThemeId | undefined =>
  typeof v === 'string' && THEMES.some((t) => t.id === v) ? (v as ThemeId) : undefined;
