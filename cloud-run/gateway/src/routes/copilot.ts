/**
 * /v1/copilot — Research Copilot chat endpoint (server-side tool-use).
 *
 * Copilot can call read-only intelligence tools (agent outputs, cross-system
 * reasoning, regime/risk, narrative exposure, historical analogs, portfolio
 * context) to ground its answers in real, citable evidence before replying.
 *
 * Safeguards (cost / token / loop bounds):
 *   - MAX_TOOL_ROUNDS model↔tool round-trips, MAX_TOTAL_TOOL_CALLS total calls.
 *   - Each tool is row-limited + truncated and cost-guarded (see intelligenceTools).
 *   - maxOutputTokens caps the model response; the message tail is bounded.
 *   - A final tool-free call guarantees a text answer if the loop is exhausted.
 *
 * Tone propagation (append-only — existing system prompt is never rewritten):
 *   "Respond at depth=<depth> (concise|standard|deep). Posture=<posture>."
 */

import { Router } from 'express';
import { z } from 'zod';
import { geminiGenerateContent, SYSTEM_PROMPTS } from '../services/gemini';
import { INTELLIGENCE_TOOLS, executeTool } from '../services/intelligenceTools';

const router = Router();

const MAX_TOOL_ROUNDS = 4;
const MAX_TOTAL_TOOL_CALLS = 6;
const MAX_OUTPUT_TOKENS = 1024;

const AwarenessToneSchema = z.object({
  depth: z.enum(['concise', 'standard', 'deep']),
  posture: z.enum(['defensive', 'neutral', 'aggressive']),
});

const Message = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(20_000),
});

const ChatBody = z.object({
  messages: z.array(Message).min(1).max(40),
  context: z.object({
    instruments: z.array(z.string()).optional(),
    timeframe: z.string().optional(),
    artifactIds: z.array(z.string()).optional(),
    portfolioId: z.string().optional(),
    awareness_tone: AwarenessToneSchema.optional().nullable(),
    use_tools: z.boolean().optional(),     // default true; allows opt-out
  }).optional(),
});

interface GeminiContent {
  role: 'user' | 'model';
  parts: Record<string, unknown>[];
}

router.post('/chat', async (req, res, next) => {
  try {
    const body = ChatBody.parse(req.body);
    const tail = body.messages.slice(-12);

    // ── System instruction: base + session context + tone + tool directive ──
    const contextLines: string[] = [];
    if (body.context?.instruments?.length) contextLines.push(`instruments: ${body.context.instruments.join(', ')}`);
    if (body.context?.timeframe) contextLines.push(`timeframe: ${body.context.timeframe}`);
    if (body.context?.portfolioId) contextLines.push(`portfolio_id: ${body.context.portfolioId}`);
    if (body.context?.artifactIds?.length) contextLines.push(`artifact_ids: ${body.context.artifactIds.join(', ')}`);
    // System-role messages are folded into the system instruction (Gemini
    // contents only accept user/model roles).
    const systemMsgs = tail.filter((m) => m.role === 'system').map((m) => m.content);

    const useTools = body.context?.use_tools !== false;

    let systemInstruction = SYSTEM_PROMPTS.researchCopilot;
    if (useTools) {
      systemInstruction +=
        '\n\nYou have read-only tools that return live institutional evidence. ' +
        'Before asserting anything about current market state, regime, risk, ' +
        'narratives, historical analogs, or a referenced portfolio, call the ' +
        'relevant tool and ground your answer in what it returns. Cite the ' +
        'metric/source. If a tool returns no data, say so rather than inventing it. ' +
        'Do not call tools for definitional or general-method questions.';
    }
    if (contextLines.length) systemInstruction += `\n\nSession context — ${contextLines.join('; ')}.`;
    if (systemMsgs.length) systemInstruction += `\n\n${systemMsgs.join('\n')}`;
    const tone = body.context?.awareness_tone;
    if (tone) systemInstruction += `\n\nRespond at depth=${tone.depth} (concise|standard|deep). Posture=${tone.posture}.`;

    // ── Build multi-turn contents (skip system-role messages) ──
    const contents: GeminiContent[] = tail
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    if (!contents.length) return res.status(400).json({ error: 'no user/assistant messages' });

    // ── Tool-use loop ──
    const toolTrace: { name: string; ok: boolean }[] = [];
    const evidence: { tool: string; sources: string[]; rows: number }[] = [];
    let totalCalls = 0;
    let reply: string | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const turn = await geminiGenerateContent({
        systemInstruction,
        contents,
        tools: useTools ? INTELLIGENCE_TOOLS : undefined,
        temperature: 0.4,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });

      if (!turn.functionCalls.length) {
        reply = turn.text;
        break;
      }

      // Append the model's tool-call turn, then run each call and append results.
      contents.push(
        (turn.modelContent as GeminiContent) ?? {
          role: 'model',
          parts: turn.functionCalls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args } })),
        },
      );

      const responseParts: Record<string, unknown>[] = [];
      for (const call of turn.functionCalls) {
        if (totalCalls >= MAX_TOTAL_TOOL_CALLS) {
          responseParts.push({ functionResponse: { name: call.name, response: { error: 'tool-call budget exhausted; answer with evidence already gathered' } } });
          continue;
        }
        totalCalls++;
        const result = await executeTool(call.name, call.args);
        toolTrace.push({ name: call.name, ok: result.ok });
        if (result.ok) {
          evidence.push({
            tool: call.name,
            sources: result.sources ?? [],
            rows: Array.isArray(result.data) ? result.data.length : 1,
          });
          responseParts.push({ functionResponse: { name: call.name, response: { data: result.data } } });
        } else {
          responseParts.push({ functionResponse: { name: call.name, response: { error: result.error } } });
        }
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    // Loop exhausted without a text answer → one final tool-free call.
    if (reply === null) {
      const final = await geminiGenerateContent({
        systemInstruction,
        contents,
        temperature: 0.4,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      reply = final.text;
    }

    res.json({
      reply: reply ?? 'I could not produce a grounded answer from the available evidence.',
      evidence,
      tool_trace: toolTrace,
    });
  } catch (err) { next(err); }
});

export default router;
