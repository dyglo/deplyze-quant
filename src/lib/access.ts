/**
 * access.ts — single source of truth for which routes anonymous guests may
 * view without a full account.
 *
 * Used by the sidebar to decide whether a guest clicking a nav item should
 * navigate (public) or be prompted to sign in (gated). Each public surface is
 * opened by adding a matcher here AND switching its <Route> to <PublicRoute> in
 * App.tsx — keep the two in sync. Gated routes stay behind <ProtectedRoute>.
 */

type PathMatcher = (path: string) => boolean;

const exact = (p: string): PathMatcher => (path) => path === p;
const prefix = (p: string): PathMatcher => (path) => path === p || path.startsWith(p + '/');

// Opened in PR2 (home + terminal). Later PRs append macro, relations-map,
// instruments, market dashboards, briefings, historical-intelligence.
const PUBLIC_MATCHERS: PathMatcher[] = [
  exact('/'),
  prefix('/terminal'),
];

/** True when a guest may view this path without signing in. */
export function isPublicPath(path: string): boolean {
  return PUBLIC_MATCHERS.some((m) => m(path));
}
