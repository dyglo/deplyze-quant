import type { Request, Response, NextFunction } from 'express';
import { FieldValue, db } from '../services/firestoreAdmin';
import { getResend } from './config';
import { updateEmailPreferences } from './preferences';

type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
    bounce?: unknown;
  };
};

type ResendTags = NonNullable<ResendWebhookEvent['data']>['tags'];

function tagValue(tags: ResendTags, key: string): string | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.find((tag) => tag.name === key)?.value;
  return tags[key];
}

function deliveryStatusForEvent(type: string): string | null {
  if (type === 'email.sent') return 'sent';
  if (type === 'email.delivered') return 'delivered';
  if (type === 'email.delivery_delayed') return 'delayed';
  if (type === 'email.bounced') return 'bounced';
  if (type === 'email.complained') return 'complained';
  if (type === 'email.failed') return 'failed';
  if (type === 'email.opened') return 'opened';
  if (type === 'email.clicked') return 'clicked';
  return null;
}

async function applyWebhookSideEffects(event: ResendWebhookEvent): Promise<void> {
  const type = event.type ?? 'unknown';
  const data = event.data ?? {};
  const emailType = tagValue(data.tags, 'email_type');
  const sendDate = tagValue(data.tags, 'send_date');
  const uid = tagValue(data.tags, 'uid');
  const status = deliveryStatusForEvent(type);

  if (uid && emailType && sendDate && status) {
    const logId = `${emailType}_${sendDate}_${uid}`.replace(/[^A-Za-z0-9_.-]/g, '_');
    await db.collection('emailDeliveryLogs').doc(logId).set({
      webhookStatus: status,
      lastWebhookType: type,
      lastWebhookAt: FieldValue.serverTimestamp(),
      resendEmailId: data.email_id ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if ((type === 'email.bounced' || type === 'email.complained') && uid) {
    await updateEmailPreferences(uid, { unsubscribedAll: true }, `resend_${type}`);
  }
}

export async function resendWebhookHandler(req: Request, res: Response, _next: NextFunction): Promise<void> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(503).json({ error: 'RESEND_WEBHOOK_SECRET not configured' });
    return;
  }

  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  const svixId = String(req.headers['svix-id'] ?? '');
  const svixTimestamp = String(req.headers['svix-timestamp'] ?? '');
  const svixSignature = String(req.headers['svix-signature'] ?? '');

  try {
    const event = getResend().webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    }) as ResendWebhookEvent;

    const eventRef = db.collection('emailWebhookEvents').doc(svixId || `${Date.now()}`);
    const already = await eventRef.get();
    if (already.exists) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    await eventRef.set({
      svixId,
      type: event.type ?? null,
      createdAt: event.created_at ?? null,
      payload: event,
      receivedAt: FieldValue.serverTimestamp(),
    });
    await applyWebhookSideEffects(event);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.warn('[ResendWebhook] verification failed', err);
    res.status(400).json({ error: 'Invalid webhook' });
  }
}
