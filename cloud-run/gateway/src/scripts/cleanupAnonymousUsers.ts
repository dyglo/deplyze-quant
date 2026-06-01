/**
 * cleanupAnonymousUsers.ts — prune stale anonymous (guest) Firebase accounts.
 *
 * Guests are created via silent anonymous sign-in for the public surfaces. Those
 * accounts accumulate over time, so this job deletes anonymous users that have
 * been idle beyond a cutoff. Full accounts (any linked provider or an email) are
 * never touched.
 *
 * Run locally or as a scheduled Cloud Run job (Cloud Scheduler → Cloud Run).
 * Invoked directly with tsx (no package.json script added, to avoid touching
 * unrelated local changes):
 *   npx tsx src/scripts/cleanupAnonymousUsers.ts --dry-run            # report only
 *   npx tsx src/scripts/cleanupAnonymousUsers.ts --days=30           # idle > 30d (dry-run unless --confirm)
 *   npx tsx src/scripts/cleanupAnonymousUsers.ts --days=30 --confirm # actually delete
 *
 * Requires FIREBASE_PROJECT_ID and Application Default Credentials with the
 * Firebase Authentication Admin role.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : 'true';
}

const DRY_RUN = arg('dry-run') === 'true' || arg('confirm') !== 'true';
const DAYS = Number(arg('days') ?? '30');
const cutoffMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;

function isAnonymous(u: UserRecord): boolean {
  return (u.providerData?.length ?? 0) === 0 && !u.email && !u.phoneNumber;
}

function lastActiveMs(u: UserRecord): number {
  const t = u.metadata.lastRefreshTime || u.metadata.lastSignInTime || u.metadata.creationTime;
  return t ? new Date(t).getTime() : 0;
}

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  }
  const auth = getAuth();

  let scanned = 0;
  let anon = 0;
  const toDelete: string[] = [];
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      scanned++;
      if (!isAnonymous(u)) continue;
      anon++;
      if (lastActiveMs(u) < cutoffMs) toDelete.push(u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`[cleanup] scanned=${scanned} anonymous=${anon} idle>${DAYS}d=${toDelete.length} dryRun=${DRY_RUN}`);

  if (DRY_RUN || toDelete.length === 0) {
    if (DRY_RUN && toDelete.length) console.log('[cleanup] dry-run — pass --confirm to delete.');
    return;
  }

  let deleted = 0;
  // deleteUsers accepts up to 1000 uids per call.
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    const res = await auth.deleteUsers(batch);
    deleted += res.successCount;
    if (res.failureCount) {
      console.warn(`[cleanup] batch failures=${res.failureCount}`, res.errors.slice(0, 3));
    }
  }
  console.log(`[cleanup] deleted ${deleted} stale anonymous users.`);
}

main().catch((err) => {
  console.error('[cleanup] failed:', err);
  process.exit(1);
});
