import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Power,
  RadioTower,
  Send,
  Server,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Unplug,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  useWebRTCStore,
  selectPendingIncoming,
  type SessionRole,
  type SignalingMode,
} from '../store/useWebRTCStore';
import {
  PASSWORD_MIN_LENGTH,
  ROOM_ID_MAX_DIGITS,
  ROOM_ID_MIN_DIGITS,
  isValidRoomId,
  randomRoomId,
} from '../services/p2pProtocol';
import { useChatStore, selectTotalUnread } from '../store/useChatStore';
import { generateInviteLink } from '../utils/p2pInviteUtils';
import { acceptIncomingFile, declineIncomingFile, shortId } from '../services/webrtcService';
import ShareModal from './ShareModal';
import ChatPanel from './ChatPanel';
import { BroadcastControls } from './BroadcastView';

/* ─────────────────────────────────────────────────────────────
 *  WEBRTC CONTROL BAR
 * ─────────────────────────────────────────────────────────────
 *  The single entry point to the P2P feature, and the only place it can
 *  be switched on. While `status === 'disconnected'` this component holds
 *  nothing but form state — webrtcService is imported for its (inert)
 *  helpers, and PeerJS itself is not loaded until "Start" is pressed.
 *
 *  The kill switch is deliberately duplicated: once a session is live it
 *  appears both in the header (always reachable, one click, no scrolling)
 *  and at the foot of the panel.
 * ───────────────────────────────────────────────────────────── */

export default function WebRTCBar() {
  const status = useWebRTCStore((s) => s.status);
  const roomId = useWebRTCStore((s) => s.roomId);
  const peers = useWebRTCStore((s) => s.peers);
  const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
  const pending = useWebRTCStore(selectPendingIncoming);

  const [panelOpen, setPanelOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const live = status !== 'disconnected';
  const authedCount = peers.filter((p) => p.authenticated).length;

  return (
    <>
      {/* ── Header trigger ── */}
      <button
        onClick={() => setPanelOpen(true)}
        className={`relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-content/80 transition hover:bg-content/10 ${
          live ? 'bg-emerald-500/10 text-emerald-400' : ''
        }`}
        aria-label="Peer-to-peer sharing"
        title={live ? `P2P live — room ${roomId}` : 'Peer-to-peer sharing (off)'}
      >
        <Share2 className="h-5 w-5" />
        <StatusDot status={status} />
        {authedCount > 0 && (
          <span className="text-xs font-semibold tabular-nums">{authedCount}</span>
        )}
        {pending.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {pending.length}
          </span>
        )}
      </button>

      {/* ── Chat toggle — only meaningful once a session exists ── */}
      {live && <ChatToggle />}

      {/* ── Always-visible kill switch while anything is live ── */}
      {live && (
        <button
          onClick={() => disconnectAll('Kill switch activated from the header')}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500"
          aria-label="Kill switch — disconnect all peers"
          title="Kill switch — instantly destroy every P2P connection"
        >
          <Power className="h-4 w-4" />
          <span className="hidden sm:inline">Kill</span>
        </button>
      )}

      {panelOpen && (
        <ConnectionPanel
          onClose={() => setPanelOpen(false)}
          onOpenShare={() => {
            setShareOpen(true);
            setPanelOpen(false);
          }}
        />
      )}

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />

      {/* Renders null unless a session is live and the drawer is open. */}
      <ChatPanel />

      {/* Consent prompts have to be reachable without opening anything. */}
      <IncomingOfferToasts onOpenShare={() => setShareOpen(true)} />
    </>
  );
}

/**
 * Header entry point for chat. The badge counts every thread, so a whisper
 * arriving in a tab you aren't looking at is still visible from the header.
 */
function ChatToggle() {
  const open = useChatStore((s) => s.open);
  const toggleOpen = useChatStore((s) => s.toggleOpen);
  const unread = useChatStore(selectTotalUnread);

  return (
    <button
      onClick={toggleOpen}
      className={`relative flex h-10 shrink-0 items-center justify-center rounded-full px-3 transition hover:bg-content/10 ${
        open ? 'bg-primary/15 text-primary' : 'text-content/80'
      }`}
      aria-label="Room chat"
      aria-pressed={open}
      title="Room chat (messages are never saved)"
    >
      <MessageSquare className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  PANEL
 * ───────────────────────────────────────────────────────────── */

function ConnectionPanel({ onClose, onOpenShare }: { onClose: () => void; onOpenShare: () => void }) {
  const status = useWebRTCStore((s) => s.status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Peer-to-peer sharing"
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50"
      >
        <div className="flex items-center gap-2 border-b border-content/10 px-5 py-4">
          <Share2 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-content">Peer-to-Peer Sharing</h2>
          <StatusPill status={status} />
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === 'disconnected' ? (
          <SetupForm />
        ) : (
          <LiveSession onOpenShare={onOpenShare} onClose={onClose} />
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────────
 *  SETUP (disconnected state)
 * ───────────────────────────────────────────────────────────── */

interface Signaling {
  host: string;
  port: string;
  path: string;
  secure: boolean;
}

function SetupForm() {
  const killedAt = useWebRTCStore((s) => s.killedAt);
  const clearKilled = useWebRTCStore((s) => s.clearKilled);
  const lastError = useWebRTCStore((s) => s.lastError);
  const setError = useWebRTCStore((s) => s.setError);

  /* Remounted after every teardown, so seed from the store to keep a
   * rejected guest on the "Join" tab instead of bouncing them to "Host". */
  const [role, setRole] = useState<SessionRole>(() => useWebRTCStore.getState().preferredRole);
  const [name, setName] = useState('LocalTube user');
  const [room, setRoom] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [signaling, setSignaling] = useState<Signaling>({ host: '', port: '9000', path: '/', secure: true });

  const signalingMode = useWebRTCStore((s) => s.signalingMode);
  const setSignalingMode = useWebRTCStore((s) => s.setSignalingMode);
  const selfHosted = signalingMode === 'self-hosted-server';

  const roomValid = isValidRoomId(room);
  const passwordValid = password.length >= PASSWORD_MIN_LENGTH;
  const canStart = roomValid && passwordValid && !busy;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      /* First and only moment PeerJS is fetched. */
      const { startSession } = await import('../services/webrtcService');
      await startSession({
        role,
        roomId: room,
        password,
        displayName: name,
        signalingMode,
        /* A custom broker is only meaningful in native-routing mode — the
         * relay works on whichever server introduced the two browsers. */
        signaling:
          selfHosted && signaling.host.trim()
            ? {
                host: signaling.host.trim(),
                port: Number(signaling.port) || 443,
                path: signaling.path || '/',
                secure: signaling.secure,
              }
            : undefined,
      });
      /* Password stays in the store (needed for late joiners) but is
       * cleared from this form immediately. */
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5">
      {/* Isolation confirmation after a kill switch */}
      {killedAt && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-400">
              Disconnected — this browser is fully isolated.
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-content/60">
              Every data channel, media stream and signaling socket was destroyed, and received files
              were released from memory.
            </p>
          </div>
          <button
            onClick={clearKilled}
            className="shrink-0 rounded-full p-1 text-emerald-400/60 transition hover:text-emerald-400"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-content/10 bg-content/[0.03] p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-content/40" />
        <p className="text-xs leading-relaxed text-content/60">
          WebRTC is <span className="font-semibold text-content">completely off</span> right now — no
          connection library is even loaded. Starting a room opens a direct, encrypted browser-to-browser
          channel. Peers can never browse or request your files; you push individual files by hand.
        </p>
      </div>

      {/* role */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-content/[0.04] p-1">
        <RoleTab active={role === 'host'} onClick={() => setRole('host')} label="Host a room" />
        <RoleTab active={role === 'guest'} onClick={() => setRole('guest')} label="Join a room" />
      </div>

      {/* name */}
      <Field label="Display name" className="mt-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          className="h-10 w-full rounded-xl border border-content/10 bg-base px-3 text-sm text-content outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          placeholder="Shown to peers in the room"
        />
      </Field>

      {/* room id */}
      <Field label={`Room ID (${ROOM_ID_MIN_DIGITS}–${ROOM_ID_MAX_DIGITS} digits)`} className="mt-3">
        <div className="flex gap-2">
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value.replace(/\D/g, '').slice(0, ROOM_ID_MAX_DIGITS))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="482913"
            className="h-10 w-full rounded-xl border border-content/10 bg-base px-3 font-mono text-lg tracking-[0.35em] text-content outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          />
          {role === 'host' && (
            <button
              onClick={() => setRoom(randomRoomId())}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-content/10 bg-content/5 text-content/70 transition hover:bg-content/10 hover:text-content"
              title="Generate a random room ID"
              aria-label="Generate a random room ID"
            >
              <Dices className="h-4 w-4" />
            </button>
          )}
        </div>
      </Field>

      {/* password */}
      <Field label="Room password" className="mt-3">
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content/30" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            className="h-10 w-full rounded-xl border border-content/10 bg-base pl-9 pr-10 text-sm text-content outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          />
          <button
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-content/40 transition hover:text-content"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </Field>

      {/* advanced */}
      <button
        onClick={() => setAdvanced((v) => !v)}
        className="mt-4 flex w-full items-center gap-1.5 text-xs font-medium text-content/50 transition hover:text-content/80"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advanced ? 'rotate-180' : ''}`} />
        Advanced — live video &amp; signaling
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            selfHosted ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {selfHosted ? 'Self-hosted' : 'In-band relay'}
        </span>
      </button>
      {advanced && (
        <div className="mt-2 space-y-2 rounded-xl border border-content/10 bg-content/[0.03] p-3">
          <p className="text-xs leading-relaxed text-content/60">
            LocalTube uses PeerJS's public broker to <em>introduce</em> the two browsers. It never sees
            your files, your stream or your password — but it does see your room ID and IP. What follows
            only changes how a <span className="font-semibold text-content">live broadcast</span>{' '}
            negotiates; file transfer is identical either way.
          </p>

          <ModeCard
            active={!selfHosted}
            onClick={() => setSignalingMode('default-relay')}
            icon={<Zap className="h-4 w-4" />}
            title="In-band relay"
            badge="Default · no setup"
            tone="emerald"
          >
            Tunnels the video invitation through the encrypted data channel the two browsers already
            share, so the broker never has to carry it — which is exactly what it fails to do. Works
            out of the box on the public broker, with no terminal and no server.
          </ModeCard>

          <ModeCard
            active={selfHosted}
            onClick={() => setSignalingMode('self-hosted-server')}
            icon={<Server className="h-4 w-4" />}
            title="Self-hosted PeerServer"
            badge="Advanced / LAN"
            tone="amber"
          >
            Native PeerJS media routing (<code className="font-mono">peer.call</code>), where the
            invitation travels through the signaling server. Removes the third-party broker entirely,
            but needs one of your own — run <code className="font-mono">npx peer --port 9000</code> and
            point both browsers at it below.
          </ModeCard>

          {selfHosted && (
            <div className="space-y-2 rounded-lg border border-content/10 bg-base/40 p-2.5">
              <div className="flex gap-2">
                <input
                  value={signaling.host}
                  onChange={(e) => setSignaling({ ...signaling, host: e.target.value })}
                  placeholder="peer.example.com or 192.168.1.20"
                  className="h-9 w-full rounded-lg border border-content/10 bg-base px-2.5 text-xs text-content outline-none focus:border-accent/60"
                />
                <input
                  value={signaling.port}
                  onChange={(e) =>
                    setSignaling({ ...signaling, port: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="9000"
                  className="h-9 w-20 shrink-0 rounded-lg border border-content/10 bg-base px-2.5 text-xs text-content outline-none focus:border-accent/60"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-content/60">
                <input
                  type="checkbox"
                  checked={signaling.secure}
                  onChange={(e) => setSignaling({ ...signaling, secure: e.target.checked })}
                  className="accent-current"
                />
                Use TLS (wss://)
              </label>
              {!signaling.host.trim() && (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-500">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  No server set — this mode will fall back to the public broker, which does not relay
                  media invitations, so broadcasts will not reach viewers.
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-content/40">
            Both modes end at the same place: one direct, DTLS/SRTP-encrypted connection between the two
            browsers. Only the route the invitation takes differs. Both peers should pick the same mode.
          </p>
        </div>
      )}

      {lastError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-relaxed">{lastError}</span>
        </div>
      )}

      <button
        onClick={start}
        disabled={!canStart}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        {busy ? 'Starting…' : role === 'host' ? 'Open room' : 'Join room'}
      </button>

      {!roomValid && room.length > 0 && (
        <p className="mt-2 text-center text-xs text-amber-500">
          Room IDs are {ROOM_ID_MIN_DIGITS}–{ROOM_ID_MAX_DIGITS} digits.
        </p>
      )}
    </div>
  );
}

/**
 * One selectable broadcast-transport mode. Radio semantics rather than a
 * checkbox: the two modes are mutually exclusive routes for the same
 * negotiation, and picking one has to be a deliberate, explained choice.
 */
function ModeCard({
  active,
  onClick,
  icon,
  title,
  badge,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  badge: string;
  tone: 'emerald' | 'amber';
  children: React.ReactNode;
}) {
  const accent = tone === 'emerald' ? 'text-emerald-400' : 'text-amber-500';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`w-full rounded-lg border p-2.5 text-left transition ${
        active
          ? 'border-accent/50 bg-accent/[0.07]'
          : 'border-content/10 bg-content/[0.02] hover:bg-content/[0.05]'
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            active ? 'border-accent bg-accent' : 'border-content/25'
          }`}
        >
          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        <span className={active ? accent : 'text-content/50'}>{icon}</span>
        <span className="text-sm font-semibold text-content">{title}</span>
        <span
          className={`ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wide ${
            active ? accent : 'text-content/35'
          }`}
        >
          {badge}
        </span>
      </span>
      <span className="mt-1.5 block pl-6 text-xs leading-relaxed text-content/60">{children}</span>
    </button>
  );
}

function RoleTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? 'bg-content/10 text-content' : 'text-content/50 hover:text-content/80'
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-content/50">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * The password is the *only* thing standing between a room-ID guesser and
 * the room, and a captured handshake can be attacked offline — so the
 * strength hint explains the stakes rather than just scoring characters.
 */
function PasswordStrength({ password }: { password: string }) {
  const { label, tone, width } = useMemo(() => {
    if (!password) return { label: '', tone: '', width: 0 };
    let score = 0;
    if (password.length >= PASSWORD_MIN_LENGTH) score++;
    if (password.length >= 14) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length < PASSWORD_MIN_LENGTH) return { label: 'Too short', tone: 'text-red-400', width: 15 };
    if (score <= 2) return { label: 'Weak', tone: 'text-red-400', width: 33 };
    if (score === 3) return { label: 'Fair', tone: 'text-amber-500', width: 60 };
    if (score === 4) return { label: 'Good', tone: 'text-emerald-400', width: 80 };
    return { label: 'Strong', tone: 'text-emerald-400', width: 100 };
  }, [password]);

  if (!password) return null;

  return (
    <div className="mt-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-content/10">
        <div
          className={`h-full rounded-full transition-all ${
            width >= 80 ? 'bg-emerald-500' : width >= 60 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className={`mt-1 text-[11px] ${tone}`}>
        {label}
        {width < 80 && (
          <span className="text-content/40">
            {' '}
            — a long passphrase matters here: anyone who guesses your room ID can attempt the handshake.
          </span>
        )}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  LIVE SESSION
 * ───────────────────────────────────────────────────────────── */

function LiveSession({ onOpenShare, onClose }: { onOpenShare: () => void; onClose: () => void }) {
  const roomId = useWebRTCStore((s) => s.roomId);
  const role = useWebRTCStore((s) => s.role);
  const status = useWebRTCStore((s) => s.status);
  const peers = useWebRTCStore((s) => s.peers);
  const events = useWebRTCStore((s) => s.events);
  const lastError = useWebRTCStore((s) => s.lastError);
  const disconnectAll = useWebRTCStore((s) => s.disconnectAll);
  const transfers = useWebRTCStore((s) => s.transferProgress);
  const setLobbyOpen = useWebRTCStore((s) => s.setLobbyOpen);
  /* Only settable from SetupForm, which is unreachable while live — so
   * this always matches the mode the running session was started with. */
  const signalingMode: SignalingMode = useWebRTCStore((s) => s.signalingMode);

  const [copied, setCopied] = useState(false);
  const authed = peers.filter((p) => p.authenticated);

  const heldFiles = Object.values(transfers).filter((t) => t.blobUrl).length;

  function copyRoom() {
    if (!roomId) return;
    navigator.clipboard?.writeText(roomId).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }

  return (
    <div className="p-5">
      {/* room header */}
      <div className="flex items-center gap-3 rounded-xl border border-content/10 bg-content/[0.03] p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-content/40">
            {role === 'host' ? 'Hosting room' : 'Joined room'}
          </p>
          <p className="font-mono text-2xl tracking-[0.25em] text-content">{roomId}</p>
        </div>
        <button
          onClick={copyRoom}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-content/10 bg-content/5 px-3 text-xs font-medium text-content/70 transition hover:bg-content/10 hover:text-content"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* One-click invite — host only: a guest's copy would just re-invite
          people to a room they don't own the lifetime of. */}
      {role === 'host' && <InviteLinkButton />}

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-content/40">
        {signalingMode === 'default-relay' ? (
          <Zap className="h-3 w-3 text-emerald-400" />
        ) : (
          <Server className="h-3 w-3 text-amber-500" />
        )}
        Live video:{' '}
        <span className="font-medium text-content/60">
          {signalingMode === 'default-relay' ? 'in-band relay' : 'native PeerJS routing'}
        </span>
      </p>

      {status === 'connecting' && (
        <p className="mt-3 flex items-center gap-2 text-xs text-content/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Waiting for the handshake to complete…
        </p>
      )}

      {lastError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-relaxed">{lastError}</span>
        </div>
      )}

      {/* peers */}
      <div className="mt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content/50">
          <Users className="h-3.5 w-3.5" />
          Peers ({authed.length}/{peers.length})
        </h3>
        <div className="mt-2 space-y-1.5">
          {peers.length === 0 && (
            <p className="rounded-xl border border-dashed border-content/10 px-3 py-4 text-center text-xs text-content/40">
              {role === 'host'
                ? 'Nobody has joined yet. Share the room ID and password over a channel you trust.'
                : 'Connecting to the host…'}
            </p>
          )}
          {peers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-content/10 bg-content/[0.03] px-3 py-2"
            >
              {p.authenticated ? (
                <UserCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{p.name}</p>
                <p className="truncate font-mono text-[10px] text-content/35">{shortId(p.id)}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  p.authenticated
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-500'
                }`}
              >
                {p.authenticated ? 'Verified' : 'Verifying'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* actions */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onOpenShare}
          disabled={authed.length === 0}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-content/[0.06] text-sm font-semibold text-content transition hover:bg-content/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          Send files
        </button>
        <BroadcastControls compact onNavigate={onClose} />
        <button
          onClick={() => {
            setLobbyOpen(true);
            onClose();
          }}
          className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-xl border border-content/10 bg-content/[0.03] text-sm font-semibold text-content/80 transition hover:bg-content/10"
        >
          <Users className="h-4 w-4" />
          Open watch party room
        </button>
      </div>

      {/* security log */}
      <details className="mt-4 rounded-xl border border-content/10 bg-content/[0.03]">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content/50">
          Security log ({events.length})
        </summary>
        <div className="max-h-40 overflow-y-auto border-t border-content/10 px-3 py-2">
          {events.length === 0 && <p className="py-2 text-xs text-content/30">Nothing logged yet.</p>}
          {events.map((e) => (
            <p key={e.id} className="flex gap-2 py-0.5 text-[11px] leading-relaxed">
              <span className="shrink-0 font-mono text-content/30">
                {new Date(e.at).toLocaleTimeString()}
              </span>
              <span
                className={
                  e.level === 'danger'
                    ? 'text-red-400'
                    : e.level === 'warn'
                      ? 'text-amber-500'
                      : 'text-content/60'
                }
              >
                {e.message}
              </span>
            </p>
          ))}
        </div>
      </details>

      {/* KILL SWITCH */}
      <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3">
        <div className="flex items-start gap-2">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-xs leading-relaxed text-content/70">
            Instantly destroys the signaling socket, every data channel and every media stream, and
            releases received files from memory.
            {heldFiles > 0 && (
              <span className="font-semibold text-red-400">
                {' '}
                {heldFiles} received file{heldFiles === 1 ? '' : 's'} will be discarded — save{' '}
                {heldFiles === 1 ? 'it' : 'them'} first if you want to keep {heldFiles === 1 ? 'it' : 'them'}.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => disconnectAll('Kill switch activated')}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 active:scale-[0.99]"
        >
          <Unplug className="h-5 w-5" />
          Disconnect all
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  INVITE LINK
 * ─────────────────────────────────────────────────────────────
 *  The link carries the room password in its fragment, which is what
 *  makes one-click joining possible and what makes it a bearer
 *  credential. The copy exists to make sure nobody learns that the hard
 *  way: it says plainly that whoever holds the link holds the room.
 * ───────────────────────────────────────────────────────────── */

function InviteLinkButton() {
  const roomId = useWebRTCStore((s) => s.roomId);
  const password = useWebRTCStore((s) => s.password);
  const signalingMode = useWebRTCStore((s) => s.signalingMode);
  const signalingServer = useWebRTCStore((s) => s.signalingServer);

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function copyInvite() {
    if (!roomId || !password) return;
    setError(null);
    try {
      const link = generateInviteLink(roomId, password, {
        signalingMode,
        signaling: signalingServer ?? undefined,
      });
      /* Clipboard access can be denied outright (insecure context, or the
       * user said no). Surface that instead of a silent no-op. */
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Could not reach the clipboard. Copy the Room ID and password by hand instead.');
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={copyInvite}
        className={`group flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${
          copied
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-content/10 bg-content/[0.06] text-content hover:bg-content/10'
        }`}
        title="Anyone with this link can instantly join your room"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            Copied — treat it like a password
          </>
        ) : (
          <>
            <LinkIcon className="h-4 w-4" />
            Copy invite link
          </>
        )}
      </button>

      <p className="mt-1.5 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-content/40">
        <ShieldAlert className="mt-px h-3 w-3 shrink-0 text-amber-500" />
        <span>
          <span className="font-semibold text-content/60">
            Anyone with this link can instantly join your room.
          </span>{' '}
          The password rides in the URL's <code className="font-mono">#fragment</code>, so it is never
          sent to a server — but it is still a password. Share it over a channel you trust.
        </span>
      </p>

      {error && (
        <p className="mt-1.5 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-amber-500">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  INCOMING FILE CONSENT
 * ─────────────────────────────────────────────────────────────
 *  Receiving is opt-in as well: nothing is buffered until Accept is
 *  clicked, so an unwanted push costs the recipient nothing.
 * ───────────────────────────────────────────────────────────── */

function IncomingOfferToasts({ onOpenShare }: { onOpenShare: () => void }) {
  const pending = useWebRTCStore(selectPendingIncoming);
  /* Offers the user waved away without deciding — they stay in the
   * Received tab, they just stop nagging from the corner. */
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = pending.filter((t) => !hidden.has(t.id));
  if (visible.length === 0) return null;

  const hide = (id: string) => setHidden((s) => new Set(s).add(id));

  return createPortal(
    <div className="fixed bottom-5 left-5 z-[350] flex w-80 flex-col gap-2">
      {visible.slice(0, 3).map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-content/10 bg-surface p-3 shadow-2xl shadow-black/50"
        >
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-xs font-semibold text-content/50">
              {t.peerName} wants to send you a file
            </p>
            <button
              onClick={() => hide(t.id)}
              className="shrink-0 rounded-full p-0.5 text-content/30 transition hover:text-content/70"
              aria-label="Hide — decide later in the Received tab"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-content" title={t.filename}>
            {t.filename}
          </p>
          <p className="text-xs text-content/40">{formatBytes(t.size)}</p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => declineIncomingFile(t.id)}
              className="flex-1 rounded-lg bg-content/[0.06] py-1.5 text-xs font-semibold text-content/70 transition hover:bg-content/10"
            >
              Decline
            </button>
            <button
              onClick={() => {
                acceptIncomingFile(t.id);
                onOpenShare();
              }}
              className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Accept
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────────
 *  BITS
 * ───────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'disconnected'
      ? 'bg-content/25'
      : status === 'connecting'
        ? 'bg-amber-500 animate-pulse'
        : status === 'broadcasting'
          ? 'bg-red-500 animate-pulse'
          : 'bg-emerald-500';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    disconnected: {
      label: 'Off',
      className: 'bg-content/10 text-content/50',
      icon: <ShieldCheck className="h-3 w-3" />,
    },
    connecting: {
      label: 'Connecting',
      className: 'bg-amber-500/15 text-amber-500',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    connected: {
      label: 'Connected',
      className: 'bg-emerald-500/15 text-emerald-400',
      icon: <Check className="h-3 w-3" />,
    },
    broadcasting: {
      label: 'Live',
      className: 'bg-red-500/15 text-red-400',
      icon: <RadioTower className="h-3 w-3" />,
    },
  };
  const s = map[status] ?? map.disconnected;
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.className}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
