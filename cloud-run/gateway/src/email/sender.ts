import crypto from 'crypto';
import type { CreateBatchOptions } from 'resend';
import { FieldValue, db } from '../services/firestoreAdmin';
import { EMAIL_BATCH_LIMIT, emailFrom, getResend, replyTo } from './config';
import { buildDailyContext, buildRiskRegimeAlertContext, buildWelcomeContext } from './recipients';
import { renderDailyPortfolioBrief, renderRiskRegimeAlert, renderWelcome } from './templates';
import type { EmailDeliveryClaim, EmailRecipient, EmailType, RenderedEmail } from './types';

function deliveryLogId(uid: string, emailType: EmailType, sendDate: string): string {
  return `${emailType}_${sendDate}_${uid}`.replace(/[^A-Za-z0-9_.-]/g, '_');
}

function payloadHash(rendered: RenderedEmail): string {
  return crypto.createHash('sha256').update(`${rendered.subject}\n${rendered.text}`).digest('hex');
}

async function renderForRecipient(recipient: EmailRecipient, emailType: EmailType, sendDate: string): Promise<RenderedEmail> {
  if (emailType === 'daily_portfolio_brief') {
    return renderDailyPortfolioBrief(await buildDailyContext(recipient, sendDate));
  }
  if (emailType === 'risk_regime_alert') {
    return renderRiskRegimeAlert(await buildRiskRegimeAlertContext(recipient));
  }
  return renderWelcome(buildWelcomeContext(recipient));
}

async function claimDelivery(recipient: EmailRecipient, emailType: EmailType, sendDate: string, rendered: RenderedEmail): Promise<EmailDeliveryClaim | null> {
  const logId = deliveryLogId(recipient.uid, emailType, sendDate);
  const ref = db.collection('emailDeliveryLogs').doc(logId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const status = snap.data()?.status;
      if (status === 'sent' || status === 'pending') return null;
    }
    tx.set(ref, {
      uid: recipient.uid,
      email: recipient.email,
      emailType,
      sendDate,
      status: 'pending',
      attemptCount: FieldValue.increment(1),
      payloadHash: payloadHash(rendered),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: snap.exists ? snap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      logId,
      uid: recipient.uid,
      email: recipient.email,
      emailType,
      sendDate,
      status: 'pending',
    };
  });
}

async function markSent(claims: EmailDeliveryClaim[], resendIds: string[], batchId: string): Promise<void> {
  const batch = db.batch();
  claims.forEach((claim, index) => {
    batch.set(db.collection('emailDeliveryLogs').doc(claim.logId), {
      status: 'sent',
      resendEmailId: resendIds[index] ?? null,
      batchId,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

async function markFailed(claims: EmailDeliveryClaim[], error: unknown, nextRetryAt: Date): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const batch = db.batch();
  claims.forEach((claim) => {
    batch.set(db.collection('emailDeliveryLogs').doc(claim.logId), {
      status: 'failed',
      lastError: message.slice(0, 1000),
      nextRetryAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendBatchInput {
  recipients: EmailRecipient[];
  emailType: EmailType;
  sendDate: string;
  dryRun?: boolean;
  batchDelayMs?: number;
}

export async function sendControlledEmailBatch(input: SendBatchInput): Promise<{
  attempted: number;
  claimed: number;
  sent: number;
  skipped: number;
  batches: number;
  dryRun: boolean;
}> {
  const batchDelayMs = input.batchDelayMs ?? Number(process.env.EMAIL_BATCH_DELAY_MS ?? 1200);
  let attempted = 0;
  let claimedCount = 0;
  let sent = 0;
  let skipped = 0;
  let batches = 0;

  for (let i = 0; i < input.recipients.length; i += EMAIL_BATCH_LIMIT) {
    const slice = input.recipients.slice(i, i + EMAIL_BATCH_LIMIT);
    const claims: EmailDeliveryClaim[] = [];
    const payload: CreateBatchOptions = [];

    for (const recipient of slice) {
      attempted += 1;
      const rendered = await renderForRecipient(recipient, input.emailType, input.sendDate);
      const claim = await claimDelivery(recipient, input.emailType, input.sendDate, rendered);
      if (!claim) {
        skipped += 1;
        continue;
      }
      claims.push(claim);
      claimedCount += 1;
      payload.push({
        from: emailFrom(),
        to: [recipient.email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: replyTo(),
        tags: [
          { name: 'email_type', value: input.emailType },
          { name: 'send_date', value: input.sendDate },
          { name: 'uid', value: recipient.uid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) },
        ],
      });
    }

    if (payload.length === 0) continue;
    batches += 1;
    const batchId = `${input.emailType}-${input.sendDate}-${Math.floor(i / EMAIL_BATCH_LIMIT) + 1}`;

    if (input.dryRun) {
      await markFailed(claims, new Error('dry-run: not sent'), new Date(Date.now() + 5 * 60_000));
      continue;
    }

    try {
      const result = await getResend().batch.send(payload, {
        idempotencyKey: batchId,
        batchValidation: 'strict',
      });
      if (result.error) throw new Error(`${result.error.name}: ${result.error.message}`);
      await markSent(claims, result.data.data.map((item) => item.id), batchId);
      sent += result.data.data.length;
    } catch (err) {
      await markFailed(claims, err, new Date(Date.now() + 15 * 60_000));
      throw err;
    }

    if (i + EMAIL_BATCH_LIMIT < input.recipients.length) await sleep(batchDelayMs);
  }

  return { attempted, claimed: claimedCount, sent, skipped, batches, dryRun: Boolean(input.dryRun) };
}
