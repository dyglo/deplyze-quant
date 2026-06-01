import { FieldValue, db } from '../services/firestoreAdmin';
import type { EmailPreferences, EmailType } from './types';
import { hmacToken } from './config';

const DEFAULT_PREFERENCES: EmailPreferences = {
  dailyPortfolioBrief: true,
  riskRegimeAlerts: true,
  onboarding: true,
  unsubscribedAll: false,
};

export function defaultEmailPreferences(): EmailPreferences {
  return { ...DEFAULT_PREFERENCES };
}

export function preferenceFieldForType(emailType: EmailType): keyof EmailPreferences {
  if (emailType === 'daily_portfolio_brief') return 'dailyPortfolioBrief';
  if (emailType === 'risk_regime_alert') return 'riskRegimeAlerts';
  return 'onboarding';
}

export async function getEmailPreferences(uid: string): Promise<EmailPreferences> {
  const snap = await db.doc(`users/${uid}/emailPreferences/current`).get();
  if (!snap.exists) return defaultEmailPreferences();
  return { ...DEFAULT_PREFERENCES, ...(snap.data() as Partial<EmailPreferences>) };
}

export async function updateEmailPreferences(
  uid: string,
  patch: Partial<Pick<EmailPreferences, 'dailyPortfolioBrief' | 'riskRegimeAlerts' | 'onboarding' | 'unsubscribedAll'>>,
  updatedBy: string,
): Promise<EmailPreferences> {
  const ref = db.doc(`users/${uid}/emailPreferences/current`);
  const next = {
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy,
  };
  await ref.set(next, { merge: true });
  return getEmailPreferences(uid);
}

export function isOptedIn(preferences: EmailPreferences, emailType: EmailType): boolean {
  if (preferences.unsubscribedAll) return false;
  return preferences[preferenceFieldForType(emailType)] !== false;
}

export async function unsubscribeWithToken(input: {
  uid: string;
  email: string;
  scope: string;
  token: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const expected = hmacToken(input.uid, input.email, input.scope);
  if (input.token !== expected) return { ok: false, reason: 'INVALID_TOKEN' };

  const patch: Partial<EmailPreferences> = {};
  if (input.scope === 'all') {
    patch.unsubscribedAll = true;
  } else if (input.scope === 'daily_portfolio_brief') {
    patch.dailyPortfolioBrief = false;
  } else if (input.scope === 'risk_regime_alert') {
    patch.riskRegimeAlerts = false;
  } else if (input.scope === 'welcome') {
    patch.onboarding = false;
  } else {
    return { ok: false, reason: 'INVALID_SCOPE' };
  }

  await updateEmailPreferences(input.uid, patch, 'email_unsubscribe');
  await db.collection('emailPreferenceEvents').add({
    uid: input.uid,
    email: input.email.toLowerCase(),
    scope: input.scope,
    event: 'unsubscribe',
    ts: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}
