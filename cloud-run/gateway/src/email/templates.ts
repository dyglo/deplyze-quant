import type {
  PortfolioEmailContext,
  RenderedEmail,
  RiskRegimeAlertContext,
  WelcomeEmailContext,
} from './types';

const BRAND = 'Deplyze Quant';
const PROHIBITED_TRADING_PRESSURE = /\b(buy|sell|trading pressure|trade now|act now|urgent trade|signal to trade)\b/gi;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function neutralize(value: string): string {
  return value.replace(PROHIBITED_TRADING_PRESSURE, (match) => {
    const lower = match.toLowerCase();
    if (lower === 'buy' || lower === 'sell') return 'position';
    if (lower.includes('pressure')) return 'market pressure';
    return 'review';
  });
}

function list(items: string[]): string {
  const safe = items.length > 0 ? items : ['No material change detected in the latest snapshot.'];
  return `<ul>${safe.map((item) => `<li>${escapeHtml(neutralize(item))}</li>`).join('')}</ul>`;
}

function textList(items: string[]): string {
  const safe = items.length > 0 ? items : ['No material change detected in the latest snapshot.'];
  return safe.map((item) => `- ${neutralize(item)}`).join('\n');
}

function layout(preview: string, title: string, body: string, footer: { unsubscribeUrl: string; preferenceUrl: string }): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; background: #f6f3ef; color: #171717; font-family: Arial, Helvetica, sans-serif; }
      .preheader { display: none; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; }
      .wrap { max-width: 680px; margin: 0 auto; padding: 28px 18px; }
      .panel { background: #ffffff; border: 1px solid #ded8cf; border-radius: 8px; overflow: hidden; }
      .header { padding: 22px 24px 16px; border-bottom: 1px solid #ebe6de; }
      .brand { font-size: 12px; letter-spacing: 0; text-transform: uppercase; color: #7a4e38; font-weight: 700; }
      h1 { margin: 8px 0 0; font-size: 24px; line-height: 1.25; font-weight: 700; }
      h2 { margin: 22px 0 8px; font-size: 15px; line-height: 1.35; }
      p { margin: 10px 0; font-size: 14px; line-height: 1.65; color: #2b2b2b; }
      ul { padding-left: 20px; margin: 8px 0 0; }
      li { margin: 7px 0; font-size: 14px; line-height: 1.55; color: #2b2b2b; }
      .content { padding: 2px 24px 24px; }
      .cta { display: inline-block; margin-top: 18px; padding: 10px 14px; background: #7a4e38; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700; }
      .meta { color: #6f6a62; font-size: 12px; }
      .footer { padding: 16px 24px 22px; border-top: 1px solid #ebe6de; color: #6f6a62; font-size: 12px; line-height: 1.55; }
      .footer a { color: #7a4e38; }
    </style>
  </head>
  <body>
    <div class="preheader">${escapeHtml(neutralize(preview))}</div>
    <div class="wrap">
      <div class="panel">
        <div class="header"><div class="brand">${BRAND}</div><h1>${escapeHtml(neutralize(title))}</h1></div>
        <div class="content">${body}</div>
        <div class="footer">
          You are receiving this because portfolio intelligence emails are enabled for your Deplyze Quant account.
          <br><a href="${escapeHtml(footer.preferenceUrl)}">Manage email preferences</a> |
          <a href="${escapeHtml(footer.unsubscribeUrl)}">Unsubscribe</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function renderDailyPortfolioBrief(ctx: PortfolioEmailContext): RenderedEmail {
  const subject = `${BRAND}: Daily Portfolio Intelligence Brief - ${ctx.portfolioName}`;
  const title = 'Daily Portfolio Intelligence Brief';
  const preview = `${ctx.portfolioName}: ${ctx.portfolioSummary}`;
  const body = `
    <p class="meta">Generated ${escapeHtml(ctx.generatedAt)}</p>
    <p>${escapeHtml(neutralize(ctx.portfolioSummary))}</p>
    <h2>Top Contributors</h2>${list(ctx.topContributors)}
    <h2>Regime And Risk Changes</h2>${list([...ctx.regimeChanges, ...ctx.riskChanges])}
    <h2>Volatility And Narrative Observations</h2>${list([...ctx.volatilityObservations, ...ctx.narrativeObservations])}
    <h2>Watchlist Intelligence</h2>${list(ctx.watchlistIntelligence)}
    <h2>AI Context</h2><p>${escapeHtml(neutralize(ctx.aiContext))}</p>
    <a class="cta" href="${escapeHtml(ctx.ctaUrl)}">Open Deplyze Quant</a>
  `;
  const text = [
    title,
    '',
    `Portfolio: ${ctx.portfolioName}`,
    neutralize(ctx.portfolioSummary),
    '',
    'Top Contributors',
    textList(ctx.topContributors),
    '',
    'Regime And Risk Changes',
    textList([...ctx.regimeChanges, ...ctx.riskChanges]),
    '',
    'Volatility And Narrative Observations',
    textList([...ctx.volatilityObservations, ...ctx.narrativeObservations]),
    '',
    'Watchlist Intelligence',
    textList(ctx.watchlistIntelligence),
    '',
    'AI Context',
    neutralize(ctx.aiContext),
    '',
    `Open Deplyze Quant: ${ctx.ctaUrl}`,
    `Preferences: ${ctx.preferenceUrl}`,
    `Unsubscribe: ${ctx.unsubscribeUrl}`,
  ].join('\n');
  return { subject, html: layout(preview, title, body, ctx), text };
}

export function renderWelcome(ctx: WelcomeEmailContext): RenderedEmail {
  const title = `Welcome to ${BRAND}`;
  const body = `
    <p>Hello ${escapeHtml(ctx.recipientName)},</p>
    <p>Deplyze Quant is set up for calm, evidence-led market and portfolio intelligence. Your workspace can now connect portfolio context, watchlists, macro regimes, and research artifacts without exposing provider or email infrastructure to the browser.</p>
    <p>The platform will prioritize concise context, risk framing, and source-aware observations.</p>
    <a class="cta" href="${escapeHtml(ctx.ctaUrl)}">Open Deplyze Quant</a>
  `;
  const text = [
    title,
    '',
    `Hello ${ctx.recipientName},`,
    'Deplyze Quant is set up for calm, evidence-led market and portfolio intelligence.',
    `Open Deplyze Quant: ${ctx.ctaUrl}`,
    `Preferences: ${ctx.preferenceUrl}`,
    `Unsubscribe: ${ctx.unsubscribeUrl}`,
  ].join('\n');
  return { subject: title, html: layout('Your Deplyze Quant intelligence workspace is ready.', title, body, ctx), text };
}

export function renderRiskRegimeAlert(ctx: RiskRegimeAlertContext): RenderedEmail {
  const title = 'Portfolio Risk And Regime Alert';
  const body = `
    <p>Hello ${escapeHtml(ctx.recipientName)},</p>
    <p><strong>${escapeHtml(neutralize(ctx.alertTitle))}</strong></p>
    <p>${escapeHtml(neutralize(ctx.summary))}</p>
    <h2>Observed Changes</h2>${list(ctx.observations)}
    <p class="meta">This alert is informational and reflects model and data context available at generation time.</p>
    <a class="cta" href="${escapeHtml(ctx.ctaUrl)}">Review In Deplyze Quant</a>
  `;
  const text = [
    title,
    '',
    ctx.alertTitle,
    neutralize(ctx.summary),
    '',
    'Observed Changes',
    textList(ctx.observations),
    '',
    `Review in Deplyze Quant: ${ctx.ctaUrl}`,
    `Preferences: ${ctx.preferenceUrl}`,
    `Unsubscribe: ${ctx.unsubscribeUrl}`,
  ].join('\n');
  return { subject: `${BRAND}: ${ctx.alertTitle}`, html: layout(ctx.summary, title, body, ctx), text };
}
