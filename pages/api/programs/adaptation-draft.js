import crypto from 'node:crypto';
import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { adaptSessionDraft, markAdaptationApplied } from '../../../lib/sessionAdaptation.mjs';
import { adaptationDraftKey, adaptationOutcomeKey, sessionKey, sessionsKey } from '../../../lib/workspacePrefix';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT_TTL_SECONDS = 7 * 24 * 60 * 60;
const COMMIT_SCRIPT = "if redis.call('get',KEYS[1])~=ARGV[1] then return 0 end if redis.call('get',KEYS[2])~=ARGV[2] then return -1 end redis.call('lpush',KEYS[3],ARGV[1]) redis.call('ltrim',KEYS[3],0,9) redis.call('set',KEYS[1],ARGV[3]) redis.call('zadd',KEYS[4],ARGV[4],ARGV[5]) redis.call('set',KEYS[5],ARGV[6]) redis.call('del',KEYS[2]) return 1";

function parse(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const source = req.method === 'GET' || req.method === 'DELETE' ? req.query : req.body;
  const workspace = source?.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const playerId = String(source?.playerId || '');
  const date = String(source?.date || '');
  if (!playerId || playerId.length > 100 || !DATE_RE.test(date)) return res.status(400).json({ error: 'playerId and valid date are required' });
  const draftKey = adaptationDraftKey(workspace, playerId, date);

  if (req.method === 'GET') {
    return res.status(200).json({ draft: parse(await redis('get', draftKey).catch(() => null)) });
  }
  if (req.method === 'DELETE') {
    await redis('del', draftKey);
    return res.status(200).json({ ok: true });
  }

  const action = req.body?.action === 'commit' ? 'commit' : 'create';
  const canonicalKey = sessionKey(workspace, playerId, date);
  if (action === 'create') {
    const record = parse(await redis('get', canonicalKey).catch(() => null));
    if (!record?.session) return res.status(404).json({ error: 'Сначала назначьте и сохраните программу' });
    const adapted = adaptSessionDraft(record.session, req.body?.recommendation || {}, {
      draftId: crypto.randomUUID(), baseSavedAt: record.savedAt || null,
    });
    const draft = {
      schema: 'zarechie.adaptation-draft.v1',
      draftId: adapted.draftId,
      playerId,
      date,
      workspace,
      baseSavedAt: record.savedAt || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_SECONDS * 1000).toISOString(),
      recommendation: adapted.recommendation,
      before: adapted.before,
      after: adapted.after,
      record: { ...record, session: adapted.session },
    };
    await redis('set', draftKey, JSON.stringify(draft), 'EX', String(DRAFT_TTL_SECONDS));
    return res.status(200).json({ draft });
  }

  const [rawDraft, rawCurrent] = await Promise.all([
    redis('get', draftKey).catch(() => null),
    redis('get', canonicalKey).catch(() => null),
  ]);
  const draft = parse(rawDraft);
  const current = parse(rawCurrent);
  if (!draft?.record?.session || !current?.session) return res.status(404).json({ error: 'Черновик адаптации не найден' });
  if (draft.draftId !== req.body?.draftId) return res.status(409).json({ error: 'Черновик был заменён более новой версией' });
  if (String(current.savedAt || '') !== String(draft.baseSavedAt || '')) return res.status(409).json({ error: 'Программа изменилась. Создайте адаптацию заново' });
  const appliedAt = new Date().toISOString();
  const record = {
    ...draft.record,
    session: markAdaptationApplied(draft.record.session, appliedAt),
    savedAt: appliedAt,
  };
  const versionsKey = `${canonicalKey}:versions`;
  const dateScore = parseInt(date.replace(/-/g, ''), 10);
  const loopState = {
    schema: 'zarechie.adaptation-loop.v1',
    playerId,
    date,
    draftId: draft.draftId,
    status: 'awaiting_outcome',
    appliedAt,
    recommendation: draft.recommendation,
  };
  const [commitResult] = await redisPipeline([[
    'EVAL', COMMIT_SCRIPT, '5',
    canonicalKey, draftKey, versionsKey, sessionsKey(workspace, playerId), adaptationOutcomeKey(workspace, playerId),
    String(rawCurrent), String(rawDraft), JSON.stringify(record), String(dateScore), date, JSON.stringify(loopState),
  ]]);
  const committed = Number(commitResult);
  if (committed !== 1) return res.status(409).json({ error: 'Программа или черновик изменились. Создайте адаптацию заново' });
  return res.status(200).json({ ok: true, record, loopState });
}
