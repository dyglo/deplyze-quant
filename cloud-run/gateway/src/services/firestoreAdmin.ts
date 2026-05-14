/**
 * firestoreAdmin.ts — Server-side Firestore access for the Quant Gateway.
 *
 * Schema:
 *   workspaces/{wid}/projects/{pid}/artifacts/{artifactId}
 *   workspaces/{wid}/projects/{pid}/briefings/{briefingId}
 *   workspaces/{wid}/projects/{pid}/watchlists/{watchlistId}
 *   workspaces/{wid}/projects/{pid}/agentRuns/{runId}
 *   workspaces/{wid}/apiKeys/{provider}        ← server-only
 *   providerCache/{cacheKey}                    ← server-only
 *   auditLogs/{logId}
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';

if (getApps().length === 0) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

export const db = getFirestore();

export const paths = {
  workspace: (wid: string) => `workspaces/${wid}`,
  project: (wid: string, pid: string) => `workspaces/${wid}/projects/${pid}`,
  artifacts: (wid: string, pid: string) => `workspaces/${wid}/projects/${pid}/artifacts`,
  briefings: (wid: string, pid: string) => `workspaces/${wid}/projects/${pid}/briefings`,
  watchlists: (wid: string, pid: string) => `workspaces/${wid}/projects/${pid}/watchlists`,
  agentRuns: (wid: string, pid: string) => `workspaces/${wid}/projects/${pid}/agentRuns`,
  apiKeys: (wid: string) => `workspaces/${wid}/apiKeys`,
};

export { FieldValue };

export async function writeArtifact(
  wid: string,
  pid: string,
  data: Record<string, unknown>,
): Promise<string> {
  const ref = await db.collection(paths.artifacts(wid, pid)).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function writeBriefing(
  wid: string,
  pid: string,
  data: Record<string, unknown>,
): Promise<string> {
  const ref = await db.collection(paths.briefings(wid, pid)).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function appendAuditLog(
  uid: string,
  action: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await db.collection('auditLogs').add({
    uid,
    action,
    meta,
    ts: FieldValue.serverTimestamp(),
  });
}
