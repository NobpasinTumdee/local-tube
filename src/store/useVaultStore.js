import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { MIN_PIN_LENGTH, PBKDF2_ITERATIONS, decryptWithKey, deriveSessionKey, digestMediaIds, encryptWithKey, randomBytes, } from '../utils/cryptoUtils';
/* ─────────────────────────────────────────────────────────────
 *  PRIVATE VAULT
 * ─────────────────────────────────────────────────────────────
 *  A virtual playlist whose membership list is encrypted at rest and only
 *  materialises in memory while unlocked.
 *
 *  ── WHY THE KEY LIVES OUTSIDE THE STORE ──
 *  `sessionKey` is a module-level variable, not Zustand state, and that is
 *  deliberate. Anything in the store is enumerable by any code that imports
 *  it, shows up in devtools/state inspectors, and would be swept into a
 *  state dump. Keeping the CryptoKey out of the tree means the only handle
 *  to it is this module's closure. It is also non-extractable (see
 *  cryptoUtils), so even reaching it yields no raw bytes.
 *
 *  ── WHAT LOCKING ACTUALLY DOES ──
 *  Drops the key reference and empties `mediaIds`. There is no way to zero
 *  a JS string, so the ids may linger in heap until GC — locking is a UI
 *  and access-control boundary, not a memory-forensics one. It is honest
 *  about that rather than pretending otherwise.
 * ───────────────────────────────────────────────────────────── */
const VAULT_KEY = 'localtube:vault';
export const AUTO_LOCK_MS = 5 * 60 * 1000;
/** Never persisted, never in the store. */
let sessionKey = null;
let sessionSalt = null;
let sessionIterations = PBKDF2_ITERATIONS;
let lockTimer;
export const useVaultStore = create()((set, get) => {
    /** Persists the current membership under the live session key. */
    async function persistMembership(ids) {
        if (!sessionKey || !sessionSalt)
            throw new Error('Vault is locked.');
        const existing = await idbGet(VAULT_KEY);
        const digestSalt = existing?.digestSalt ?? get().digestSalt ?? randomBytes(16);
        const payload = await encryptWithKey(ids, sessionKey, sessionSalt, sessionIterations);
        const digests = await digestMediaIds(ids, digestSalt);
        const record = {
            payload,
            digestSalt,
            digests,
            createdAt: existing?.createdAt ?? Date.now(),
        };
        await idbSet(VAULT_KEY, record);
        set({ mediaIds: ids, hiddenDigests: digests, digestSalt });
    }
    function armAutoLock() {
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => get().lock(), AUTO_LOCK_MS);
    }
    return {
        hydrated: false,
        hasVault: false,
        isVaultUnlocked: false,
        mediaIds: [],
        hiddenDigests: [],
        digestSalt: null,
        busy: false,
        error: null,
        setError: (msg) => set({ error: msg }),
        hydrate: async () => {
            if (get().hydrated)
                return;
            try {
                const rec = await idbGet(VAULT_KEY);
                set({
                    hydrated: true,
                    hasVault: !!rec,
                    /* Digests load while locked — that is the whole point of them. */
                    hiddenDigests: rec?.digests ?? [],
                    digestSalt: rec?.digestSalt ?? null,
                });
            }
            catch (err) {
                console.error('[vault] hydrate failed', err);
                set({ hydrated: true, error: 'Could not read the vault.' });
            }
        },
        createVault: async (pin) => {
            if (pin.length < MIN_PIN_LENGTH) {
                set({ error: `Use at least ${MIN_PIN_LENGTH} digits.` });
                return false;
            }
            set({ busy: true, error: null });
            try {
                const salt = randomBytes(16);
                const key = await deriveSessionKey(pin, salt, PBKDF2_ITERATIONS);
                sessionKey = key;
                sessionSalt = salt;
                sessionIterations = PBKDF2_ITERATIONS;
                const digestSalt = randomBytes(16);
                set({ digestSalt });
                await persistMembership([]);
                set({ hasVault: true, isVaultUnlocked: true, busy: false });
                armAutoLock();
                return true;
            }
            catch (err) {
                sessionKey = null;
                sessionSalt = null;
                console.error('[vault] create failed', err);
                set({ busy: false, error: err instanceof Error ? err.message : 'Could not create the vault.' });
                return false;
            }
        },
        unlock: async (pin) => {
            set({ busy: true, error: null });
            try {
                const rec = await idbGet(VAULT_KEY);
                if (!rec) {
                    set({ busy: false, hasVault: false, error: 'No vault has been set up yet.' });
                    return false;
                }
                const iterations = rec.payload.iterations ?? PBKDF2_ITERATIONS;
                const key = await deriveSessionKey(pin, rec.payload.salt, iterations);
                /* The only PIN check there is: a wrong key fails GCM's tag. */
                const ids = await decryptWithKey(rec.payload, key);
                sessionKey = key;
                sessionSalt = rec.payload.salt;
                sessionIterations = iterations;
                set({
                    isVaultUnlocked: true,
                    mediaIds: Array.isArray(ids) ? ids : [],
                    hiddenDigests: rec.digests ?? [],
                    digestSalt: rec.digestSalt ?? null,
                    busy: false,
                    error: null,
                });
                armAutoLock();
                return true;
            }
            catch {
                /* Wrong PIN and corrupted data are indistinguishable here, and
                   saying which would leak information about the stored data. */
                set({ busy: false, error: 'Incorrect PIN.' });
                return false;
            }
        },
        lock: () => {
            clearTimeout(lockTimer);
            lockTimer = undefined;
            sessionKey = null;
            sessionSalt = null;
            /* Purge the decrypted membership from React state. Digests stay so the
               items remain hidden from the library while locked. */
            set({ isVaultUnlocked: false, mediaIds: [], error: null });
        },
        /** Any interaction while unlocked restarts the 5-minute idle countdown. */
        touch: () => {
            if (!get().isVaultUnlocked)
                return;
            armAutoLock();
        },
        addToVault: async (mediaId) => {
            if (!get().isVaultUnlocked)
                return;
            const ids = get().mediaIds;
            if (ids.includes(mediaId))
                return;
            try {
                await persistMembership([...ids, mediaId]);
                armAutoLock();
            }
            catch (err) {
                console.error('[vault] add failed', err);
                set({ error: 'Could not save to the vault.' });
            }
        },
        removeFromVault: async (mediaId) => {
            if (!get().isVaultUnlocked)
                return;
            try {
                await persistMembership(get().mediaIds.filter((id) => id !== mediaId));
                armAutoLock();
            }
            catch (err) {
                console.error('[vault] remove failed', err);
                set({ error: 'Could not update the vault.' });
            }
        },
        /*
         * Destroying requires the PIN even when already unlocked. Otherwise
         * anyone who walks up to an open vault can erase it, which turns a
         * momentary lapse into permanent data loss.
         */
        destroyVault: async (pin) => {
            set({ busy: true, error: null });
            try {
                const rec = await idbGet(VAULT_KEY);
                if (rec) {
                    const key = await deriveSessionKey(pin, rec.payload.salt, rec.payload.iterations ?? PBKDF2_ITERATIONS);
                    await decryptWithKey(rec.payload, key); // throws on a wrong PIN
                }
                await idbDel(VAULT_KEY);
                clearTimeout(lockTimer);
                sessionKey = null;
                sessionSalt = null;
                set({
                    busy: false,
                    hasVault: false,
                    isVaultUnlocked: false,
                    mediaIds: [],
                    hiddenDigests: [],
                    digestSalt: null,
                });
                return true;
            }
            catch {
                set({ busy: false, error: 'Incorrect PIN.' });
                return false;
            }
        },
    };
});
