import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Delete, Loader2, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import { useVaultStore } from '../store/useVaultStore';
import { MIN_PIN_LENGTH } from '../utils/cryptoUtils';

/* ─────────────────────────────────────────────────────────────
 *  VAULT MODAL — SETUP / UNLOCK / DESTROY
 * ─────────────────────────────────────────────────────────────
 *  A numeric pad rather than a text field, because the PIN is entered in
 *  front of whoever is around. Digits never render, only their count.
 *
 *  Every submit runs a 600k-iteration PBKDF2, which takes a few hundred
 *  milliseconds by design. The pad disables itself while that runs — both
 *  to show progress and so a held key cannot queue attempts.
 * ───────────────────────────────────────────────────────────── */

type Mode = 'unlock' | 'setup' | 'confirm' | 'destroy';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_PIN = 12;

export default function VaultModal({ open, onClose }: Props) {
  const hasVault = useVaultStore((s) => s.hasVault);
  const busy = useVaultStore((s) => s.busy);
  const error = useVaultStore((s) => s.error);
  const createVault = useVaultStore((s) => s.createVault);
  const unlock = useVaultStore((s) => s.unlock);
  const destroyVault = useVaultStore((s) => s.destroyVault);
  const setError = useVaultStore((s) => s.setError);

  const [mode, setMode] = useState<Mode>('unlock');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');

  /* Reset to a clean pad every time it opens — never leave digits behind. */
  useEffect(() => {
    if (!open) return;
    setPin('');
    setFirstPin('');
    setMode(hasVault ? 'unlock' : 'setup');
    setError(null);
  }, [open, hasVault, setError]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Hardware keyboard entry, for anyone using a passphrase rather than a PIN. */
  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') setPin((p) => (p.length < MAX_PIN ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const secure = typeof globalThis.crypto?.subtle !== 'undefined';

  async function submit() {
    if (busy || pin.length === 0) return;

    if (mode === 'unlock') {
      const ok = await unlock(pin);
      setPin('');
      if (ok) onClose();
      return;
    }

    if (mode === 'setup') {
      if (pin.length < MIN_PIN_LENGTH) {
        setError(`Use at least ${MIN_PIN_LENGTH} digits.`);
        return;
      }
      setFirstPin(pin);
      setPin('');
      setMode('confirm');
      setError(null);
      return;
    }

    if (mode === 'confirm') {
      if (pin !== firstPin) {
        setError('The two PINs did not match. Start again.');
        setPin('');
        setFirstPin('');
        setMode('setup');
        return;
      }
      const ok = await createVault(pin);
      setPin('');
      setFirstPin('');
      if (ok) onClose();
      return;
    }

    if (mode === 'destroy') {
      const ok = await destroyVault(pin);
      setPin('');
      if (ok) onClose();
    }
  }

  const title =
    mode === 'unlock' ? 'Unlock Private Vault'
    : mode === 'setup' ? 'Create a Vault PIN'
    : mode === 'confirm' ? 'Confirm your PIN'
    : 'Delete the vault';

  const blurb =
    mode === 'unlock' ? 'Enter your PIN to reveal the vault for this session.'
    : mode === 'setup' ? `At least ${MIN_PIN_LENGTH} digits. There is no recovery — if you forget it, the vault contents are unrecoverable.`
    : mode === 'confirm' ? 'Enter the same PIN once more.'
    : 'Enter your PIN to confirm. The vault and its contents list are erased. Your video files are not touched.';

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-2 border-b border-content/10 px-5 py-4">
          {mode === 'destroy' ? (
            <Trash2 className="h-5 w-5 text-red-400" />
          ) : (
            <Lock className="h-5 w-5 text-primary" />
          )}
          <h2 className="text-base font-bold text-content">{title}</h2>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {!secure ? (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs leading-relaxed text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The vault needs the Web Crypto API, which browsers only expose over{' '}
                <span className="font-mono">https://</span> or on{' '}
                <span className="font-mono">localhost</span>. Open LocalTube from one of those and the
                vault becomes available.
              </span>
            </div>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-content/60">{blurb}</p>

              <PinDots length={pin.length} tone={mode === 'destroy' ? 'danger' : 'normal'} />

              {error && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {error}
                </p>
              )}

              <Keypad
                disabled={busy}
                onDigit={(d) => setPin((p) => (p.length < MAX_PIN ? p + d : p))}
                onBackspace={() => setPin((p) => p.slice(0, -1))}
              />

              <button
                onClick={() => void submit()}
                disabled={busy || pin.length === 0}
                className={`mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === 'destroy' ? 'bg-red-600 hover:bg-red-500' : 'bg-primary hover:brightness-110'
                }`}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {busy
                  ? 'Deriving key…'
                  : mode === 'unlock' ? 'Unlock'
                  : mode === 'setup' ? 'Continue'
                  : mode === 'confirm' ? 'Create vault'
                  : 'Delete vault'}
              </button>

              {busy && (
                <p className="mt-2 text-center text-[11px] text-content/40">
                  600,000 PBKDF2 rounds — the delay is the point.
                </p>
              )}

              {hasVault && mode === 'unlock' && (
                <button
                  onClick={() => {
                    setMode('destroy');
                    setPin('');
                    setError(null);
                  }}
                  className="mt-3 w-full text-center text-[11px] text-content/35 transition hover:text-red-400"
                >
                  Forgot your PIN? Delete the vault and start over
                </button>
              )}

              {mode === 'destroy' && (
                <button
                  onClick={() => {
                    setMode('unlock');
                    setPin('');
                    setError(null);
                  }}
                  className="mt-3 w-full text-center text-[11px] text-content/40 transition hover:text-content"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Shows only how many digits were entered — never which. */
function PinDots({ length, tone }: { length: number; tone: 'normal' | 'danger' }) {
  const slots = Math.max(MIN_PIN_LENGTH, length);
  return (
    <div className="my-5 flex items-center justify-center gap-2.5">
      {Array.from({ length: slots }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full transition-all duration-150 ${
            i < length
              ? tone === 'danger'
                ? 'scale-110 bg-red-500'
                : 'scale-110 bg-primary'
              : 'bg-content/15'
          }`}
        />
      ))}
    </div>
  );
}

function Keypad({
  disabled,
  onDigit,
  onBackspace,
}: {
  disabled: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <PadButton key={d} disabled={disabled} onClick={() => onDigit(d)}>
          {d}
        </PadButton>
      ))}
      <span />
      <PadButton disabled={disabled} onClick={() => onDigit('0')}>
        0
      </PadButton>
      <PadButton disabled={disabled} onClick={onBackspace} aria-label="Delete last digit">
        <Delete className="h-5 w-5" />
      </PadButton>
    </div>
  );
}

function PadButton({
  children,
  disabled,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 items-center justify-center rounded-xl border border-content/10 bg-content/[0.04] text-lg font-semibold tabular-nums text-content transition hover:bg-content/10 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
