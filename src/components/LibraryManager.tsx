import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bookmark,
  Check,
  FolderPlus,
  Layers,
  Loader2,
  Lock,
  Trash2,
  X,
} from 'lucide-react';
import { useLibraryStore, type WorkspacePreset } from '../store/useLibraryStore';
import { useStore } from '../store/useStore';

/* ─────────────────────────────────────────────────────────────
 *  WORKSPACE MANAGER
 * ─────────────────────────────────────────────────────────────
 *  Mounts several folders into one merged library and saves those sets as
 *  named presets. Nothing here moves a file — a workspace is a list of
 *  directory handles, and "loading a preset" means re-opening those folders.
 *
 *  Every action that can raise a native permission prompt is bound directly
 *  to a click with no await in front of it: Chrome drops the user-gesture
 *  token across an await, and a suppressed prompt looks like a silent failure.
 * ───────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LibraryManager({ open, onClose }: Props) {
  const activeHandles = useLibraryStore((s) => s.activeHandles);
  const presets = useLibraryStore((s) => s.presets);
  const pendingRestore = useLibraryStore((s) => s.pendingRestore);
  const busy = useLibraryStore((s) => s.busy);
  const error = useLibraryStore((s) => s.error);
  const addHandleToActive = useLibraryStore((s) => s.addHandleToActive);
  const removeHandleFromActive = useLibraryStore((s) => s.removeHandleFromActive);
  const clearActiveHandles = useLibraryStore((s) => s.clearActiveHandles);
  const restorePending = useLibraryStore((s) => s.restorePending);
  const dismissPending = useLibraryStore((s) => s.dismissPending);
  const saveActiveAsPreset = useLibraryStore((s) => s.saveActiveAsPreset);
  const loadPreset = useLibraryStore((s) => s.loadPreset);
  const deletePreset = useLibraryStore((s) => s.deletePreset);
  const setError = useLibraryStore((s) => s.setError);

  /* Per-mount media counts come from the last scan, not from the handles. */
  const roots = useStore((s) => s.roots);
  const scanning = useStore((s) => s.scanning);

  const [presetName, setPresetName] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Stale errors from a previous visit shouldn't greet the next one. */
  useEffect(() => {
    if (open) setError(null);
  }, [open, setError]);

  if (!open) return null;

  async function addFolder() {
    if (!('showDirectoryPicker' in window)) {
      setError('This browser has no File System Access API. Use Chrome or Edge.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await addHandleToActive(handle);
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setError('Could not open that folder.');
      }
    }
  }

  function submitPreset() {
    const name = presetName.trim();
    if (!name) return;
    void saveActiveAsPreset(name).then(() => {
      if (!useLibraryStore.getState().error) {
        setPresetName('');
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1600);
      }
    });
  }

  const countFor = (name: string) => roots.find((r) => r.folderName === name)?.mediaCount;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Workspace folders"
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50"
      >
        {/* ── header ── */}
        <div className="flex items-center gap-2 border-b border-content/10 px-5 py-4">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-content">Workspace</h2>
          {scanning && (
            <span className="flex items-center gap-1 rounded-full bg-content/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-content/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              Scanning
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 scrollbar-thin">
          <p className="text-xs leading-relaxed text-content/60">
            Combine several folders into one library. Files are never moved or copied — LocalTube
            just reads them where they are, and forgets them the moment you remove the folder.
          </p>

          {/* ── lapsed grants ── */}
          {pendingRestore.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-amber-500">
                    {pendingRestore.length === 1
                      ? '1 folder needs permission again'
                      : `${pendingRestore.length} folders need permission again`}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-content/60">
                    Browsers drop folder access when they restart. Your folders are remembered —
                    they just need one click to re-open.
                  </p>
                  <p className="mt-1 truncate text-[11px] text-content/40">
                    {pendingRestore.map((h) => h.name).join(', ')}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => void restorePending()}
                  className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-black transition hover:brightness-110"
                >
                  Grant access
                </button>
                <button
                  onClick={() => void dismissPending()}
                  className="rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10"
                >
                  Forget
                </button>
              </div>
            </div>
          )}

          {/* ── active folders ── */}
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-content/50">
              Mounted folders ({activeHandles.length})
            </h3>
            {activeHandles.length > 0 && (
              <button
                onClick={() => void clearActiveHandles()}
                className="text-[11px] font-medium text-content/40 transition hover:text-primary"
              >
                Remove all
              </button>
            )}
          </div>

          <div className="mt-2 space-y-1.5">
            {activeHandles.length === 0 && (
              <p className="rounded-xl border border-dashed border-content/10 px-3 py-5 text-center text-xs text-content/40">
                No folders yet. Add one to start building your library.
              </p>
            )}
            {activeHandles.map((handle, i) => {
              const count = countFor(handle.name);
              return (
                <div
                  key={`${handle.name}:${i}`}
                  className="group flex items-center gap-2.5 rounded-xl border border-content/10 bg-content/[0.03] px-3 py-2.5"
                >
                  <FolderPlus className="h-4 w-4 shrink-0 text-amber-400/80" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                    {handle.name}
                  </span>
                  {count != null && (
                    <span className="shrink-0 text-[11px] tabular-nums text-content/35">
                      {count} item{count === 1 ? '' : 's'}
                    </span>
                  )}
                  <button
                    onClick={() => void removeHandleFromActive(handle)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content/30 transition hover:bg-content/10 hover:text-primary"
                    aria-label={`Remove ${handle.name} from the workspace`}
                    title="Remove from workspace"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => void addFolder()}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110"
          >
            <FolderPlus className="h-4 w-4" />
            Add folder to workspace
          </button>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* ── save as preset ── */}
          <div className="mt-6 border-t border-content/10 pt-5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50">
              <Bookmark className="h-3.5 w-3.5" />
              Presets
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-content/50">
              Save this combination of folders so you can reopen it in one click.
            </p>

            <div className="mt-2.5 flex gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitPreset();
                }}
                maxLength={48}
                placeholder="e.g. Anime + Movies"
                className="h-10 min-w-0 flex-1 rounded-xl border border-content/10 bg-base px-3 text-sm text-content placeholder-content/35 outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              />
              <button
                onClick={submitPreset}
                disabled={!presetName.trim() || activeHandles.length === 0}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-content/[0.08] px-4 text-sm font-semibold text-content transition hover:bg-content/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {justSaved ? <Check className="h-4 w-4 text-emerald-400" /> : null}
                {justSaved ? 'Saved' : 'Save'}
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              {presets.length === 0 && (
                <p className="rounded-xl border border-dashed border-content/10 px-3 py-4 text-center text-xs text-content/40">
                  No presets saved yet.
                </p>
              )}
              {presets.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  busy={busy}
                  onLoad={() => void loadPreset(p.id)}
                  onDelete={() => void deletePreset(p.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PresetRow({
  preset,
  busy,
  onLoad,
  onDelete,
}: {
  preset: WorkspacePreset;
  busy: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group flex items-center rounded-xl border border-content/10 bg-content/[0.03] transition hover:bg-content/[0.06]">
      <button
        onClick={onLoad}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left disabled:opacity-50"
        title={preset.handles.map((h) => h.name).join(' · ')}
      >
        <Bookmark className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-content">{preset.name}</span>
          <span className="block truncate text-[11px] text-content/40">
            {preset.handles.map((h) => h.name).join(' · ')}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-content/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-content/50">
          {preset.handles.length}
        </span>
      </button>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1 pr-2">
          <button
            onClick={onDelete}
            className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-red-500"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-content/50 transition hover:text-content"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-content/30 opacity-0 transition hover:bg-content/10 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Delete preset ${preset.name}`}
          title="Delete preset"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
