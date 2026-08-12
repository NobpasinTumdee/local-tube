/* ─────────────────────────────────────────────────────────────
 *  FILE SYSTEM ACCESS — PERMISSION RE-VERIFICATION
 * ─────────────────────────────────────────────────────────────
 *  A FileSystemDirectoryHandle survives a browser restart in IndexedDB, but
 *  the *grant* attached to it does not. A rehydrated handle comes back in the
 *  'prompt' state: every read throws NotAllowedError until the user re-grants.
 *
 *  Re-granting can only happen inside a user gesture. Chrome discards the
 *  gesture token across an `await`, so `requestPermission()` must be reached
 *  from a click with nothing slow in front of it — see requestPermission()
 *  below for what that rules out.
 * ───────────────────────────────────────────────────────────── */

export type PermissionMode = 'read' | 'readwrite';

/**
 * Not every handle-bearing browser implements the permission API (older
 * Chromium, and any polyfill). Treat a missing method as "already allowed":
 * the read itself will throw later if it truly isn't, and that path is
 * already handled by the callers.
 */
interface PermissionCapableHandle {
  queryPermission?: (d: { mode: PermissionMode }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: PermissionMode }) => Promise<PermissionState>;
}

/**
 * Silent check — never shows UI, so it is safe to call on page load.
 * Returns 'granted' | 'denied' | 'prompt'.
 */
export async function queryPermission(
  handle: FileSystemHandle,
  mode: PermissionMode = 'read',
): Promise<PermissionState> {
  const h = handle as unknown as PermissionCapableHandle;
  if (!h.queryPermission) return 'granted';
  try {
    return await h.queryPermission({ mode });
  } catch {
    /* Some handles throw on cross-origin or revoked entries. */
    return 'denied';
  }
}

/**
 * Checks whether we can read `handle`, prompting the user natively if the
 * grant has lapsed. Resolves true only when access is actually usable.
 *
 * MUST be called from a user gesture (a click handler), and must be the
 * FIRST await in that handler — anything awaited before it consumes the
 * gesture token and the prompt is suppressed, which surfaces as a silent
 * `false` with no visible dialog.
 */
export async function verifyPermission(
  fileHandle: FileSystemHandle,
  mode: PermissionMode = 'read',
): Promise<boolean> {
  const h = fileHandle as unknown as PermissionCapableHandle;

  /* Already granted — no prompt, no gesture needed. */
  if (await queryPermission(fileHandle, mode) === 'granted') return true;

  if (!h.requestPermission) return false;
  try {
    return (await h.requestPermission({ mode })) === 'granted';
  } catch {
    /* Thrown when called outside a user gesture. */
    return false;
  }
}

export interface PermissionSweep<T> {
  granted: T[];
  denied: T[];
}

/**
 * Re-verifies a whole set of handles, one prompt at a time.
 *
 * Deliberately sequential: Chrome coalesces concurrent permission requests
 * for different handles into a single dialog whose result is ambiguous, and
 * a user who declines folder #1 should not be pestered in parallel for #2.
 * Partial success is normal — a preset can outlive one of its folders — so
 * both halves are returned rather than throwing.
 */
export async function verifyPermissions<T extends FileSystemHandle>(
  handles: readonly T[],
  mode: PermissionMode = 'read',
): Promise<PermissionSweep<T>> {
  const granted: T[] = [];
  const denied: T[] = [];
  for (const handle of handles) {
    if (await verifyPermission(handle, mode)) granted.push(handle);
    else denied.push(handle);
  }
  return { granted, denied };
}

/**
 * Splits handles by whether they are usable *right now*, without prompting.
 * Used on cold start, where no user gesture is available.
 */
export async function partitionByPermission<T extends FileSystemHandle>(
  handles: readonly T[],
  mode: PermissionMode = 'read',
): Promise<PermissionSweep<T>> {
  const results = await Promise.all(
    handles.map(async (h) => [h, await queryPermission(h, mode)] as const),
  );
  return {
    granted: results.filter(([, s]) => s === 'granted').map(([h]) => h),
    denied: results.filter(([, s]) => s !== 'granted').map(([h]) => h),
  };
}

/**
 * A directory handle can be persisted long after the folder itself is gone
 * (renamed, unmounted drive, deleted). Permission may still read 'granted',
 * so the only reliable liveness test is to actually touch the directory.
 */
export async function isDirectoryReadable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    /*
     * Probes with entries() specifically, because that is what the scanner
     * itself iterates — the point is to predict whether the scan will work,
     * so testing a different accessor (keys(), values()) would gate the
     * workspace on an API it never actually uses. One iteration is enough,
     * and an empty directory ends the loop immediately without an error.
     */
    for await (const _entry of handle.entries()) break;
    return true;
  } catch {
    return false;
  }
}
