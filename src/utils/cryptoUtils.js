/* ─────────────────────────────────────────────────────────────
 *  VAULT CRYPTOGRAPHY
 * ─────────────────────────────────────────────────────────────
 *  PBKDF2-SHA256 → AES-256-GCM, entirely via window.crypto.subtle. No
 *  library, no network, no key ever leaves this tab's memory.
 *
 *  ── WHAT THIS ACTUALLY PROTECTS AGAINST ──
 *  Be clear-eyed about it: a numeric PIN is a very small secret. Six digits
 *  is 10^6 candidates. An attacker who copies the IndexedDB file can test
 *  them offline, in parallel, on hardware you don't control — PBKDF2-SHA256
 *  is exactly the kind of function GPUs chew through. Assume a determined
 *  forensic attacker recovers a 6-digit PIN.
 *
 *  So this defends against the realistic threat: someone who picks up your
 *  unlocked laptop and clicks around. It does NOT defend against someone
 *  who images your disk. The iteration count and the GCM auth tag are
 *  there to make the easy attack expensive, not to make the hard one
 *  impossible. A user who needs the latter needs a passphrase, and the PIN
 *  pad accepts arbitrary length for exactly that reason.
 *
 *  ── WHY GCM ──
 *  Authenticated encryption gives PIN verification for free: a wrong key
 *  fails the tag check and decrypt() throws. There is no separate password
 *  hash to store, and therefore nothing to verify a guess against that is
 *  cheaper than the KDF itself.
 * ───────────────────────────────────────────────────────────── */
/** OWASP's 2023 floor for PBKDF2-SHA256. Recorded per-payload so it can be raised later without breaking old vaults. */
export const PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96 bits — the size GCM is specified for
const KEY_BITS = 256;
/** Refuse to create a vault weaker than this. */
export const MIN_PIN_LENGTH = 6;
function subtle() {
    const c = globalThis.crypto?.subtle;
    if (!c) {
        /* Non-secure contexts (plain http:// on a LAN IP) have no SubtleCrypto. */
        throw new Error('Encryption is unavailable. The vault needs a secure context (https:// or localhost).');
    }
    return c;
}
/**
 * Stretches the PIN into an AES key.
 *
 * The derived key is marked non-extractable: even code running in this page
 * cannot read the raw bytes back out of it, so a later XSS bug can at worst
 * use the key while the vault is open, not exfiltrate it.
 */
async function deriveKey(pin, salt, iterations) {
    const material = await subtle().importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: KEY_BITS }, false, // non-extractable
    ['encrypt', 'decrypt']);
}
/** Derives and hands back the key so a session can reuse it without re-prompting. */
export async function deriveSessionKey(pin, salt, iterations = PBKDF2_ITERATIONS) {
    return deriveKey(pin, salt, iterations);
}
export function randomBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
}
/** Encrypts with an already-derived key (the unlocked-session path). */
export async function encryptWithKey(data, key, salt, iterations) {
    /*
     * A fresh IV per encryption is mandatory, not hygiene: reusing an IV with
     * the same GCM key leaks the XOR of the plaintexts and can expose the
     * authentication subkey. Every save re-randomises it.
     */
    const iv = randomBytes(IV_BYTES);
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
    return { v: 1, salt, iv, ciphertext: new Uint8Array(ct), iterations };
}
/** Encrypts from a PIN, generating a fresh salt. Used when creating a vault. */
export async function encryptData(data, pin) {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(pin, salt, PBKDF2_ITERATIONS);
    return encryptWithKey(data, key, salt, PBKDF2_ITERATIONS);
}
export async function decryptWithKey(payload, key) {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: payload.iv }, key, payload.ciphertext);
    return JSON.parse(new TextDecoder().decode(plain));
}
/**
 * Decrypts with a PIN.
 *
 * Throws on the wrong PIN — that is the GCM tag failing, and it is the only
 * PIN check in the system. Callers should surface it as "wrong PIN" without
 * distinguishing it from corruption, because they genuinely cannot tell the
 * two apart and guessing would leak which one it was.
 */
export async function decryptData(payload, pin) {
    const key = await deriveKey(pin, payload.salt, payload.iterations ?? PBKDF2_ITERATIONS);
    return decryptWithKey(payload, key);
}
/* ─────────────────────────────────────────────────────────────
 *  BLIND MEMBERSHIP DIGESTS
 * ─────────────────────────────────────────────────────────────
 *  A vault whose files still show up in "All Media" while locked is not
 *  private in any way a user would recognise. But hiding them requires
 *  knowing which ids are vaulted — and while locked, that is precisely
 *  what is encrypted.
 *
 *  The way out: store a salted SHA-256 of each vaulted id in the clear.
 *  Locked, the app hashes the ids it can see and drops any whose digest is
 *  in the list. It filters correctly without ever learning the set.
 *
 *  What this leaks, stated plainly: the salt is stored beside the digests,
 *  so anyone with the database AND a copy of the same library can hash
 *  their own filenames and learn which ones are vaulted. It hides the
 *  contents from the UI and from a casual snooper; it is not a defence
 *  against forensic analysis. That matches the PIN's real strength, so it
 *  does not become the weakest link.
 * ───────────────────────────────────────────────────────────── */
export async function digestMediaId(mediaId, digestSalt) {
    const input = new Uint8Array(digestSalt.length + mediaId.length * 3);
    input.set(digestSalt, 0);
    const encoded = new TextEncoder().encode(mediaId);
    input.set(encoded, digestSalt.length);
    const hash = await subtle().digest('SHA-256', input.slice(0, digestSalt.length + encoded.length));
    return bytesToBase64(new Uint8Array(hash));
}
export async function digestMediaIds(ids, digestSalt) {
    return Promise.all(ids.map((id) => digestMediaId(id, digestSalt)));
}
export function bytesToBase64(bytes) {
    let s = '';
    for (const b of bytes)
        s += String.fromCharCode(b);
    return btoa(s);
}
