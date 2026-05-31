import crypto from 'crypto';
import { Resend } from 'resend';

export const EMAIL_BATCH_LIMIT = 100;

let resendClient: Resend | null = null;

export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is required for email sending');
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export function emailFrom(): string {
  return process.env.RESEND_FROM_EMAIL || 'Deplyze Quant <intelligence@deplyze.com>';
}

export function replyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO || undefined;
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://app.deplyze.com').replace(/\/+$/, '');
}

export function gatewayBaseUrl(): string {
  return (process.env.GATEWAY_PUBLIC_URL || appBaseUrl()).replace(/\/+$/, '');
}

export function unsubscribeSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('EMAIL_UNSUBSCRIBE_SECRET is required for unsubscribe links');
  return secret;
}

export function internalTestEmails(): string[] {
  return (process.env.INTERNAL_TEST_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function hmacToken(uid: string, email: string, scope: string): string {
  return crypto
    .createHmac('sha256', unsubscribeSecret())
    .update(`${uid}|${email.toLowerCase()}|${scope}`)
    .digest('hex');
}

export function unsubscribeUrl(uid: string, email: string, scope: string): string {
  const base = gatewayBaseUrl();
  const token = hmacToken(uid, email, scope);
  const qs = new URLSearchParams({ uid, email, scope, token });
  return `${base}/email/unsubscribe?${qs.toString()}`;
}

export function preferencesUrl(): string {
  return `${appBaseUrl()}/settings`;
}
