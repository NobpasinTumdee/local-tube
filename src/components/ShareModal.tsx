import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Download,
  Film,
  ImageIcon,
  Inbox,
  Loader2,
  Play,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  useWebRTCStore,
  selectDirectPeers,
  type TransferProgress,
} from '../store/useWebRTCStore';
import { acceptIncomingFile, cancelTransfer, declineIncomingFile, sendFileToPeers } from '../services/webrtcService';
import { formatBytes } from './WebRTCBar';
import type { MediaEntry } from '../utils/directoryScanner';

/* ─────────────────────────────────────────────────────────────
 *  SHARE MODAL
 * ─────────────────────────────────────────────────────────────
 *  The push side of the feature, and the only path by which a local file
 *  can ever reach the network.
 *
 *  Note the direction of control: the library list below is rendered from
 *  the LOCAL store, the checkboxes are ticked by the LOCAL user, and only
 *  then is a File resolved from its handle and handed to the service.
 *  There is no code path — here or anywhere else — where a remote message
 *  causes a file to be read. A peer cannot list this library, cannot ask
 *  what's in it, and cannot request anything from it.
 * ───────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'send' | 'received';

export default function ShareModal({ open, onClose }: Props) {
  const videos = useStore((s) => s.videos);
  /* Directly connected only: a file push is a real byte stream over a real
   * DataConnection, so unlike chat it cannot be relayed via the host. */
  const peers = useWebRTCStore(selectDirectPeers);
  const transfers = useWebRTCStore((s) => s.transferProgress);
  const status = useWebRTCStore((s) => s.status);

  const [tab, setTab] = useState<Tab>('send');
  const [query, setQuery] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [selectedPeers, setSelectedPeers] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TransferProgress | null>(null);

  const outgoing = useMemo(
    () => Object.values(transfers).filter((t) => t.direction === 'outgoing').sort((a, b) => b.startedAt - a.startedAt),
    [transfers],
  );
  const incoming = useMemo(
    () => Object.values(transfers).filter((t) => t.direction === 'incoming').sort((a, b) => b.startedAt - a.startedAt),
    [transfers],
  );
  const pendingCount = incoming.filter((t) => t.status === 'awaiting-consent').length;

  /* Peers come and go — never keep a stale id in the selection. */
  useEffect(() => {
    setSelectedPeers((prev) => {
      const live = new Set(peers.map((p) => p.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [peers]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (preview) setPreview(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, preview]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) => v.title.toLowerCase().includes(q));
  }, [videos, query]);

  if (!open) return null;

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  async function handleSend() {
    setError(null);
    const targets = [...selectedPeers];
    const items = videos.filter((v) => selectedMedia.has(v.id));
    if (targets.length === 0 || items.length === 0) return;

    setSending(true);
    try {
      for (const entry of items) {
        /* The handle is resolved here, in response to a click — one file,
         * explicitly chosen, at a time. */
        const file = await entry.handle.getFile();
        sendFileToPeers(file, targets);
      }
      setSelectedMedia(new Set());
      setTab('send');
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not read the file: ${err.message}`
          : 'Could not read one of the selected files.',
      );
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share files with peers"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-content/10 px-5 py-4">
          <Send className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-content">Share Files</h2>
          <div className="ml-4 flex gap-1 rounded-lg bg-content/[0.06] p-1">
            <TabButton active={tab === 'send'} onClick={() => setTab('send')} label="Send" />
            <TabButton
              active={tab === 'received'}
              onClick={() => setTab('received')}
              label="Received"
              badge={pendingCount}
            />
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === 'disconnected' ? (
          <EmptyState
            icon={<ShieldCheck className="h-8 w-8" />}
            title="P2P is switched off"
            body="Open or join a room from the sharing panel first. Nothing is connected right now."
          />
        ) : tab === 'send' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* peer picker */}
            <div className="border-b border-content/10 px-5 py-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50">
                <Users className="h-3.5 w-3.5" />
                Send to
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {peers.length === 0 && (
                  <p className="text-xs text-content/40">
                    No verified peers yet. Files can only be sent to peers that passed the password
                    handshake.
                  </p>
                )}
                {peers.map((p) => {
                  const on = selectedPeers.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPeers((s) => toggle(s, p.id))}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        on
                          ? 'border-primary/50 bg-primary/15 text-content'
                          : 'border-content/10 bg-content/[0.04] text-content/60 hover:bg-content/10'
                      }`}
                    >
                      {on ? <Check className="h-3.5 w-3.5 text-primary" /> : <Users className="h-3.5 w-3.5" />}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* library picker */}
            <div className="border-b border-content/10 px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your library…"
                  className="h-9 w-full rounded-lg border border-content/10 bg-base pl-9 pr-3 text-sm text-content outline-none transition focus:border-accent/60"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {visible.length === 0 && (
                <p className="py-10 text-center text-sm text-content/30">Nothing matches that search.</p>
              )}
              <div className="space-y-1">
                {visible.slice(0, 400).map((entry) => (
                  <MediaRow
                    key={entry.id}
                    entry={entry}
                    selected={selectedMedia.has(entry.id)}
                    onToggle={() => setSelectedMedia((s) => toggle(s, entry.id))}
                  />
                ))}
              </div>
              {visible.length > 400 && (
                <p className="py-3 text-center text-xs text-content/30">
                  Showing the first 400 items — search to narrow down.
                </p>
              )}
            </div>

            {/* outgoing progress */}
            {outgoing.length > 0 && (
              <div className="max-h-44 overflow-y-auto border-t border-content/10 px-5 py-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50">
                  <Upload className="h-3.5 w-3.5" />
                  Outgoing
                </h3>
                <div className="space-y-2">
                  {outgoing.map((t) => (
                    <TransferRow key={t.id} transfer={t} />
                  ))}
                </div>
              </div>
            )}

            {/* footer */}
            <div className="flex items-center gap-3 border-t border-content/10 px-5 py-3">
              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
              <p className="ml-auto shrink-0 text-xs text-content/50">
                {selectedMedia.size} file{selectedMedia.size === 1 ? '' : 's'} → {selectedPeers.size} peer
                {selectedPeers.size === 1 ? '' : 's'}
              </p>
              <button
                onClick={handleSend}
                disabled={sending || selectedMedia.size === 0 || selectedPeers.size === 0}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        ) : (
          /* ── Received tab ── */
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {incoming.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-8 w-8" />}
                title="Nothing received"
                body="Files a peer pushes to you appear here. Nothing is downloaded until you accept it."
              />
            ) : (
              <div className="space-y-2">
                {incoming.map((t) => (
                  <TransferRow key={t.id} transfer={t} onPreview={() => setPreview(t)} />
                ))}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-content/10 bg-content/[0.03] p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-content/40" />
              <p className="text-xs leading-relaxed text-content/50">
                Received files live only in this tab's memory. The file type is re-derived locally from the
                extension against an allowlist — a peer cannot dictate how their file is interpreted here.
                Save anything you want to keep before disconnecting.
              </p>
            </div>
          </div>
        )}
      </div>

      {preview && <PreviewOverlay transfer={preview} onClose={() => setPreview(null)} />}
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────────
 *  ROWS
 * ───────────────────────────────────────────────────────────── */

function MediaRow({
  entry,
  selected,
  onToggle,
}: {
  entry: MediaEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
        selected ? 'bg-primary/10' : 'hover:bg-content/[0.04]'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          selected ? 'border-primary bg-primary text-white' : 'border-content/25'
        }`}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      {entry.mediaType === 'video' ? (
        <Film className="h-4 w-4 shrink-0 text-content/35" />
      ) : (
        <ImageIcon className="h-4 w-4 shrink-0 text-content/35" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-content">{entry.title}</span>
        <span className="block truncate text-xs text-content/35">{entry.parentPath || 'Home'}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-content/40">{formatBytes(entry.size)}</span>
    </button>
  );
}

function TransferRow({
  transfer: t,
  onPreview,
}: {
  transfer: TransferProgress;
  onPreview?: () => void;
}) {
  const dismissTransfer = useWebRTCStore((s) => s.dismissTransfer);
  const pct = t.size === 0 ? 100 : Math.min(100, Math.round((t.transferred / t.size) * 100));
  const active = t.status === 'transferring';
  const done = t.status === 'completed';
  const bad = t.status === 'failed' || t.status === 'declined' || t.status === 'cancelled';

  return (
    <div className="rounded-xl border border-content/10 bg-content/[0.03] p-3">
      <div className="flex items-center gap-2">
        {t.mediaType === 'video' ? (
          <Film className="h-4 w-4 shrink-0 text-content/35" />
        ) : t.mediaType === 'image' ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-content/35" />
        ) : (
          <Download className="h-4 w-4 shrink-0 text-content/35" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content" title={t.filename}>
            {t.filename}
          </p>
          <p className="truncate text-xs text-content/40">
            {t.direction === 'incoming' ? 'from' : 'to'} {t.peerName} · {formatBytes(t.size)}
            {t.error ? ` · ${t.error}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold tabular-nums ${
            bad ? 'text-red-400' : done ? 'text-emerald-400' : 'text-content/50'
          }`}
        >
          {t.status === 'awaiting-consent' ? 'Waiting' : bad ? t.status : `${pct}%`}
        </span>
      </div>

      {(active || done) && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-content/10">
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${
              done ? 'bg-emerald-500' : 'bg-primary'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* actions */}
      <div className="mt-2 flex flex-wrap gap-2">
        {t.direction === 'incoming' && t.status === 'awaiting-consent' && (
          <>
            <button
              onClick={() => acceptIncomingFile(t.id)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Accept
            </button>
            <button
              onClick={() => declineIncomingFile(t.id)}
              className="rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10"
            >
              Decline
            </button>
          </>
        )}
        {active && (
          <button
            onClick={() => cancelTransfer(t.id)}
            className="rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10"
          >
            Cancel
          </button>
        )}
        {done && t.blobUrl && (
          <>
            {t.playable && onPreview && (
              <button
                onClick={onPreview}
                className="flex items-center gap-1.5 rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/80 transition hover:bg-content/10"
              >
                <Play className="h-3.5 w-3.5" />
                View
              </button>
            )}
            <a
              href={t.blobUrl}
              download={t.filename}
              className="flex items-center gap-1.5 rounded-lg bg-content/[0.06] px-3 py-1.5 text-xs font-semibold text-content/80 transition hover:bg-content/10"
            >
              <Download className="h-3.5 w-3.5" />
              Save
            </a>
          </>
        )}
        {(done || bad) && (
          <button
            onClick={() => dismissTransfer(t.id)}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-content/40 transition hover:bg-content/10 hover:text-content/70"
            title="Remove from the list and release the memory"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * In-app preview of a received file. Only reached for allowlisted video and
 * image types (`playable`), so the blob URL can never be an HTML document
 * executing in this origin.
 */
function PreviewOverlay({ transfer, onClose }: { transfer: TransferProgress; onClose: () => void }) {
  if (!transfer.blobUrl) return null;
  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/90 p-6"
      onClick={onClose}
    >
      <div className="mb-3 flex w-full max-w-4xl items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{transfer.filename}</p>
        <a
          href={transfer.blobUrl}
          download={transfer.filename}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
        >
          <Download className="h-3.5 w-3.5" />
          Save
        </a>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex max-h-[80vh] w-full max-w-4xl justify-center" onClick={(e) => e.stopPropagation()}>
        {transfer.mediaType === 'video' ? (
          <video src={transfer.blobUrl} controls autoPlay className="max-h-[80vh] w-full rounded-xl bg-black" />
        ) : (
          <img src={transfer.blobUrl} alt={transfer.filename} className="max-h-[80vh] rounded-xl object-contain" />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  BITS
 * ───────────────────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-md px-3 py-1 text-xs font-semibold transition ${
        active ? 'bg-content/10 text-content' : 'text-content/50 hover:text-content/80'
      }`}
    >
      {label}
      {!!badge && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-10 py-16 text-center">
      <span className="text-content/20">{icon}</span>
      <p className="text-sm font-semibold text-content/70">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-content/40">{body}</p>
    </div>
  );
}
