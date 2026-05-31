import { db } from '../services/firestoreAdmin';
import { appBaseUrl, preferencesUrl, unsubscribeUrl } from './config';
import { getEmailPreferences, isOptedIn } from './preferences';
import type { EmailRecipient, EmailType, PortfolioEmailContext, RiskRegimeAlertContext, WelcomeEmailContext } from './types';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';
const ARTIFACTS_DS = process.env.BQ_DATASET_ARTIFACTS ?? 'artifacts';
const AWARENESS_TABLE = 'portfolio_awareness_synthesis';

let bq: BigQuery | null = null;

function getBQ(): BigQuery {
  if (!bq) {
    bq = new BigQuery({
      projectId: PROJECT,
      location: process.env.BIGQUERY_LOCATION ?? 'US',
    });
  }
  return bq;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function displayName(data: FirebaseFirestore.DocumentData, email: string): string {
  return asString(data.displayName) || email.split('@')[0] || 'there';
}

export async function listOptedInRecipients(emailType: EmailType): Promise<EmailRecipient[]> {
  const users = await db.collection('users').get();
  const recipients: EmailRecipient[] = [];
  for (const doc of users.docs) {
    const data = doc.data();
    const email = asString(data.email)?.toLowerCase();
    if (!email) continue;
    const preferences = await getEmailPreferences(doc.id);
    if (!isOptedIn(preferences, emailType)) continue;
    recipients.push({
      uid: doc.id,
      email,
      displayName: displayName(data, email),
      preferences,
    });
  }
  return recipients;
}

export async function recipientFromEmail(email: string, emailType: EmailType): Promise<EmailRecipient> {
  const normalized = email.trim().toLowerCase();
  const snap = await db.collection('users').where('email', '==', normalized).limit(1).get();
  if (snap.empty) {
    const uid = `internal-${Buffer.from(normalized).toString('hex').slice(0, 24)}`;
    const preferences = await getEmailPreferences(uid);
    return { uid, email: normalized, displayName: normalized.split('@')[0], preferences };
  }
  const doc = snap.docs[0];
  const data = doc.data();
  const preferences = await getEmailPreferences(doc.id);
  if (!isOptedIn(preferences, emailType)) {
    throw new Error(`${normalized} is not opted in for ${emailType}`);
  }
  return {
    uid: doc.id,
    email: normalized,
    displayName: displayName(data, normalized),
    preferences,
  };
}

async function getPrimaryPortfolio(uid: string): Promise<{ id?: string; name: string; holdings: string[]; riskProfile?: string }> {
  const snap = await db.collection('portfolios')
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .get();
  const docs = snap.docs
    .filter((doc) => doc.data().isWatchlist !== true)
    .sort((a, b) => {
      const av = a.data().updatedAt?.toMillis?.() ?? a.data().createdAt?.toMillis?.() ?? 0;
      const bv = b.data().updatedAt?.toMillis?.() ?? b.data().createdAt?.toMillis?.() ?? 0;
      return bv - av;
    });
  if (docs.length === 0) return { name: 'Primary Portfolio', holdings: [] };

  const doc = docs[0];
  const holdingsSnap = await doc.ref.collection('holdings').where('status', '!=', 'closed').get().catch(() => doc.ref.collection('holdings').get());
  const holdings = holdingsSnap.docs
    .map((h) => asString(h.data().symbol)?.toUpperCase())
    .filter((v): v is string => Boolean(v));
  return {
    id: doc.id,
    name: asString(doc.data().name) || 'Primary Portfolio',
    holdings: Array.from(new Set(holdings)),
    riskProfile: asString(doc.data().riskProfile),
  };
}

async function getWatchlistSymbols(uid: string): Promise<string[]> {
  const snap = await db.collection('intelligenceWatchlists').where('uid', '==', uid).get();
  const symbols = new Set<string>();
  for (const doc of snap.docs) {
    const raw = doc.data().symbols;
    if (Array.isArray(raw)) {
      raw.forEach((s) => {
        if (typeof s === 'string' && s.trim()) symbols.add(s.trim().toUpperCase());
      });
    }
  }
  return Array.from(symbols);
}

async function getRecentObservations(portfolioId?: string): Promise<Array<{ title: string; narrative: string; severity?: string; kind?: string }>> {
  if (!portfolioId) return [];
  const snap = await db.collection('portfolioIntelligence')
    .where('portfolioId', '==', portfolioId)
    .orderBy('createdAt', 'desc')
    .limit(8)
    .get()
    .catch(() => null);
  if (!snap) return [];
  return snap.docs.map((doc) => ({
    title: asString(doc.data().title) || 'Portfolio observation',
    narrative: asString(doc.data().narrative) || '',
    severity: asString(doc.data().severity),
    kind: asString(doc.data().kind),
  }));
}

function safeJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function lineFromRecord(record: Record<string, unknown>): string {
  const symbol = asString(record.symbol) || asString(record.ticker) || asString(record.name);
  const label = asString(record.label) || asString(record.title) || asString(record.reason) || asString(record.narrative);
  const value = typeof record.contribution === 'number'
    ? ` (${(record.contribution * 100).toFixed(1)}%)`
    : typeof record.weight === 'number'
      ? ` (${(record.weight * 100).toFixed(1)}%)`
      : '';
  return [symbol, label].filter(Boolean).join(': ') + value;
}

function linesFromUnknown(value: unknown, fallback: string[] = []): string[] {
  const parsed = safeJson(value);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return lineFromRecord(item as Record<string, unknown>);
        return '';
      })
      .filter(Boolean)
      .slice(0, 6);
  }
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, unknown>)
      .flatMap(([key, item]) => linesFromUnknown(item).map((line) => `${key}: ${line}`))
      .filter(Boolean)
      .slice(0, 6);
  }
  return fallback;
}

async function getAwarenessEmailLines(portfolioId?: string): Promise<{
  topContributors: string[];
  riskChanges: string[];
  volatilityObservations: string[];
  narrativeObservations: string[];
  summary?: string;
}> {
  if (!portfolioId) {
    return { topContributors: [], riskChanges: [], volatilityObservations: [], narrativeObservations: [] };
  }
  try {
    const [rows] = await getBQ().query({
      query: `
        SELECT
          TO_JSON_STRING(kpis) AS kpis,
          TO_JSON_STRING(contributors) AS contributors,
          TO_JSON_STRING(risk_decomposition) AS risk_decomposition,
          TO_JSON_STRING(monitor_probes) AS monitor_probes,
          TO_JSON_STRING(narrative_lines) AS narrative_lines
        FROM \`${PROJECT}.${ARTIFACTS_DS}.${AWARENESS_TABLE}\`
        WHERE portfolio_id = @portfolio_id
          AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND is_test = FALSE
        ORDER BY snapshot_date DESC, generated_at DESC
        LIMIT 1
      `,
      params: { portfolio_id: portfolioId },
      location: process.env.BIGQUERY_LOCATION ?? 'US',
      maximumBytesBilled: String(50 * 1024 * 1024),
    });
    if (!rows || rows.length === 0) {
      return { topContributors: [], riskChanges: [], volatilityObservations: [], narrativeObservations: [] };
    }
    const row = rows[0] as Record<string, unknown>;
    const kpis = safeJson(row.kpis) as Record<string, unknown> | null;
    const narrative = safeJson(row.narrative_lines);
    const narrativeLines = linesFromUnknown(narrative);
    return {
      topContributors: linesFromUnknown(row.contributors),
      riskChanges: linesFromUnknown(row.risk_decomposition),
      volatilityObservations: linesFromUnknown(row.monitor_probes).filter((line) => /vol|drawdown|correlation|stress/i.test(line)),
      narrativeObservations: narrativeLines,
      summary: asString(kpis?.summary) || asString(kpis?.headline),
    };
  } catch (err) {
    console.warn('[email] awareness synthesis unavailable for email context', err);
    return { topContributors: [], riskChanges: [], volatilityObservations: [], narrativeObservations: [] };
  }
}

export async function buildDailyContext(recipient: EmailRecipient, sendDate: string): Promise<PortfolioEmailContext> {
  const [portfolio, watchlist] = await Promise.all([
    getPrimaryPortfolio(recipient.uid),
    getWatchlistSymbols(recipient.uid),
  ]);
  const [observations, awareness] = await Promise.all([
    getRecentObservations(portfolio.id),
    getAwarenessEmailLines(portfolio.id),
  ]);
  const holdingText = portfolio.holdings.length
    ? `${portfolio.holdings.slice(0, 8).join(', ')}${portfolio.holdings.length > 8 ? ` and ${portfolio.holdings.length - 8} more` : ''}`
    : 'No active holdings have been recorded yet';
  return {
    uid: recipient.uid,
    recipientName: recipient.displayName || 'there',
    portfolioName: portfolio.name,
    portfolioId: portfolio.id,
    portfolioSummary: awareness.summary || `${portfolio.name} currently reflects ${portfolio.holdings.length} active holding${portfolio.holdings.length === 1 ? '' : 's'}. Coverage focus: ${holdingText}.`,
    topContributors: awareness.topContributors.length > 0
      ? awareness.topContributors
      : portfolio.holdings.slice(0, 5).map((symbol) => `${symbol}: included in today portfolio context for attribution review.`),
    regimeChanges: observations.filter((o) => o.kind?.includes('regime')).map((o) => `${o.title}: ${o.narrative}`).slice(0, 3),
    riskChanges: awareness.riskChanges.length > 0
      ? awareness.riskChanges
      : observations.filter((o) => o.severity === 'high' || o.severity === 'medium').map((o) => `${o.title}: ${o.narrative}`).slice(0, 4),
    volatilityObservations: awareness.volatilityObservations.length > 0
      ? awareness.volatilityObservations
      : observations.filter((o) => o.kind?.includes('volatility') || o.kind?.includes('drawdown')).map((o) => `${o.title}: ${o.narrative}`).slice(0, 3),
    narrativeObservations: awareness.narrativeObservations.length > 0
      ? awareness.narrativeObservations
      : observations.filter((o) => o.kind?.includes('narrative') || o.kind?.includes('macro')).map((o) => `${o.title}: ${o.narrative}`).slice(0, 3),
    watchlistIntelligence: watchlist.slice(0, 6).map((symbol) => `${symbol}: remains on the watchlist intelligence rail for context monitoring.`),
    aiContext: 'The brief emphasizes portfolio-aware context, regime fit, concentration, volatility, and narrative drift. It is informational and avoids directional pressure.',
    ctaUrl: `${appBaseUrl()}/portfolio`,
    unsubscribeUrl: unsubscribeUrl(recipient.uid, recipient.email, 'daily_portfolio_brief'),
    preferenceUrl: preferencesUrl(),
    generatedAt: sendDate,
  };
}

export function buildWelcomeContext(recipient: EmailRecipient): WelcomeEmailContext {
  return {
    recipientName: recipient.displayName || 'there',
    ctaUrl: appBaseUrl(),
    unsubscribeUrl: unsubscribeUrl(recipient.uid, recipient.email, 'welcome'),
    preferenceUrl: preferencesUrl(),
  };
}

export async function buildRiskRegimeAlertContext(recipient: EmailRecipient): Promise<RiskRegimeAlertContext> {
  const portfolio = await getPrimaryPortfolio(recipient.uid);
  const observations = await getRecentObservations(portfolio.id);
  const material = observations
    .filter((o) => o.severity === 'high' || o.severity === 'medium' || o.kind?.includes('regime'))
    .slice(0, 5);
  return {
    recipientName: recipient.displayName || 'there',
    portfolioName: portfolio.name,
    alertTitle: `${portfolio.name} context change detected`,
    summary: material[0]?.narrative || 'A portfolio-aware risk or regime change has been detected in the latest intelligence snapshot.',
    observations: material.map((o) => `${o.title}: ${o.narrative}`),
    ctaUrl: `${appBaseUrl()}/portfolio/risk-regime-fit`,
    unsubscribeUrl: unsubscribeUrl(recipient.uid, recipient.email, 'risk_regime_alert'),
    preferenceUrl: preferencesUrl(),
  };
}
