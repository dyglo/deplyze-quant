/**
 * Cloud Functions — Deplyze Quant.
 *
 * Phase 1 stubs:
 *   generateDailyMacroBrief  — scheduled placeholder (no-op).
 *                              Real implementation lands in Phase 5 when the
 *                              Macro Agent is built.
 *   onArtifactCreated        — Firestore trigger placeholder for downstream
 *                              fan-out (notifications, BigQuery export).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

export const generateDailyMacroBrief = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
  },
  async (_event) => {
    logger.info('[generateDailyMacroBrief] scheduled tick — implementation deferred to Macro Agent (Phase 5).');
  },
);

export const onArtifactCreated = onDocumentCreated(
  {
    document: 'workspaces/{wid}/projects/{pid}/artifacts/{artifactId}',
    region: 'us-central1',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    logger.info('[onArtifactCreated] artifact %s in %s/%s', event.params.artifactId, event.params.wid, event.params.pid, {
      category: data.category,
      confidence: data.confidence,
    });
    // Phase 5: fan-out (notifications, BigQuery export, dependent agent triggers).
  },
);
