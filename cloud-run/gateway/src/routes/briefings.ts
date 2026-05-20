/**
 * /v1/briefings — on-demand briefing generation.
 *
 * The gateway is the only place with provider API keys, so all data-gathering
 * happens here. Each kind decides what evidence to collect, calls Gemini to
 * synthesise a structured briefing, and persists the result via firebase-admin
 * (Firestore rules bypassed).
 *
 * Kinds (V1):
 *   daily-pulse        — top movers + headlines snapshot
 *   daily-macro        — Fed funds / CPI / DGS10 / DGS2 / UNEMP / GDP latest values
 *   instrument-snapshot — single instrument deep dive (params.symbol required)
 *   cross-asset        — correlation snapshot for a macro-core universe
 *   sentiment          — Tavily/Serper/Finnhub headline-mood proxy
 */

import { Router } from 'express';
import { z } from 'zod';
import * as finnhub from '../providers/finnhub';
import * as td from '../providers/twelvedata';
import * as av from '../providers/alphavantage';
import * as serper from '../providers/serper';
import * as tavily from '../providers/tavily';
import { withCache, TTL } from '../services/cache';
import { geminiGenerate, SYSTEM_PROMPTS } from '../services/gemini';
import { writeBriefing } from '../services/firestoreAdmin';

const router = Router();

const BriefingKind = z.enum([
  'daily-pulse',
  'daily-macro',
  'instrument-snapshot',
  'cross-asset',
  'sentiment',
  'weekly-regime',
  'volatility',
  'market-stress',
  'earnings',
  'sector-rotation',
  'positioning',
  'risk',
  'trade-thesis',
]);

const Body = z.object({
  kind: BriefingKind,
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  params: z.object({
    symbol: z.string().optional(),
    symbols: z.array(z.string()).optional(),
    query: z.string().optional(),
  }).optional(),
});

interface BriefingDraft {
  title: string;
  summary: string;
  body: string;
  highlights: string[];
  symbols: string[];
  evidenceLines: string[];
  /** Number of distinct sources backing the brief (data freshness/coverage). */
  sourceCoverage: number;
  /** 0..1 — share of the planned evidence we were able to gather. */
  dataCompleteness: number;
}

const KIND_TITLES: Record<z.infer<typeof BriefingKind>, string> = {
  'daily-pulse':         'Daily Market Pulse Brief',
  'daily-macro':         'Macro Context Brief',
  'instrument-snapshot': 'Instrument Snapshot Brief',
  'cross-asset':         'Cross-Asset Relationship Brief',
  'sentiment':           'Sentiment Brief',
  'weekly-regime':       'Weekly Regime Report',
  'volatility':          'Volatility Intelligence Brief',
  'market-stress':       'Market Stress Report',
  'earnings':            'Earnings Intelligence Brief',
  'sector-rotation':     'Sector Rotation Brief',
  'positioning':         'Positioning Report',
  'risk':                'Risk Environment Brief',
  'trade-thesis':        'Trade Thesis Brief',
};

const DEFAULT_PULSE_SYMBOLS = ['SPY', 'QQQ', 'GLD', 'TLT', 'UUP', 'BTC/USD'];
const DEFAULT_XASSET_SYMBOLS = ['SPY', 'QQQ', 'GLD', 'TLT'];
const MACRO_SERIES_IDS = ['FEDFUNDS', 'CPI', 'DGS10', 'DGS2', 'UNEMP', 'GDP'] as const;

async function gatherDailyPulse(): Promise<BriefingDraft> {
  const quotes = await Promise.all(
    DEFAULT_PULSE_SYMBOLS.map(async (sym) => {
      try {
        const q = await withCache(`quote:twelve_data:${sym}`, TTL.quote, () => td.getQuote(sym));
        return { sym, ok: true as const, q };
      } catch (e) {
        return { sym, ok: false as const, error: (e as Error).message };
      }
    }),
  );
  const headlines = await withCache(`serper:news:markets`, TTL.news, () =>
    serper.searchNews('global markets macro central bank', 8),
  );

  const ok = quotes.filter((x) => x.ok) as Array<{ sym: string; ok: true; q: { price: number; changePercent: number } }>;
  const ranked = [...ok].sort((a, b) => Math.abs(b.q.changePercent) - Math.abs(a.q.changePercent));
  const evidenceLines = [
    'Top movers (abs % change today):',
    ...ranked.map((r) => `  - ${r.sym}: ${r.q.price.toFixed(2)} (${r.q.changePercent >= 0 ? '+' : ''}${r.q.changePercent.toFixed(2)}%)`),
    '',
    'Recent headlines:',
    ...headlines.slice(0, 6).map((h) => `  - [${h.source}] ${h.title}`),
  ];
  const sources = new Set<string>([
    'twelve_data',
    ...headlines.map((h) => h.source).filter(Boolean),
  ]);
  return {
    title: KIND_TITLES['daily-pulse'],
    summary: '',
    body: '',
    highlights: ranked.slice(0, 3).map((r) => `${r.sym} ${r.q.changePercent >= 0 ? '+' : ''}${r.q.changePercent.toFixed(2)}%`),
    symbols: DEFAULT_PULSE_SYMBOLS,
    evidenceLines,
    sourceCoverage: sources.size,
    dataCompleteness: ok.length / DEFAULT_PULSE_SYMBOLS.length,
  };
}

async function gatherMacro(): Promise<BriefingDraft> {
  const series = await Promise.all(
    MACRO_SERIES_IDS.map(async (id) => {
      try {
        const s = await withCache(`av:macro:${id}`, TTL.macro_series, () => av.getMacroSeries(id));
        const pts = s.points ?? [];
        const last = pts[pts.length - 1] ?? null;
        const prev = pts[pts.length - 2] ?? null;
        return { id, name: s.name, unit: s.unit, last, prev, ok: true as const };
      } catch (e) {
        return { id, ok: false as const, error: (e as Error).message };
      }
    }),
  );

  const got = series.filter((x) => x.ok) as Array<{ id: string; name: string; unit: string; last: { ts: number; value: number } | null; prev: { ts: number; value: number } | null; ok: true }>;
  const evidenceLines = [
    'Latest macro values (Alpha Vantage):',
    ...got.map((s) => {
      const v = s.last?.value;
      const delta = s.last && s.prev ? (s.last.value - s.prev.value) : null;
      const dateStr = s.last ? new Date(s.last.ts).toISOString().slice(0, 10) : '—';
      return `  - ${s.name} (${s.id}): ${v != null ? v : '—'}${s.unit ? ` ${s.unit}` : ''} on ${dateStr}${delta != null ? ` (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})` : ''}`;
    }),
  ];
  return {
    title: KIND_TITLES['daily-macro'],
    summary: '',
    body: '',
    highlights: got.slice(0, 3).map((s) => `${s.id}: ${s.last?.value ?? '—'}${s.unit ?? ''}`),
    symbols: [],
    evidenceLines,
    sourceCoverage: 1,
    dataCompleteness: got.length / MACRO_SERIES_IDS.length,
  };
}

async function gatherInstrumentSnapshot(symbol: string): Promise<BriefingDraft> {
  const upper = symbol.toUpperCase();
  const today = new Date();
  const past = new Date(today.getTime() - 14 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [quoteR, barsR, profileR, newsR] = await Promise.allSettled([
    withCache(`quote:twelve_data:${upper}`, TTL.quote, () => td.getQuote(upper)),
    withCache(`ohlcv:${upper}:1day:60`, TTL.ohlcv_daily, () => td.getTimeSeries(upper, '1day', 60)),
    withCache(`finnhub:profile:${upper}`, TTL.synthesis, () => finnhub.getCompanyProfile(upper)),
    withCache(`news:symbol:${upper}`, TTL.news, () => finnhub.getCompanyNews(upper, fmt(past), fmt(today))),
  ]);
  const get = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
  const q = get(quoteR);
  const bars = get(barsR) ?? [];
  const profile = get(profileR);
  const news = (get(newsR) ?? []).slice(0, 6);

  if (!q) throw new Error(`No quote available for ${upper}`);

  const last20 = bars.slice(-20).map((b) => b.close);
  const ret20 = last20.length > 1 ? ((last20[last20.length - 1] / last20[0] - 1) * 100) : 0;
  const lr = last20.length > 1
    ? last20.slice(1).map((c, i) => Math.log(c / last20[i]))
    : [];
  const annVol = lr.length > 1
    ? Math.sqrt(lr.reduce((a, b) => a + b * b, 0) / (lr.length - 1)) * Math.sqrt(252) * 100
    : 0;

  const evidenceLines = [
    `Symbol: ${upper}`,
    `Last price: ${q.price} (${q.changePercent.toFixed(2)}% today, source: twelve_data)`,
    `20-day return: ${ret20.toFixed(2)}%`,
    `Annualised 20-day vol: ${annVol.toFixed(1)}%`,
    profile?.finnhubIndustry ? `Industry: ${profile.finnhubIndustry}` : '',
    profile?.marketCapitalization ? `Market cap: ${profile.marketCapitalization}` : '',
    '',
    'Recent headlines (Finnhub):',
    ...news.map((n) => `  - ${n.headline}`),
  ].filter(Boolean);

  const sources = new Set<string>(['twelve_data']);
  if (profile) sources.add('finnhub');
  if (news.length) sources.add('finnhub_news');
  const planned = 4;
  const got = [q, bars.length, profile, news.length].filter(Boolean).length;

  return {
    title: `${KIND_TITLES['instrument-snapshot']}: ${upper}`,
    summary: '',
    body: '',
    highlights: [
      `${upper}: ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% today`,
      `20d return: ${ret20.toFixed(2)}%`,
      `20d ann. vol: ${annVol.toFixed(1)}%`,
    ],
    symbols: [upper],
    evidenceLines,
    sourceCoverage: sources.size,
    dataCompleteness: got / planned,
  };
}

async function gatherCrossAsset(symbols: string[]): Promise<BriefingDraft> {
  const universe = symbols.length ? symbols : DEFAULT_XASSET_SYMBOLS;
  const all = await Promise.all(
    universe.map(async (sym) => {
      try {
        const bars = await withCache(`ohlcv:${sym.toUpperCase()}:1day:120`, TTL.ohlcv_daily, () =>
          td.getTimeSeries(sym.toUpperCase(), '1day', 120),
        );
        return { sym, bars };
      } catch (e) {
        return { sym, bars: [] as Array<{ ts: number; close: number }>, error: (e as Error).message };
      }
    }),
  );
  const lr = new Map<string, number[]>();
  for (const r of all) {
    const cls = r.bars.map((b) => b.close);
    const out: number[] = [];
    for (let i = 1; i < cls.length; i++) {
      const a = cls[i - 1], b = cls[i];
      if (a > 0 && b > 0) out.push(Math.log(b / a));
    }
    lr.set(r.sym, out.slice(-60));
  }
  const pairs: Array<{ a: string; b: string; r: number }> = [];
  for (let i = 0; i < universe.length; i++) {
    for (let j = i + 1; j < universe.length; j++) {
      const xa = lr.get(universe[i]) ?? [];
      const xb = lr.get(universe[j]) ?? [];
      const n = Math.min(xa.length, xb.length);
      if (n < 20) continue;
      const a = xa.slice(-n), b = xb.slice(-n);
      const ma = a.reduce((s, v) => s + v, 0) / n;
      const mb = b.reduce((s, v) => s + v, 0) / n;
      let num = 0, dx = 0, dy = 0;
      for (let k = 0; k < n; k++) {
        const da = a[k] - ma, db = b[k] - mb;
        num += da * db; dx += da * da; dy += db * db;
      }
      const denom = Math.sqrt(dx * dy);
      pairs.push({ a: universe[i], b: universe[j], r: denom === 0 ? 0 : num / denom });
    }
  }
  const ranked = pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  const evidenceLines = [
    `Universe: ${universe.join(', ')}`,
    `60-day log-return correlations:`,
    ...ranked.map((p) => `  - ${p.a} ↔ ${p.b}: ρ = ${p.r.toFixed(2)}`),
  ];
  return {
    title: KIND_TITLES['cross-asset'],
    summary: '',
    body: '',
    highlights: ranked.slice(0, 3).map((p) => `${p.a}/${p.b}: ${p.r.toFixed(2)}`),
    symbols: universe,
    evidenceLines,
    sourceCoverage: 1,
    dataCompleteness: pairs.length / Math.max(1, (universe.length * (universe.length - 1)) / 2),
  };
}

async function gatherSentiment(query?: string): Promise<BriefingDraft> {
  const q = query?.trim() || 'global markets sentiment risk-on risk-off';
  const [tavilyRes, serperRes] = await Promise.allSettled([
    withCache(`tavily:basic:finance:7:${q.toLowerCase()}`, TTL.web_search, () =>
      tavily.search(q, { topic: 'finance', days: 7, searchDepth: 'basic', includeAnswer: true }),
    ),
    withCache(`serper:news:${q.toLowerCase()}`, TTL.news, () => serper.searchNews(q, 12)),
  ]);
  const tav = tavilyRes.status === 'fulfilled' ? tavilyRes.value : null;
  const ser = serperRes.status === 'fulfilled' ? serperRes.value : [];

  const headlines = [
    ...(tav?.results?.slice(0, 6).map((r) => `[tavily/${new URL(r.url).hostname}] ${r.title}`) ?? []),
    ...ser.slice(0, 6).map((h) => `[serper/${h.source}] ${h.title}`),
  ];
  const sources = new Set<string>();
  for (const r of tav?.results ?? []) sources.add(new URL(r.url).hostname);
  for (const h of ser) if (h.source) sources.add(h.source);

  const evidenceLines = [
    `Sentiment query: "${q}"`,
    tav?.answer ? `Tavily synthesis: ${tav.answer}` : '',
    'Headlines:',
    ...headlines.map((h) => `  - ${h}`),
  ].filter(Boolean);

  return {
    title: KIND_TITLES['sentiment'],
    summary: '',
    body: '',
    highlights: headlines.slice(0, 3),
    symbols: [],
    evidenceLines,
    sourceCoverage: sources.size,
    dataCompleteness: headlines.length > 0 ? Math.min(1, headlines.length / 8) : 0,
  };
}

function buildPrompt(kind: z.infer<typeof BriefingKind>, draft: BriefingDraft): string {
  const sectionGuide = {
    'daily-pulse':         'Sections: ## Market Pulse, ## Notable Moves, ## Catalysts, ## Probabilistic Read.',
    'daily-macro':         'Sections: ## Regime Read, ## Yield Curve, ## Inflation/Growth Tilt, ## Risks.',
    'instrument-snapshot': 'Sections: ## Quote, ## Directional Bias, ## Volatility Profile, ## Catalysts, ## Risks.',
    'cross-asset':         'Sections: ## Universe, ## Notable Pairs, ## Breakdowns vs Historical, ## Implications.',
    'sentiment':           'Sections: ## Tone, ## Dominant Themes, ## Source Mix, ## Caveats.',
    'weekly-regime':       'Sections: ## Macro Regime, ## Asset Allocation, ## Leading Indicators, ## Risks.',
    'volatility':          'Sections: ## Volatility Regime, ## Realised vs Implied, ## Term Structure, ## Risk Events.',
    'market-stress':       'Sections: ## Stress Indicators, ## Spreads & Liquidity, ## Credit/Funding Stress, ## Implications.',
    'earnings':            'Sections: ## Earnings Calendar, ## Consensus Beats/Misses, ## Guidance Shifts, ## Investment Context.',
    'sector-rotation':     'Sections: ## Sector Performance, ## Relative Momentum, ## Flow Dynamics, ## Strategy Implications.',
    'positioning':         'Sections: ## Speculative Positioning, ## Sentiment Shifts, ## Flow of Funds, ## Contrarian Signals.',
    'risk':                'Sections: ## Tail Risks, ## Drawdown Watch, ## Correlation Shifts, ## Hedging Actions.',
    'trade-thesis':        'Sections: ## Investment Thesis, ## Catalysts, ## Valuation & Timing, ## Risks & Mitigants.',
  }[kind];

  return [
    `Briefing kind: ${kind}`,
    `Produce a concise institutional briefing in GitHub-flavoured Markdown.`,
    sectionGuide,
    `Style: probabilistic, calm, no financial advice, no buy/sell instructions, cite metric values inline.`,
    `Begin with a single-line **Summary:** sentence (no header). Then the markdown sections above.`,
    `Cap total length at ~350 words.`,
    '',
    'EVIDENCE:',
    ...draft.evidenceLines,
  ].join('\n');
}

router.post('/generate', async (req, res, next) => {
  try {
    const body = Body.parse(req.body);

    let draft: BriefingDraft;
    switch (body.kind) {
      case 'daily-pulse':          draft = await gatherDailyPulse(); break;
      case 'daily-macro':          draft = await gatherMacro(); break;
      case 'instrument-snapshot': {
        const sym = body.params?.symbol;
        if (!sym) { res.status(400).json({ error: 'params.symbol required for instrument-snapshot' }); return; }
        draft = await gatherInstrumentSnapshot(sym);
        break;
      }
      case 'cross-asset':          draft = await gatherCrossAsset(body.params?.symbols ?? []); break;
      case 'sentiment':            draft = await gatherSentiment(body.params?.query); break;

      case 'earnings':
      case 'trade-thesis': {
        const sym = body.params?.symbol;
        if (!sym) { res.status(400).json({ error: `params.symbol required for ${body.kind}` }); return; }
        draft = await gatherInstrumentSnapshot(sym);
        draft.title = `${KIND_TITLES[body.kind]}: ${sym.toUpperCase()}`;
        break;
      }

      case 'weekly-regime':
      case 'volatility':
      case 'market-stress':
      case 'sector-rotation':
      case 'positioning':
      case 'risk': {
        const macroDraft = await gatherMacro();
        const sentimentDraft = await gatherSentiment(body.params?.query ?? `market ${body.kind}`);
        draft = {
          title: KIND_TITLES[body.kind],
          summary: '',
          body: '',
          highlights: [...macroDraft.highlights.slice(0, 2), ...sentimentDraft.highlights.slice(0, 1)],
          symbols: [],
          evidenceLines: [
            ...macroDraft.evidenceLines,
            '',
            ...sentimentDraft.evidenceLines,
          ],
          sourceCoverage: macroDraft.sourceCoverage + sentimentDraft.sourceCoverage,
          dataCompleteness: (macroDraft.dataCompleteness + sentimentDraft.dataCompleteness) / 2,
        };
        break;
      }
    }

    const prompt = buildPrompt(body.kind, draft);
    const markdown = await geminiGenerate({
      systemInstruction: SYSTEM_PROMPTS.intelligenceSynthesizer,
      prompt,
      temperature: 0.3,
    });

    // Extract a 1-sentence summary line from the first line of the markdown.
    const firstLine = markdown.split('\n').find((l) => l.trim().length > 0) ?? '';
    const summary = firstLine.replace(/^\*\*Summary:?\*\*\s*/i, '').replace(/^Summary:\s*/i, '').trim();

    const briefing = {
      workspaceId: body.workspaceId,
      projectId: body.projectId,
      kind: body.kind,
      title: draft.title,
      summary,
      body: markdown,
      highlights: draft.highlights,
      symbols: draft.symbols,
      source: 'manual' as const,
      sourceCoverage: draft.sourceCoverage,
      dataCompleteness: draft.dataCompleteness,
      params: body.params ?? null,
    };

    const id = await writeBriefing(body.workspaceId, body.projectId, briefing);
    res.json({ id, briefing: { id, ...briefing } });
  } catch (err) { next(err); }
});

export default router;
