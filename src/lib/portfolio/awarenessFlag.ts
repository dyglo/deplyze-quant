/**
 * Awareness Workspace feature flag.
 *
 * Off by default. Three opt-in mechanisms:
 *   1. Vite build env: VITE_AWARENESS_WORKSPACE=1
 *   2. Runtime localStorage override: localStorage.setItem('deplyze.awareness', '1')
 *   3. URL param: ?awareness=1 (persists to localStorage for that session)
 *
 * Kept independent of the V5 personalization profile so P0 ships with zero
 * backend coupling. P4 will route this through user-profile preferences.
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
  // 3. Build-time env
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (env && env.VITE_AWARENESS_WORKSPACE === '1') return true;
  } catch { /* ignore */ }
  return false;
}
