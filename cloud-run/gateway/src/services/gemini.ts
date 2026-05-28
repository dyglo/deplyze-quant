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

// ─── Tool-use (function calling) ────────────────────────────────────────────

export interface ToolDeclaration {
  name: string;
  description: string;
  // JSON-schema-ish object accepted by the Gemini SDK (Type enum string values).
  parameters: Record<string, unknown>;
}

export interface GeminiToolTurn {
  text: string | null;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  /** The model's turn (with functionCall parts) to append back into contents. */
  modelContent: unknown;
}

export interface GeminiContentCall {
  systemInstruction: string;
  contents: unknown[];               // multi-turn Content[] for the genai SDK
  tools?: ToolDeclaration[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Lower-level generate that supports function-calling and multi-turn contents.
 * Returns the model's text and any functionCalls so a caller can run a
 * tool-use loop. The compliance footer is still enforced on the system prompt.
 */
export async function geminiGenerateContent({
  systemInstruction,
  contents,
  tools,
  model = 'gemini-2.5-flash',
  temperature = 0.3,
  maxOutputTokens = 1024,
}: GeminiContentCall): Promise<GeminiToolTurn> {
  const ai = getClient();
  const config: Record<string, unknown> = {
    systemInstruction: `${systemInstruction}\n\n${COMPLIANCE_FOOTER}`,
    temperature,
    maxOutputTokens,
  };
  if (tools && tools.length) {
    config.tools = [{ functionDeclarations: tools }];
  }

  const response = await ai.models.generateContent({ model, contents: contents as never, config });

  const rawCalls = response.functionCalls ?? [];
  const functionCalls = rawCalls.map((fc) => ({
    name: fc.name ?? '',
    args: (fc.args ?? {}) as Record<string, unknown>,
  }));
  const modelContent = response.candidates?.[0]?.content ?? null;

  return { text: response.text ?? null, functionCalls, modelContent };
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
