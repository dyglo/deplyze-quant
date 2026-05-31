import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { EmailType } from '../email/types';

function loadLocalEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env.local'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((v) => v.startsWith(prefix))?.slice(prefix.length);
}

function has(flag: string): boolean {
  return process.argv.includes(`--${flag}`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function verifyRecentWebhooks(): Promise<void> {
  const { db } = await import('../services/firestoreAdmin');
  const { getResend } = await import('../email/config');
  const since = Date.now() - 24 * 60 * 60_000;
  const logs = await db.collection('emailDeliveryLogs')
    .where('updatedAt', '>=', new Date(since))
    .limit(20)
    .get()
    .catch(() => null);
  const webhooks = await db.collection('emailWebhookEvents')
    .limit(20)
    .get()
    .catch(() => null);
  let resendLogs: { count: number; statuses: number[]; error?: string };
  try {
    const result = await getResend().logs.list({ limit: 20 });
    resendLogs = result.error
      ? { count: 0, statuses: [], error: result.error.message }
      : { count: result.data.data.length, statuses: result.data.data.map((log) => log.response_status) };
  } catch (err) {
    resendLogs = { count: 0, statuses: [], error: err instanceof Error ? err.message : String(err) };
  }

  console.log(JSON.stringify({
    recentDeliveryLogs: logs?.size ?? 0,
    recentWebhookEvents: webhooks?.size ?? 0,
    resendLogs,
    note: 'Confirm sent/delivered/bounced status in Resend dashboard before controlled batch.',
  }, null, 2));
}

async function main(): Promise<void> {
  loadLocalEnv();
  if (getApps().length === 0) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

  const mode = arg('mode') || 'test';
  const emailType = (arg('email-type') || 'daily_portfolio_brief') as EmailType;
  const sendDate = arg('date') || today();
  const dryRun = has('dry-run') || !has('send');
  const { internalTestEmails } = await import('../email/config');
  const { listOptedInRecipients, recipientFromEmail } = await import('../email/recipients');
  const { sendControlledEmailBatch } = await import('../email/sender');

  if (mode === 'verify-webhooks') {
    await verifyRecentWebhooks();
    return;
  }

  if (mode === 'test') {
    const emails = (arg('to')?.split(',').map((v) => v.trim()).filter(Boolean) ?? internalTestEmails());
    if (emails.length === 0) throw new Error('Provide --to=a@b.com or INTERNAL_TEST_EMAILS');
    const recipients = [];
    for (const email of emails) recipients.push(await recipientFromEmail(email, emailType));
    const result = await sendControlledEmailBatch({ recipients, emailType, sendDate, dryRun });
    console.log(JSON.stringify({ mode, emailType, sendDate, recipients: recipients.length, ...result }, null, 2));
    return;
  }

  if (mode === 'batch') {
    if (process.env.EMAIL_BATCH_ENABLE !== 'true') {
      throw new Error('Set EMAIL_BATCH_ENABLE=true for controlled opted-in batch sends');
    }
    if (!dryRun && arg('confirm') !== 'SEND_OPTED_IN_BATCH') {
      throw new Error('Live batch requires --send --confirm=SEND_OPTED_IN_BATCH');
    }
    const recipients = await listOptedInRecipients(emailType);
    const result = await sendControlledEmailBatch({ recipients, emailType, sendDate, dryRun });
    console.log(JSON.stringify({ mode, emailType, sendDate, recipients: recipients.length, ...result }, null, 2));
    return;
  }

  throw new Error(`Unknown --mode=${mode}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
