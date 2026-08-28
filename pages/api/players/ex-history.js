// pages/api/players/ex-history.js
// POST { playerId, names: string[] }
// Returns { histories: { name: [{date, kg}] } } sorted oldest→newest.
// History stored as HASH coach:exhist:{playerId}:{normName} field=date value=kg.

import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { legacyNormExName, normExName } from './progression';
import { exhistKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, names = [], exercises = [], workspace = 'zarechie' } = req.body || {};
  const requested = [
    ...(Array.isArray(exercises) ? exercises.map(ex => ({ id: ex?.exerciseId || normExName(ex?.name), name: ex?.name || '' })) : []),
    ...(Array.isArray(names) ? names.map(name => ({ id: normExName(name), name })) : []),
  ].filter(item => item.name);
  if (!playerId || !requested.length)
    return res.status(400).json({ error: 'playerId and names[] or exercises[] required' });

  const unique = [...new Map(requested.map(item => [item.id, item])).values()];
  const results = await redisPipeline(unique.flatMap(item => [
    ['HGETALL', exhistKey(workspace, playerId, item.id)],
    ['HGETALL', exhistKey(workspace, playerId, legacyNormExName(item.name))],
  ])).catch(() => []);

  const histories = {};
  const historiesById = {};
  unique.forEach((item, i) => {
    const { id, name } = item;
    const currentRaw = results[i * 2];
    const legacyRaw = results[i * 2 + 1];
    const currentHasData = Array.isArray(currentRaw)
      ? currentRaw.length > 0
      : !!currentRaw && typeof currentRaw === 'object' && Object.keys(currentRaw).length > 0;
    const raw = currentHasData ? currentRaw : legacyRaw;
    if (!raw) return;

    let record = {};
    if (Array.isArray(raw)) {
      for (let j = 0; j < raw.length - 1; j += 2) record[raw[j]] = raw[j + 1];
    } else if (raw && typeof raw === 'object') {
      record = raw;
    }

    const entries = Object.entries(record)
      .map(([date, kg]) => ({ date, kg: parseFloat(kg) }))
      .filter(e => e.kg > 0 && e.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length > 0) {
      histories[name] = entries;
      historiesById[id] = entries;
    }
  });

  return res.status(200).json({ histories, historiesById });
}
