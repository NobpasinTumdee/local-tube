import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Delete, Loader2, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import { useVaultStore } from '../store/useVaultStore';
import { MIN_PIN_LENGTH } from '../utils/cryptoUtils';
const MAX_PIN = 12;
export default function VaultModal({ open, onClose }) {
    const hasVault = useVaultStore((s) => s.hasVault);
    const busy = useVaultStore((s) => s.busy);
    const error = useVaultStore((s) => s.error);
    const createVault = useVaultStore((s) => s.createVault);
    const unlock = useVaultStore((s) => s.unlock);
    const destroyVault = useVaultStore((s) => s.destroyVault);
    const setError = useVaultStore((s) => s.setError);
    const [mode, setMode] = useState('unlock');
    const [pin, setPin] = useState('');
    const [firstPin, setFirstPin] = useState('');
    /* Reset to a clean pad every time it opens — never leave digits behind. */
    useEffect(() => {
        if (!open)
            return;
        setPin('');
        setFirstPin('');
        setMode(hasVault ? 'unlock' : 'setup');
        setError(null);
    }, [open, hasVault, setError]);
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    /* Hardware keyboard entry, for anyone using a passphrase rather than a PIN. */
    useEffect(() => {
        if (!open || busy)
            return;
        const onKey = (e) => {
            if (e.key >= '0' && e.key <= '9')
                setPin((p) => (p.length < MAX_PIN ? p + e.key : p));
            else if (e.key === 'Backspace')
                setPin((p) => p.slice(0, -1));
            else if (e.key === 'Enter')
                void submit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    if (!open)
        return null;
    const secure = typeof globalThis.crypto?.subtle !== 'undefined';
    async function submit() {
        if (busy || pin.length === 0)
            return;
        if (mode === 'unlock') {
            const ok = await unlock(pin);
            setPin('');
            if (ok)
                onClose();
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
            if (ok)
                onClose();
            return;
        }
        if (mode === 'destroy') {
            const ok = await destroyVault(pin);
            setPin('');
            if (ok)
                onClose();
        }
    }
    const title = mode === 'unlock' ? 'Unlock Private Vault'
        : mode === 'setup' ? 'Create a Vault PIN'
            : mode === 'confirm' ? 'Confirm your PIN'
                : 'Delete the vault';
    const blurb = mode === 'unlock' ? 'Enter your PIN to reveal the vault for this session.'
        : mode === 'setup' ? `At least ${MIN_PIN_LENGTH} digits. There is no recovery — if you forget it, the vault contents are unrecoverable.`
            : mode === 'confirm' ? 'Enter the same PIN once more.'
                : 'Enter your PIN to confirm. The vault and its contents list are erased. Your video files are not touched.';
    return createPortal(_jsx("div", { className: "fixed inset-0 z-[420] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm", onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": title, onClick: (e) => e.stopPropagation(), className: "w-full max-w-sm overflow-hidden rounded-2xl border border-content/10 bg-surface shadow-2xl shadow-black/60", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-content/10 px-5 py-4", children: [mode === 'destroy' ? (_jsx(Trash2, { className: "h-5 w-5 text-red-400" })) : (_jsx(Lock, { className: "h-5 w-5 text-primary" })), _jsx("h2", { className: "text-base font-bold text-content", children: title }), _jsx("button", { onClick: onClose, className: "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-content/60 transition hover:bg-content/10 hover:text-content", "aria-label": "Close", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsx("div", { className: "p-5", children: !secure ? (_jsxs("div", { className: "flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs leading-relaxed text-red-400", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsxs("span", { children: ["The vault needs the Web Crypto API, which browsers only expose over", ' ', _jsx("span", { className: "font-mono", children: "https://" }), " or on", ' ', _jsx("span", { className: "font-mono", children: "localhost" }), ". Open LocalTube from one of those and the vault becomes available."] })] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-xs leading-relaxed text-content/60", children: blurb }), _jsx(PinDots, { length: pin.length, tone: mode === 'destroy' ? 'danger' : 'normal' }), error && (_jsxs("p", { className: "mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-red-400", children: [_jsx(AlertTriangle, { className: "h-3.5 w-3.5" }), error] })), _jsx(Keypad, { disabled: busy, onDigit: (d) => setPin((p) => (p.length < MAX_PIN ? p + d : p)), onBackspace: () => setPin((p) => p.slice(0, -1)) }), _jsxs("button", { onClick: () => void submit(), disabled: busy || pin.length === 0, className: `mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'destroy' ? 'bg-red-600 hover:bg-red-500' : 'bg-primary hover:brightness-110'}`, children: [busy ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(ShieldCheck, { className: "h-4 w-4" }), busy
                                        ? 'Deriving key…'
                                        : mode === 'unlock' ? 'Unlock'
                                            : mode === 'setup' ? 'Continue'
                                                : mode === 'confirm' ? 'Create vault'
                                                    : 'Delete vault'] }), busy && (_jsx("p", { className: "mt-2 text-center text-[11px] text-content/40", children: "600,000 PBKDF2 rounds \u2014 the delay is the point." })), hasVault && mode === 'unlock' && (_jsx("button", { onClick: () => {
                                    setMode('destroy');
                                    setPin('');
                                    setError(null);
                                }, className: "mt-3 w-full text-center text-[11px] text-content/35 transition hover:text-red-400", children: "Forgot your PIN? Delete the vault and start over" })), mode === 'destroy' && (_jsx("button", { onClick: () => {
                                    setMode('unlock');
                                    setPin('');
                                    setError(null);
                                }, className: "mt-3 w-full text-center text-[11px] text-content/40 transition hover:text-content", children: "Cancel" }))] })) })] }) }), document.body);
}
/** Shows only how many digits were entered — never which. */
function PinDots({ length, tone }) {
    const slots = Math.max(MIN_PIN_LENGTH, length);
    return (_jsx("div", { className: "my-5 flex items-center justify-center gap-2.5", children: Array.from({ length: slots }, (_, i) => (_jsx("span", { className: `h-2.5 w-2.5 rounded-full transition-all duration-150 ${i < length
                ? tone === 'danger'
                    ? 'scale-110 bg-red-500'
                    : 'scale-110 bg-primary'
                : 'bg-content/15'}` }, i))) }));
}
function Keypad({ disabled, onDigit, onBackspace, }) {
    return (_jsxs("div", { className: "grid grid-cols-3 gap-2", children: [['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (_jsx(PadButton, { disabled: disabled, onClick: () => onDigit(d), children: d }, d))), _jsx("span", {}), _jsx(PadButton, { disabled: disabled, onClick: () => onDigit('0'), children: "0" }), _jsx(PadButton, { disabled: disabled, onClick: onBackspace, "aria-label": "Delete last digit", children: _jsx(Delete, { className: "h-5 w-5" }) })] }));
}
function PadButton({ children, disabled, onClick, ...rest }) {
    return (_jsx("button", { ...rest, type: "button", disabled: disabled, onClick: onClick, className: "flex h-12 items-center justify-center rounded-xl border border-content/10 bg-content/[0.04] text-lg font-semibold tabular-nums text-content transition hover:bg-content/10 active:scale-95 disabled:opacity-40", children: children }));
}
