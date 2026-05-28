#!/usr/bin/env node
/**
 * backfill-memberships.mjs — Stage 1 (security hardening) one-time backfill.
 *
 * The hardened firestore.rules gate every org-scoped collection on a membership
 * pivot document at `memberships/{uid}_{orgId}`. Older data may predate the
 * deterministic-membership era, so this script guarantees a membership doc
 * exists for:
 *   1. every organization's owner  (organizations.ownerId)         → role admin
 *   2. every user that carries an  (users.orgId)                    → role member
 *      active orgId                                                   (admin if owner)
 *
 * MUST run BEFORE deploying the hardened rules, otherwise affected users would
 * be denied access to their own workspace until they re-bootstrap.
 *
 * Idempotent: only creates a membership when one is missing — it never
 * overwrites an existing role/joinedAt. Safe to run repeatedly.
 *
 * Usage:
 *   # from cloud-run/gateway/ (firebase-admin resolves from node_modules)
 *   GOOGLE_CLOUD_PROJECT=<project> node scripts/backfill-memberships.mjs [--dry-run]
 *
 * Auth: uses Application Default Credentials (gcloud auth application-default
 * login, or a service-account key via GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT_ID;

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId });
}
const db = getFirestore();

function membershipId(uid, orgId) {
  return `${uid}_${orgId}`;
}

async function ensureMembership(uid, orgId, role, stats) {
  if (!uid || !orgId) {
    stats.skipped++;
    return;
  }
  const id = membershipId(uid, orgId);
  const ref = db.collection('memberships').doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    stats.existing++;
    return;
  }
  stats.created++;
  console.log(`  ${DRY_RUN ? '[dry-run] would create' : 'creating'} memberships/${id} (role=${role})`);
  if (DRY_RUN) return;
  await ref.set({
    uid,
    orgId,
    role,
    joinedAt: FieldValue.serverTimestamp(),
    backfilledBy: 'stage1-membership-backfill',
  });
}

async function main() {
  console.log(
    `[backfill-memberships] project=${projectId ?? '(adc default)'} mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`,
  );

  const stats = { created: 0, existing: 0, skipped: 0 };
  const ownerByOrg = new Map();

  // 1. Org owners → admin membership.
  const orgs = await db.collection('organizations').get();
  console.log(`[backfill-memberships] organizations: ${orgs.size}`);
  for (const doc of orgs.docs) {
    const ownerId = doc.get('ownerId');
    if (ownerId) ownerByOrg.set(doc.id, ownerId);
    await ensureMembership(ownerId, doc.id, 'admin', stats);
  }

  // 2. Users with an active orgId → membership (admin if they own that org).
  const users = await db.collection('users').get();
  console.log(`[backfill-memberships] users: ${users.size}`);
  for (const doc of users.docs) {
    const orgId = doc.get('orgId');
    if (!orgId) continue;
    const role = ownerByOrg.get(orgId) === doc.id ? 'admin' : 'member';
    await ensureMembership(doc.id, orgId, role, stats);
  }

  console.log(
    `[backfill-memberships] done — created=${stats.created} existing=${stats.existing} skipped=${stats.skipped}`,
  );
}

main().catch((err) => {
  console.error('[backfill-memberships] FAILED:', err);
  process.exit(1);
});
