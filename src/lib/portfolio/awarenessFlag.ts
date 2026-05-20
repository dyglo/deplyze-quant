/**
 * Awareness Workspace feature flag.
 *
 * Resolution order (first match wins):
 *   1. URL param `?awareness=1` or `?awareness=0` — persists to localStorage.
 *   2. localStorage `deplyze.awareness` = '1' or '0'.
 *   3. Build-time env `VITE_AWARENESS_WORKSPACE=1`.
 *   4. Default: ON in Vite dev mode, OFF in production.
 *
 * Rationale: dev velocity (instant visibility while iterating) without
 * exposing the workspace to production users until rollout is approved.
 * Explicit override via localStorage `=0` lets devs disable it on demand.
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
  // 3. Build-time env + dev default
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
    if (env && env.VITE_AWARENESS_WORKSPACE === '1') return true;
    // Default ON in Vite dev mode so the workspace is visible without
    // per-developer setup. Production builds remain OFF unless the env
    // var is set or the user opts in via localStorage / URL.
    if (env && env.DEV === true) return true;
  } catch { /* ignore */ }
  return false;
}
