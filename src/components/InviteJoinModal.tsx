import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Loader2,
  LogIn,
  Server,
  ShieldCheck,
  Ticket,
  X,
} from 'lucide-react';
import { useWebRTCStore } from '../store/useWebRTCStore';
import {
  clearInviteFromUrl,
  parseInviteLink,
  type InvitePayload,
} from '../utils/p2pInviteUtils';

/* ─────────────────────────────────────────────────────────────
 *  INSTANT INVITE
 * ─────────────────────────────────────────────────────────────
 *  Detects an invite in the URL fragment, scrubs it immediately, and asks
 *  before doing anything with it.
 *
 *  THE CONFIRMATION IS NOT A FORMALITY. Joining is not a passive act: it
 *  opens a WebRTC connection, which reveals this machine's IP to the peer,
 *  and it loads PeerJS — the app's whole "no network until you opt in"
 *  guarantee. A link must never be able to trigger that on its own, so the
 *  credentials are parsed and held in memory while the user decides, and
 *  nothing touches the network until they press Instant Join.
 * ───────────────────────────────────────────────────────────── */

export default function InviteJoinModal() {
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const status = useWebRTCStore((s) => s.status);
  const setSignalingMode = useWebRTCStore((s) => s.setSignalingMode);

  /*
   * Reads the hash on mount and on any later change — pasting a link into
   * the address bar of an already-open tab fires hashchange without a
   * reload, and that path has to behave identically.
   */
  useEffect(() => {
    const read = () => {
      const found = parseInviteLink(window.location.hash);
      if (!found) return;
      /* Scrub FIRST. Whatever happens next — accept, dismiss, a thrown
       * error, a reload — the password is already out of the address bar. */
      clearInviteFromUrl();
      setInvite(found);
      setDismissed(false);
      setError(null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (!invite || dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [invite, dismissed]);

  async function join() {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      if (invite.signalingMode) setSignalingMode(invite.signalingMode);

      /* Still behind the dynamic import: this is the first moment PeerJS
       * is fetched, and it happens because a person clicked, not because
       * a URL said so. */
      const { startSession } = await import('../services/webrtcService');
      await startSession({
        role: 'guest',
        roomId: invite.roomId,
        password: invite.password,
        displayName: useWebRTCStore.getState().displayName,
        signalingMode: invite.signalingMode,
        signaling: invite.signaling,
      });
      /* Drop our copy of the password the moment it is no longer needed. */
      setInvite(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that room.');
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    /* Forget the credentials rather than just hiding the dialog. */
    setInvite(null);
    setDismissed(true);
  }

  if (!invite || dismissed) return null;

  /* Already in a room — joining would tear down the live session, so say
   * so instead of silently replacing it. */
  const alreadyLive = status !== 'disconnected';

  return createPortal(
    <div className="fixed inset-0 z-[430] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Watch party invitation"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/50"
      >
        <div className="flex items-center gap-2 border-b border-content/10 px-5 py-4">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-content">You've been invited</h2>
          <button
            onClick={decline}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Dismiss invitation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm leading-relaxed text-content/70">
            You've been invited to join Room{' '}
            <span className="font-mono text-lg font-bold tracking-[0.2em] text-content">
              {invite.roomId}
            </span>
            . Ready to join?
          </p>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs leading-relaxed text-content/60">
              The password came in the link's <span className="font-semibold text-content">fragment</span>,
              so it was never sent to any server. It has already been removed from your address bar.
            </p>
          </div>

          {/* A link can nominate a signaling server, so show which one. */}
          {invite.signaling && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-content/60">
                This invite uses a custom signaling server:{' '}
                <span className="font-mono font-semibold text-amber-500">
                  {invite.signaling.host}:{invite.signaling.port}
                </span>
                . It will see your IP and room ID — join only if you trust whoever sent this.
              </p>
            </div>
          )}

          {alreadyLive && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              You're already in a room. Leave it first — joining from here would drop that session.
            </p>
          )}

          {error && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-red-500/10 p-3 text-xs leading-relaxed text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={decline}
              className="h-11 flex-1 rounded-xl bg-content/[0.06] text-sm font-semibold text-content/70 transition hover:bg-content/10"
            >
              Not now
            </button>
            <button
              onClick={join}
              disabled={busy || alreadyLive}
              className="flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? 'Joining…' : 'Instant Join'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
