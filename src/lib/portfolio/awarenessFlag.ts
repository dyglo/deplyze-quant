/**
 * Awareness Workspace feature flag.
 *
 * Resolution order (first match wins):
 *   1. URL param `?awareness=1` or `?awareness=0` — persists to localStorage.
 *   2. localStorage `deplyze.awareness` = '1' or '0'.
 *   3. Build-time env `VITE_AWARENESS_WORKSPACE=0` to force-disable.
 *   4. Default: ON.
 *
 * The workspace is now generally available; the flag stays so an
 * operator can quickly disable it via localStorage `=0`, `?awareness=0`,
 * or `VITE_AWARENESS_WORKSPACE=0` at build time.
 */

const LS_KEY = 'deplyze.awareness';

function readUrlOverride(): '1' | '0' | null {
  if (typeof window === 'undefined') return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('awareness');
    if (v === '1' || v === '0') return v;
    return null;
  } catch {
    return null;
  }
}

export function isAwarenessWorkspaceEnabled(): boolean {
  // 1. URL override (and persist)
  const urlOverride = readUrlOverride();
  if (urlOverride !== null) {
    try { window.localStorage.setItem(LS_KEY, urlOverride); } catch { /* ignore */ }
    return urlOverride === '1';
  }
  // 2. localStorage
  try {
    const ls = window.localStorage.getItem(LS_KEY);
    if (ls === '1') return true;
    if (ls === '0') return false;
  } catch { /* ignore */ }
  // 3. Build-time env override (force-disable only)
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
    if (env && env.VITE_AWARENESS_WORKSPACE === '0') return false;
  } catch { /* ignore */ }
  // 4. Default ON — workspace is GA.
  return true;
}
