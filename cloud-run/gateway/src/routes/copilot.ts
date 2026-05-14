/**
 * /v1/copilot — Research Copilot chat endpoint.
 */

import { Router } from 'express';
import { z } from 'zod';
import { geminiGenerate, SYSTEM_PROMPTS } from '../services/gemini';

const router = Router();

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
  }).optional(),
});

router.post('/chat', async (req, res, next) => {
  try {
    const body = ChatBody.parse(req.body);
    const tail = body.messages.slice(-12);

    const contextLines: string[] = [];
    if (body.context?.instruments?.length) {
      contextLines.push(`Context instruments: ${body.context.instruments.join(', ')}`);
    }
    if (body.context?.timeframe) {
      contextLines.push(`Context timeframe: ${body.context.timeframe}`);
    }
    if (body.context?.artifactIds?.length) {
      contextLines.push(`Context artifact ids: ${body.context.artifactIds.join(', ')}`);
    }

    const dialogue = tail
      .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
      .join('\n\n');

    const prompt = [
      contextLines.length ? contextLines.join('\n') : null,
      dialogue,
      'ASSISTANT:',
    ].filter(Boolean).join('\n\n');

    const reply = await geminiGenerate({
      systemInstruction: SYSTEM_PROMPTS.researchCopilot,
      prompt,
      temperature: 0.4,
    });

    res.json({ reply });
  } catch (err) { next(err); }
});

export default router;
