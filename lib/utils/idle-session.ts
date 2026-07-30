const LAST_ACTIVE_KEY = 'freightops-last-active';
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const HEARTBEAT_THROTTLE_MS = 60 * 1000; // write at most once/minute

/**
 * True only when a previous session was left idle past the timeout —
 * absent storage (fresh device, cleared storage, never logged in) is
 * never treated as "expired".
 */
export function isSessionIdleExpired(): boolean {
  const stored = localStorage.getItem(LAST_ACTIVE_KEY);
  if (!stored) return false;
  const lastActive = Number(stored);
  if (!Number.isFinite(lastActive)) return false;
  return Date.now() - lastActive > IDLE_TIMEOUT_MS;
}

export function markActive(): void {
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

export function clearActivity(): void {
  localStorage.removeItem(LAST_ACTIVE_KEY);
}

/**
 * Keeps a genuinely-in-use session from being logged out just because
 * the idle mark passed while the user was actively working — resets
 * the clock on interaction and on returning to the tab, throttled so
 * it doesn't write to storage on every keystroke.
 */
export function startActivityTracking(): () => void {
  let lastWrite = 0;

  const onActivity = () => {
    const now = Date.now();
    if (now - lastWrite < HEARTBEAT_THROTTLE_MS) return;
    lastWrite = now;
    markActive();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') onActivity();
  };

  window.addEventListener('click', onActivity);
  window.addEventListener('keydown', onActivity);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('click', onActivity);
    window.removeEventListener('keydown', onActivity);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
