export type EmailType = 'daily_portfolio_brief' | 'welcome' | 'risk_regime_alert';

export interface EmailPreferences {
  dailyPortfolioBrief: boolean;
  riskRegimeAlerts: boolean;
  onboarding: boolean;
  unsubscribedAll: boolean;
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface EmailRecipient {
  uid: string;
  email: string;
  displayName?: string;
  preferences: EmailPreferences;
}

export interface PortfolioEmailContext {
  uid: string;
  recipientName: string;
  portfolioName: string;
  portfolioId?: string;
  portfolioSummary: string;
  topContributors: string[];
  regimeChanges: string[];
  riskChanges: string[];
  volatilityObservations: string[];
  narrativeObservations: string[];
  watchlistIntelligence: string[];
  aiContext: string;
  ctaUrl: string;
  unsubscribeUrl: string;
  preferenceUrl: string;
  generatedAt: string;
}

export interface WelcomeEmailContext {
  recipientName: string;
  ctaUrl: string;
  unsubscribeUrl: string;
  preferenceUrl: string;
}

export interface RiskRegimeAlertContext {
  recipientName: string;
  portfolioName: string;
  alertTitle: string;
  summary: string;
  observations: string[];
  ctaUrl: string;
  unsubscribeUrl: string;
  preferenceUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailDeliveryClaim {
  logId: string;
  uid: string;
  email: string;
  emailType: EmailType;
  sendDate: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
}
