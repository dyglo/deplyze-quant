import { gatewayGet, gatewayPatch } from './gatewayClient';

export interface EmailPreferences {
  dailyPortfolioBrief: boolean;
  riskRegimeAlerts: boolean;
  onboarding: boolean;
  unsubscribedAll: boolean;
}

export async function fetchEmailPreferences(): Promise<EmailPreferences> {
  const res = await gatewayGet<{ preferences: EmailPreferences }>('/email/preferences', undefined, 60_000);
  return res.preferences;
}

export async function updateEmailPreferences(
  patch: Partial<EmailPreferences>,
): Promise<EmailPreferences> {
  const res = await gatewayPatch<{ preferences: EmailPreferences }>('/email/preferences', patch);
  return res.preferences;
}
