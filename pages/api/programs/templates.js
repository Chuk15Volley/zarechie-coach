// pages/api/programs/templates.js
// GET                                   → { templates: [{ name, focus, exerciseCount, createdAt }] }
// POST action=save  { name, focus, blocks } → { ok }
// POST action=load  { name }                → { template: { name, focus, blocks } }
// DELETE ?name=xxx                          → { ok }
// Coach-facing: auth via isAuthorized for all methods.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function key(name) {
  return `coach:template:${name}`;
}

function countExercises(blocks) {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((sum, b) => sum + (Array.isArray(b?.exercises) ? b.exercises.length : 0), 0);
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: list ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const names = await redis('smembers', 'coach:templates').catch(() => []);
    if (!names || !names.length) return res.status(200).json({ templates: [] });

    const raws = await Promise.all(names.map(n => redis('get', key(n)).catch(() => null)));
    const templates = [];
    raws.forEach((raw) => {
      if (!raw) return;
      try {
        const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
        templates.push({
          name: t.name,
          focus: t.focus || '',
          exerciseCount: countExercises(t.blocks),
          createdAt: t.createdAt || null,
        });
      } catch (_) {}
    });
    templates.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return res.status(200).json({ templates });
  }

  // ── POST: save / load ────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body || {};

    if (action === 'save') {
      const { name, focus, blocks } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
      const clean = String(name).trim();
      const payload = {
        name: clean,
        focus: focus || '',
        blocks: Array.isArray(blocks) ? blocks : [],
        createdAt: Date.now(),
      };
      await redis('set', key(clean), JSON.stringify(payload));
      await redis('sadd', 'coach:templates', clean).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    if (action === 'load') {
      const { name } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const raw = await redis('get', key(name)).catch(() => null);
      if (!raw) return res.status(404).json({ error: 'not found' });
      const template = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json({ template });
    }

    return res.status(400).json({ error: 'unknown action' });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const name = (req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    await redis('del', key(name)).catch(() => {});
    await redis('srem', 'coach:templates', name).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
