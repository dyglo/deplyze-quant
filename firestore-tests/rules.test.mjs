/**
 * Firestore security-rules tests — tenant isolation (Stage 1 hardening).
 *
 * Run against the Firestore emulator:
 *   firebase emulators:exec --only firestore --project=demo-deplyze \
 *     "node --test firestore-tests/"
 *
 * The tests assert the cross-tenant holes closed in this PR:
 *   - portfolios / holdings / transactions  → owner (uid) only
 *   - customScenarios / portfolioIntelligence → owner only
 *   - organizations / sites / invites / memberships → org-membership scoped
 *   - workspaces/{orgId}/… subtree → org-membership scoped
 *   - owner fallback works when a membership doc is missing
 *   - server-only collections are never client-accessible
 */

import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-deplyze',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed fixtures with rules bypassed.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // org1: alice = owner+member, bob = member, carol = outsider
    await setDoc(doc(db, 'organizations', 'org1'), { ownerId: 'alice', name: 'Org One' });
    await setDoc(doc(db, 'memberships', 'alice_org1'), { uid: 'alice', orgId: 'org1', role: 'admin' });
    await setDoc(doc(db, 'memberships', 'bob_org1'), { uid: 'bob', orgId: 'org1', role: 'viewer' });
    // org2: dave = owner but NO membership doc (exercises owner fallback)
    await setDoc(doc(db, 'organizations', 'org2'), { ownerId: 'dave', name: 'Org Two' });

    await setDoc(doc(db, 'sites', 's1'), { orgId: 'org1', name: 'Project One' });
    await setDoc(doc(db, 'invites', 'i1'), { orgId: 'org1', email: 'x@y.z', status: 'pending' });

    await setDoc(doc(db, 'workspaces/org1/projects/proj1/artifacts/a1'), { title: 'art', source: 'agent' });

    // alice owns portfolio p1 + a holding, transaction, observation, scenario
    await setDoc(doc(db, 'portfolios', 'p1'), { uid: 'alice', workspaceId: 'org1', name: 'PF' });
    await setDoc(doc(db, 'portfolios/p1/holdings/h1'), { symbol: 'AAPL', portfolioId: 'p1' });
    await setDoc(doc(db, 'portfolios/p1/transactions/t1'), { side: 'buy', portfolioId: 'p1' });
    await setDoc(doc(db, 'portfolioIntelligence', 'obs1'), { portfolioId: 'p1', note: 'x' });
    await setDoc(doc(db, 'customScenarios', 'cs1'), { uid: 'alice', workspaceId: 'org1' });

    // user docs
    await setDoc(doc(db, 'users', 'alice'), { email: 'alice@x.z', orgId: 'org1' });
    await setDoc(doc(db, 'users', 'bob'), { email: 'bob@x.z', orgId: 'org1' });

    // server-only
    await setDoc(doc(db, 'providerCache', 'k1'), { v: 1 });
    await setDoc(doc(db, 'auditLogs', 'l1'), { action: 'x' });
    await setDoc(doc(db, 'workspaces/org1/apiKeys/finnhub'), { key: 'secret' });
  });
});

const alice = () => testEnv.authenticatedContext('alice').firestore();
const bob = () => testEnv.authenticatedContext('bob').firestore();
const carol = () => testEnv.authenticatedContext('carol').firestore();
const dave = () => testEnv.authenticatedContext('dave').firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

// ─── Portfolios ──────────────────────────────────────────────────────────────

test('portfolio: owner reads own, others denied', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'portfolios', 'p1')));
  await assertFails(getDoc(doc(bob(), 'portfolios', 'p1')));
  await assertFails(getDoc(doc(anon(), 'portfolios', 'p1')));
});

test('portfolio: create only for self uid', async () => {
  await assertSucceeds(setDoc(doc(bob(), 'portfolios', 'pb'), { uid: 'bob' }));
  await assertFails(setDoc(doc(bob(), 'portfolios', 'pc'), { uid: 'alice' }));
});

test('holdings: gated on parent portfolio owner', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'portfolios/p1/holdings/h1')));
  await assertFails(getDoc(doc(bob(), 'portfolios/p1/holdings/h1')));
  await assertSucceeds(setDoc(doc(alice(), 'portfolios/p1/holdings/h2'), { symbol: 'MSFT' }));
  await assertFails(setDoc(doc(bob(), 'portfolios/p1/holdings/h3'), { symbol: 'EVIL' }));
});

test('transactions: gated on parent portfolio owner', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'portfolios/p1/transactions/t1')));
  await assertFails(getDoc(doc(bob(), 'portfolios/p1/transactions/t1')));
});

test('portfolioIntelligence: gated on parent portfolio owner', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'portfolioIntelligence', 'obs1')));
  await assertFails(getDoc(doc(bob(), 'portfolioIntelligence', 'obs1')));
});

test('customScenarios: owner only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'customScenarios', 'cs1')));
  await assertFails(getDoc(doc(bob(), 'customScenarios', 'cs1')));
  await assertSucceeds(setDoc(doc(bob(), 'customScenarios', 'csb'), { uid: 'bob' }));
  await assertFails(setDoc(doc(bob(), 'customScenarios', 'csx'), { uid: 'alice' }));
});

// ─── Organizations / memberships ───────────────────────────────────────────────

test('organizations: members read, outsiders denied', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'organizations', 'org1')));
  await assertSucceeds(getDoc(doc(bob(), 'organizations', 'org1')));
  await assertFails(getDoc(doc(carol(), 'organizations', 'org1')));
});

test('organizations: create requires ownerId == self', async () => {
  await assertSucceeds(setDoc(doc(carol(), 'organizations', 'orgC'), { ownerId: 'carol' }));
  await assertFails(setDoc(doc(carol(), 'organizations', 'orgX'), { ownerId: 'alice' }));
});

test('owner fallback: owner without membership doc still has access', async () => {
  await assertSucceeds(getDoc(doc(dave(), 'organizations', 'org2')));
  await assertSucceeds(setDoc(doc(dave(), 'workspaces/org2/projects/p/artifacts/x'), { title: 't' }));
  await assertFails(getDoc(doc(carol(), 'organizations', 'org2')));
});

// REGRESSION (prod incident 2026-05-29): the WorkspaceContext owned-orgs sync
// runs a LIST query `where('ownerId','==',uid)`, not a single getDoc. A list
// rule cannot be authorised by a cross-document get(), so the prior
// canAccessOrg()/isOrgOwner() rule rejected this query for owners that lacked a
// membership doc — surfacing as "[Owned Orgs Sync Error] Missing or
// insufficient permissions". These assert the field-based list query works.
test('owned-orgs LIST query: owner WITH membership (alice) succeeds', async () => {
  const q = query(collection(alice(), 'organizations'), where('ownerId', '==', 'alice'));
  await assertSucceeds(getDocs(q));
});

test('owned-orgs LIST query: owner WITHOUT membership doc (dave) succeeds', async () => {
  // This is the exact case that 500'd in prod — owner-fallback via a list query.
  const q = query(collection(dave(), 'organizations'), where('ownerId', '==', 'dave'));
  await assertSucceeds(getDocs(q));
});

test('owned-orgs LIST query: cannot list another user\'s orgs', async () => {
  // carol may run a query scoped to her own uid (returns empty) ...
  const own = query(collection(carol(), 'organizations'), where('ownerId', '==', 'carol'));
  await assertSucceeds(getDocs(own));
  // ... but must not be able to list orgs owned by someone else.
  const foreign = query(collection(carol(), 'organizations'), where('ownerId', '==', 'alice'));
  await assertFails(getDocs(foreign));
});

test('member-orgs LIST query: by document id (in) works for a member', async () => {
  // bob is a member (not owner) of org1; WorkspaceContext fetches member orgs
  // with where('__name__','in',[…]).
  const q = query(collection(bob(), 'organizations'), where('__name__', 'in', ['org1']));
  await assertSucceeds(getDocs(q));
  // carol is in no org → the same shape must be denied.
  const qc = query(collection(carol(), 'organizations'), where('__name__', 'in', ['org1']));
  await assertFails(getDocs(qc));
});

test('memberships: own + org-scoped access, outsiders denied', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'memberships', 'alice_org1')));
  // bob is a member of org1, so may read org1 memberships
  await assertSucceeds(getDoc(doc(bob(), 'memberships', 'alice_org1')));
  // carol is in no org → denied
  await assertFails(getDoc(doc(carol(), 'memberships', 'alice_org1')));
});

test('memberships: org-scoped query works for a member', async () => {
  const q = query(collection(bob(), 'memberships'), where('orgId', '==', 'org1'));
  await assertSucceeds(getDocs(q));
  const qc = query(collection(carol(), 'memberships'), where('orgId', '==', 'org1'));
  await assertFails(getDocs(qc));
});

// ─── Sites / invites ───────────────────────────────────────────────────────────

test('sites: org members only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'sites', 's1')));
  await assertFails(getDoc(doc(carol(), 'sites', 's1')));
});

test('invites: org members only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'invites', 'i1')));
  await assertFails(getDoc(doc(carol(), 'invites', 'i1')));
});

// ─── Workspaces subtree ──────────────────────────────────────────────────────

test('workspaces artifacts: org members only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'workspaces/org1/projects/proj1/artifacts/a1')));
  await assertFails(getDoc(doc(carol(), 'workspaces/org1/projects/proj1/artifacts/a1')));
});

// ─── Server-only collections ───────────────────────────────────────────────────

test('server-only collections are never client-accessible', async () => {
  await assertFails(getDoc(doc(alice(), 'providerCache', 'k1')));
  await assertFails(getDoc(doc(alice(), 'auditLogs', 'l1')));
  await assertFails(getDoc(doc(alice(), 'workspaces/org1/apiKeys/finnhub')));
  await assertFails(setDoc(doc(alice(), 'providerCache', 'k2'), { v: 2 }));
});

// ─── Users (residual: read broad, write own-only) ──────────────────────────────

test('users: write own only, read broad (documented residual)', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users', 'alice'), { email: 'alice@x.z', orgId: 'org1' }));
  await assertFails(setDoc(doc(alice(), 'users', 'bob'), { email: 'hacked' }));
  // Read stays broad to support invite-by-email / member listing.
  await assertSucceeds(getDoc(doc(alice(), 'users', 'bob')));
});
