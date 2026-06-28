// pages/api/programs/generate-status.js
// GET ?batchId=xxx → polls the Anthropic Message Batches API for an async session.
// While processing: { status: 'pending', processing_status }.
// When done: extracts the build_session tool_use, persists the session to Redis (same
// layout as save.js), and returns { status: 'done', session, player, dataSummary, date, dayGoal }.

import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { getPlayerSnapshot } from '../../../lib/playerData';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен в переменных среды Vercel' });
  }

  const { batchId } = req.query || {};
  if (!batchId) return res.status(400).json({ error: 'batchId required' });

  // Resolve the batch record (playerId, date, dayGoal, custom_id) saved at submit time.
  let record;
  try {
    const raw = await redis('get', `coach:batch:${batchId}`);
    if (!raw) return res.status(404).json({ error: 'Batch не найден (истёк или неверный id)' });
    record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const { playerId, date, dayGoal = '', customId } = record;

  const batchHeaders = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'message-batches-2024-09-24',
  };

  try {
    // 1. Check batch processing status.
    const statusRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
      headers: batchHeaders,
    });
    if (!statusRes.ok) {
      const err = await statusRes.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Batch status error ${statusRes.status}` });
    }
    const statusData = await statusRes.json();
    console.log('BATCH status:', statusData.processing_status);

    if (statusData.processing_status !== 'ended') {
      return res.status(200).json({ status: 'pending', processing_status: statusData.processing_status });
    }

    // 2. Batch finished — fetch NDJSON results and parse line by line.
    const resultsRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}/results`, {
      headers: batchHeaders,
    });
    if (!resultsRes.ok) {
      const err = await resultsRes.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Batch results error ${resultsRes.status}` });
    }
    const ndjson = await resultsRes.text();
    const entries = ndjson
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean);

    // Find our request by custom_id, falling back to the first succeeded result.
    const match =
      entries.find(e => e.custom_id === customId && e.result?.type === 'succeeded') ||
      entries.find(e => e.result?.type === 'succeeded');

    if (!match) {
      const firstErr = entries.find(e => e.result?.type === 'errored');
      const msg = firstErr?.result?.error?.message || 'Batch завершился без успешного результата';
      return res.status(502).json({ error: msg });
    }

    const message = match.result.message;
    const toolUse = message?.content?.find(c => c.type === 'tool_use' && c.name === 'build_session');
    if (!toolUse) {
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }
    const session = toolUse.input;

    // 3. Persist the session (same Redis layout as pages/api/programs/save.js).
    const snapshot = await getPlayerSnapshot(String(playerId), 7, date).catch(() => null);
    const player = snapshot?.player || null;

    const record2 = {
      session,
      player,
      dataSummary: '',
      dayGoal: dayGoal || '',
      date,
      savedAt: new Date().toISOString(),
    };
    const dateScore = parseInt(String(date).replace(/-/g, ''), 10);
    await Promise.all([
      redis('set', `coach:session:${playerId}:${date}`, JSON.stringify(record2)),
      redis('zadd', `coach:sessions:${playerId}`, dateScore, date),
    ]).catch(e => console.error('Redis save session failed:', e.message));

    return res.status(200).json({
      status: 'done',
      session,
      player,
      dataSummary: '',
      date,
      dayGoal,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
