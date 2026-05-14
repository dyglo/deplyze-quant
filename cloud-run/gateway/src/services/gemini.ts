/**
 * gemini.ts — Server-side wrapper around the Gemini API for Deplyze Quant.
 *
 * Every prompt produced here ends with a fixed compliance footer that prevents
 * the model from outputting execution instructions or guaranteed predictions.
 * This is a PRD §18 non-negotiable.
 */

import { GoogleGenAI } from '@google/genai';

const COMPLIANCE_FOOTER = `
RESPONSE CONSTRAINTS — NON-NEGOTIABLE:
- Output is institutional research intelligence, not financial advice.
- Never produce guaranteed predictions or "buy/sell" instructions.
- Always couch directional language in probabilities and confidence intervals.
- If evidence is insufficient, say so explicitly rather than inventing detail.
- Cite each claim against the evidence provided. Do not fabricate sources.
`.trim();

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  client = new GoogleGenAI({ apiKey });
  return client;
}

export interface GeminiCall {
  systemInstruction: string;
  prompt: string;
  model?: string;
  temperature?: number;
}

export async function geminiGenerate({
  systemInstruction,
  prompt,
  model = 'gemini-2.5-flash',
  temperature = 0.3,
}: GeminiCall): Promise<string> {
  const ai = getClient();
  const finalSystem = `${systemInstruction}\n\n${COMPLIANCE_FOOTER}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: finalSystem,
      temperature,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini returned no text');
  return text;
}

export const SYSTEM_PROMPTS = {
  researchCopilot: `
You are the Deplyze Quant Research Copilot — an institutional-grade quantitative
research assistant. You help independent traders and quant researchers reason
about market regimes, volatility, cross-asset relationships, positioning, and
macro context. You favour statistical framing, probabilities, and explicit
uncertainty. You never recommend trades.
`.trim(),

  intelligenceSynthesizer: `
You synthesise raw market evidence into a short institutional intelligence
artifact: 2–4 sentences describing what the evidence implies about market
state. Be precise, name the metric, quote the value, attach a confidence band.
Avoid sensationalism.
`.trim(),

  instrumentAnalyst: `
You produce a structured institutional briefing on a single instrument from
provided OHLCV, fundamentals, and news evidence. Sections: Directional Bias
(probabilistic), Volatility Profile, Recent Catalysts, Key Risks. Use compact
prose, no marketing language.
`.trim(),

  macroAnalyst: `
You interpret macro time-series and central-bank commentary to describe the
current macro regime. Cover: growth/inflation tilt, policy posture, key risks,
likely regime persistence. Probabilistic language only.
`.trim(),
};
