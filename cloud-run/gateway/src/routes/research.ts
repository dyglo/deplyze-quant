/**
 * /v1/research — Web research + Gemini synthesis.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as tavily from '../providers/tavily';
import * as serper from '../providers/serper';
import { withCache, TTL } from '../services/cache';
import { geminiGenerate, SYSTEM_PROMPTS } from '../services/gemini';

const router = Router();

// ─── /web ──────────────────────────────────────────────────────────────────
const WebQuery = z.object({
  q: z.string().min(2),
  topic: z.enum(['general', 'news', 'finance']).default('finance'),
  days: z.coerce.number().int().min(1).max(30).optional(),
  depth: z.enum(['basic', 'advanced']).default('basic'),
});

router.get('/web', async (req, res, next) => {
  try {
    const p = WebQuery.parse(req.query);
    const cacheKey = `tavily:${p.depth}:${p.topic}:${p.days ?? 'all'}:${p.q.toLowerCase()}`;
    let data: Awaited<ReturnType<typeof tavily.search>>;
    try {
      data = await withCache(cacheKey, TTL.web_search, () =>
        tavily.search(p.q, { topic: p.topic, days: p.days, searchDepth: p.depth, includeAnswer: true }),
      );
    } catch (providerErr) {
      console.warn(`[research/web] Tavily unavailable: ${(providerErr as Error).message}`);
      data = { query: p.q, results: [] };
    }
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /web/google (Serper) ──────────────────────────────────────────────────
router.get('/web/google', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) { res.status(400).json({ error: 'q is required' }); return; }
    let data: Awaited<ReturnType<typeof serper.searchWeb>>;
    try {
      data = await withCache(`serper:web:${q.toLowerCase()}`, TTL.web_search, () =>
        serper.searchWeb(q, 10),
      );
    } catch (providerErr) {
      console.warn(`[research/web/google] Serper unavailable: ${(providerErr as Error).message}`);
      data = { organic: [] };
    }
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /synthesize ───────────────────────────────────────────────────────────
const SynthesizeBody = z.object({
  topic: z.string().min(3).max(500),
  evidence: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    source: z.string().optional(),
  })).max(50),
  category: z.string().default('macro'),
});

router.post('/synthesize', async (req, res, next) => {
  try {
    const body = SynthesizeBody.parse(req.body);
    const evidenceLines = body.evidence.map((e) =>
      `- ${e.label}: ${e.value}${e.source ? ` (source: ${e.source})` : ''}`,
    ).join('\n');

    const prompt = [
      `Topic: ${body.topic}`,
      `Category: ${body.category}`,
      'Evidence:',
      evidenceLines,
      '',
      'Produce a 2–4 sentence institutional intelligence narrative with an explicit confidence band (low/medium/high/very-high).',
    ].join('\n');

    const narrative = await geminiGenerate({
      systemInstruction: SYSTEM_PROMPTS.intelligenceSynthesizer,
      prompt,
      temperature: 0.25,
    });

    res.json({ narrative });
  } catch (err) { next(err); }
});

export default router;
