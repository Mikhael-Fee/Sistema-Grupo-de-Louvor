import { useEffect } from 'react';

type WakeLockSentinelLike = { released: boolean; release(): Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };

/** Keeps the screen on while `active`, re-acquiring it when the app comes back to the front. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!active || !wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopped = false;
    const acquire = () => {
      if (stopped || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      // Browsers can refuse (battery saver, unsupported context); the page keeps working.
      wakeLock
        .request('screen')
        .then(lock => {
          if (stopped) void lock.release().catch(() => {});
          else sentinel = lock;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [active]);
}
