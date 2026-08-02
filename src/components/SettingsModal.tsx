import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Upload, Database, AlertTriangle, Check, Heart, ListMusic, Tag } from 'lucide-react';
import { useStore } from '../store/useStore';
import { exportUserData, importUserData } from '../utils/backupUtils';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = { kind: 'idle' } | { kind: 'success'; msg: string } | { kind: 'error'; msg: string };

export default function SettingsModal({ open, onClose }: Props) {
  const applyImportedData = useStore((s) => s.applyImportedData);
  const favCount = useStore((s) => s.favorites.length);
  const plCount = useStore((s) => s.virtualPlaylists.length);
  const tagCount = useStore((s) => Object.keys(s.mediaTags).length);

  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus({ kind: 'idle' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleExport = () => {
    exportUserData(useStore.getState());
    setStatus({ kind: 'success', msg: 'Backup downloaded to your device.' });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setBusy(true);
    const res = await importUserData(file, applyImportedData);
    setBusy(false);
    if (res.ok && res.summary) {
      const s = res.summary;
      setStatus({
        kind: 'success',
        msg: `Restored ${s.favorites} favorite${s.favorites === 1 ? '' : 's'}, ${s.playlists} playlist${s.playlists === 1 ? '' : 's'}, tags on ${s.taggedItems} item${s.taggedItems === 1 ? '' : 's'}.`,
      });
    } else {
      setStatus({ kind: 'error', msg: res.error ?? 'Import failed.' });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-content/10 px-5 py-4">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-content">Settings</h2>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <h3 className="text-sm font-semibold text-content">Data Management</h3>
          <p className="mt-1 text-xs text-content/50">
            Your favorites, playlists, tags, theme and watch progress live only in this browser.
            Back them up to a file, or restore them on another device.
          </p>

          {/* current data summary */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Stat icon={<Heart className="h-3.5 w-3.5" />} label="Favorites" value={favCount} />
            <Stat icon={<ListMusic className="h-3.5 w-3.5" />} label="Playlists" value={plCount} />
            <Stat icon={<Tag className="h-3.5 w-3.5" />} label="Tagged" value={tagCount} />
          </div>

          {/* actions */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 rounded-xl bg-content/[0.06] px-4 py-2.5 text-sm font-semibold text-content transition hover:bg-content/10"
            >
              <Download className="h-4 w-4" />
              Export Backup (.json)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Restoring…' : 'Restore Backup'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFile}
              className="hidden"
            />
          </div>

          {/* warning */}
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-content/70">
              Restoring a backup <span className="font-semibold text-content">overwrites</span> your current
              favorites, virtual playlists, custom tags and watch progress with the file's contents.
              This can't be undone — export a backup first if you're unsure.
            </p>
          </div>

          {/* status */}
          {status.kind !== 'idle' && (
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                status.kind === 'success'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-red-500/10 text-red-500'
              }`}
            >
              {status.kind === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>{status.msg}</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg bg-content/[0.04] px-2.5 py-1.5 text-content/70">
      <span className="text-content/50">{icon}</span>
      <span className="font-semibold text-content tabular-nums">{value}</span>
      {label}
    </span>
  );
}
