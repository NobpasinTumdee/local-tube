import { useEffect, useMemo, useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { useStore } from '../store/useStore';
import { digestMediaId } from '../utils/cryptoUtils';

/* ─────────────────────────────────────────────────────────────
 *  VAULT GUARD
 * ─────────────────────────────────────────────────────────────
 *  Two jobs the vault store cannot do on its own:
 *
 *  1. Resolve the blind digests into concrete ids to hide. Hashing is async
 *     and costs one SHA-256 per library item, so it runs in an effect and
 *     caches — never inline in a render or a filter callback.
 *  2. Keep the idle timer honest. The store's 5-minute countdown only means
 *     something if real user activity resets it.
 * ───────────────────────────────────────────────────────────── */

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

/**
 * Ids the current library should pretend not to have.
 *
 * While UNLOCKED this is empty: the vault's own view needs the items, and
 * they are shown under the Private Vault collection instead.
 * While LOCKED it is every id whose salted digest is in the stored list —
 * so vaulted files vanish from All Media without the app knowing which
 * files they are.
 */
export function useVaultHiddenIds(): ReadonlySet<string> {
  const videos = useStore((s) => s.videos);
  const hiddenDigests = useVaultStore((s) => s.hiddenDigests);
  const digestSalt = useVaultStore((s) => s.digestSalt);
  const isUnlocked = useVaultStore((s) => s.isVaultUnlocked);

  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());

  const digestSet = useMemo(() => new Set(hiddenDigests), [hiddenDigests]);

  useEffect(() => {
    if (isUnlocked || digestSet.size === 0 || !digestSalt || videos.length === 0) {
      setResolved(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const hits = new Set<string>();
      /* One digest per library item. Cheap per item, but O(n) — hence the
         effect + cache rather than doing this during filtering. */
      await Promise.all(
        videos.map(async (v) => {
          const d = await digestMediaId(v.id, digestSalt);
          if (digestSet.has(d)) hits.add(v.id);
        }),
      );
      if (!cancelled) setResolved(hits);
    })().catch(() => {
      /* Without SubtleCrypto we cannot resolve digests. Failing closed
         (hiding nothing) would expose the vault, so hide nothing only
         because we equally cannot show the vault — see VaultModal, which
         refuses to open in an insecure context. */
      if (!cancelled) setResolved(new Set());
    });
    return () => {
      cancelled = true;
    };
  }, [videos, digestSet, digestSalt, isUnlocked]);

  return resolved;
}

/** Hydrates the vault once and keeps the auto-lock timer fed. Mount at the root. */
export function useVaultSession(): void {
  const hydrate = useVaultStore((s) => s.hydrate);
  const isUnlocked = useVaultStore((s) => s.isVaultUnlocked);
  const touch = useVaultStore((s) => s.touch);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isUnlocked) return;

    /* Passive: these fire constantly and must never delay scrolling. */
    const onActivity = () => touch();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    /*
     * Note there is deliberately no lock-on-tab-hide. It reads as the safer
     * choice, but in a media player you alt-tab constantly while something
     * plays, and locking on every blur would tear the vault's own playlist
     * out from under a running video. Genuine absence is already covered:
     * activity stops, so the idle timer fires.
     */
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, [isUnlocked, touch]);
}
