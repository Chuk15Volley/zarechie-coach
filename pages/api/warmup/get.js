// pages/api/warmup/get.js
// GET ?date=YYYY-MM-DD → { plan } or { plan: null }

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query || {};
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  try {
    const raw = await redis('get', `coach:warmup:${date}`);
    const plan = raw ? JSON.parse(raw) : null;
    return res.status(200).json({ plan });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
