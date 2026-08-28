import { setSessionCookie, trainerKeyMatches } from '../../../lib/auth.js';
import { enforceRateLimit } from '../../../lib/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await enforceRateLimit(req, res, {
    scope: 'auth-login',
    limit: 8,
    windowSeconds: 15 * 60,
  });
  if (!allowed) return;

  if (!process.env.TRAINER_API_KEY) {
    return res.status(503).json({ error: 'Авторизация не настроена' });
  }

  const trainerKey = String(req.body?.trainerKey || '');
  if (!trainerKey || trainerKey.length > 512 || !trainerKeyMatches(trainerKey)) {
    return res.status(401).json({ error: 'Неверный ключ доступа' });
  }

  setSessionCookie(res);
  return res.status(200).json({ ok: true, role: 'coach' });
}
