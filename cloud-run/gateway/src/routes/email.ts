import { Router } from 'express';
import { z } from 'zod';
import { getEmailPreferences, updateEmailPreferences, unsubscribeWithToken } from '../email/preferences';

export const authenticatedEmailRouter = Router();
export const publicEmailRouter = Router();

const PreferencesPatchSchema = z.object({
  dailyPortfolioBrief: z.boolean().optional(),
  riskRegimeAlerts: z.boolean().optional(),
  onboarding: z.boolean().optional(),
  unsubscribedAll: z.boolean().optional(),
});

authenticatedEmailRouter.get('/preferences', async (req, res, next) => {
  try {
    const preferences = await getEmailPreferences(req.uid);
    res.json({ preferences });
  } catch (err) {
    next(err);
  }
});

authenticatedEmailRouter.patch('/preferences', async (req, res, next) => {
  try {
    const patch = PreferencesPatchSchema.parse(req.body);
    const preferences = await updateEmailPreferences(req.uid, patch, req.uid);
    res.json({ preferences });
  } catch (err) {
    next(err);
  }
});

function unsubscribeForm(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deplyze Quant Email Preferences</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;background:#f6f3ef;color:#171717;margin:0;padding:40px}.panel{max-width:560px;background:#fff;border:1px solid #ded8cf;border-radius:8px;padding:24px;margin:auto}h1{font-size:22px;margin:0 0 12px}p{line-height:1.6}</style>
    </head><body><main class="panel"><h1>Email Preferences Updated</h1><p>${message}</p></main></body></html>`;
}

publicEmailRouter.get('/unsubscribe', async (req, res) => {
  try {
    const uid = String(req.query.uid ?? '');
    const email = String(req.query.email ?? '');
    const scope = String(req.query.scope ?? 'all');
    const token = String(req.query.token ?? '');
    const result = await unsubscribeWithToken({ uid, email, scope, token });
    if (!result.ok) {
      res.status(400).send(unsubscribeForm('This unsubscribe link is invalid or has expired.'));
      return;
    }
    res.status(200).send(unsubscribeForm('Your email preference has been updated. You can still manage preferences from Deplyze Quant settings.'));
  } catch {
    res.status(400).send(unsubscribeForm('This unsubscribe link could not be processed.'));
  }
});

publicEmailRouter.post('/unsubscribe', async (req, res) => {
  try {
    const parsed = z.object({
      uid: z.string().min(1),
      email: z.string().email(),
      scope: z.string().default('all'),
      token: z.string().min(16),
    }).parse(req.body);
    const result = await unsubscribeWithToken(parsed);
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.reason });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, code: 'INVALID_UNSUBSCRIBE_REQUEST' });
  }
});
