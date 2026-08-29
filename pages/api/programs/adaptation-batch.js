import crypto from 'node:crypto';
import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { adaptSessionDraft, markAdaptationApplied } from '../../../lib/sessionAdaptation.mjs';
import {
  adaptationBatchAppliedKey,
  adaptationBatchDraftKey,
  adaptationBatchLatestKey,
  adaptationOutcomeKey,
  pfx,
  sessionKey,
  sessionsKey,
} from '../../../lib/workspacePrefix';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 20;
const TTL_SECONDS = 7 * 24 * 60 * 60;
const COMMIT_SCRIPT = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
local memberCount = tonumber(ARGV[5])
for i=1,memberCount do
  local keyOffset = 3 + ((i - 1) * 6) + 1
  local argOffset = 5 + ((i - 1) * 7) + 1
  if redis.call('get', KEYS[keyOffset]) ~= ARGV[argOffset] then return -i end
  if (redis.call('get', KEYS[keyOffset + 4]) or '') ~= ARGV[argOffset + 5] then return -i end
  if (redis.call('get', KEYS[keyOffset + 5]) or '') ~= ARGV[argOffset + 6] then return -i end
end
redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('set', KEYS[3], ARGV[3], 'EX', ARGV[4])
for i=1,memberCount do
  local keyOffset = 3 + ((i - 1) * 6) + 1
  local argOffset = 5 + ((i - 1) * 7) + 1
  redis.call('lpush', KEYS[keyOffset + 1], ARGV[argOffset])
  redis.call('ltrim', KEYS[keyOffset + 1], 0, 9)
  redis.call('set', KEYS[keyOffset], ARGV[argOffset + 1])
  redis.call('zadd', KEYS[keyOffset + 2], ARGV[argOffset + 2], ARGV[argOffset + 3])
  redis.call('set', KEYS[keyOffset + 3], ARGV[argOffset + 4])
end
redis.call('del', KEYS[1])
return 1`;
const ROLLBACK_SCRIPT = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
local memberCount = tonumber(ARGV[5])
for i=1,memberCount do
  local keyOffset = 2 + ((i - 1) * 6) + 1
  local argOffset = 5 + ((i - 1) * 7) + 1
  if redis.call('get', KEYS[keyOffset]) ~= ARGV[argOffset] then return -i end
  if (redis.call('get', KEYS[keyOffset + 4]) or '') ~= ARGV[argOffset + 5] then return -i end
  if (redis.call('get', KEYS[keyOffset + 5]) or '') ~= ARGV[argOffset + 6] then return -i end
end
redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('set', KEYS[2], ARGV[3], 'EX', ARGV[4])
for i=1,memberCount do
  local keyOffset = 2 + ((i - 1) * 6) + 1
  local argOffset = 5 + ((i - 1) * 7) + 1
  redis.call('lpush', KEYS[keyOffset + 1], ARGV[argOffset])
  redis.call('ltrim', KEYS[keyOffset + 1], 0, 9)
  redis.call('set', KEYS[keyOffset], ARGV[argOffset + 1])
  redis.call('zadd', KEYS[keyOffset + 2], ARGV[argOffset + 2], ARGV[argOffset + 3])
  redis.call('set', KEYS[keyOffset + 3], ARGV[argOffset + 4])
end
return 1`;

function parse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function clean(value, max = 120) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function validDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function publicMember(member) {
  return {
    playerId: member.playerId,
    playerName: member.playerName,
    date: member.date,
    draftId: member.draftId,
    recommendation: member.recommendation,
    before: member.before,
    after: member.after,
  };
}

function publicBatch(batch, overrides = {}) {
  return {
    schema: 'zarechie.adaptation-batch-summary.v1',
    batchId: batch.batchId,
    workspace: batch.workspace,
    status: batch.status,
    createdAt: batch.createdAt,
    appliedAt: batch.appliedAt || null,
    rolledBackAt: batch.rolledBackAt || null,
    rollbackAvailable: batch.status === 'applied',
    members: batch.members.map(publicMember),
    ...overrides,
  };
}

function memberKeys(workspace, member) {
  const canonical = sessionKey(workspace, member.playerId, member.date);
  const prefix = pfx(workspace);
  return [
    canonical,
    `${canonical}:versions`,
    sessionsKey(workspace, member.playerId),
    adaptationOutcomeKey(workspace, member.playerId),
    `${prefix}:session:actual:${member.playerId}:${member.date}`,
    `${prefix}:log:${member.playerId}:${member.date}`,
  ];
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const workspace = req.body?.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const action = ['create', 'commit', 'rollback'].includes(req.body?.action) ? req.body.action : 'create';

  if (action === 'create') {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length || items.length > MAX_ITEMS) return res.status(400).json({ error: `Выберите от 1 до ${MAX_ITEMS} программ` });
    const normalized = items.map(item => ({
      playerId: clean(item?.playerId, 100),
      playerName: clean(item?.playerName, 100),
      date: String(item?.date || ''),
      recommendation: item?.recommendation || {},
    }));
    if (normalized.some(item => !item.playerId || !validDate(item.date))) return res.status(400).json({ error: 'Некорректный игрок или дата' });
    const unique = new Set(normalized.map(item => `${item.playerId}:${item.date}`));
    if (unique.size !== normalized.length) return res.status(400).json({ error: 'Программа не может входить в пакет дважды' });

    const prefix = pfx(workspace);
    const rawRecords = await redisPipeline(normalized.flatMap(item => [
      ['GET', sessionKey(workspace, item.playerId, item.date)],
      ['GET', `${prefix}:session:actual:${item.playerId}:${item.date}`],
      ['GET', `${prefix}:log:${item.playerId}:${item.date}`],
    ])).catch(() => []);
    if (rawRecords.length !== normalized.length * 3) return res.status(503).json({ error: 'Не удалось загрузить программы' });
    const batchId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const members = normalized.map((item, index) => {
      const offset = index * 3;
      const record = parse(rawRecords[offset]);
      const actual = parse(rawRecords[offset + 1]);
      const log = parse(rawRecords[offset + 2]);
      if (!record?.session) return null;
      if (actual?.savedAt || log?.startedAt || log?.completedAt) return { completed: true, playerName: item.playerName };
      const adapted = adaptSessionDraft(record.session, item.recommendation, {
        draftId: crypto.randomUUID(), baseSavedAt: record.savedAt || null, createdAt,
      });
      return {
        ...item,
        draftId: adapted.draftId,
        baseSavedAt: record.savedAt || null,
        baseRaw: String(rawRecords[offset]),
        baseActualRaw: rawRecords[offset + 1] == null ? '' : String(rawRecords[offset + 1]),
        baseLogRaw: rawRecords[offset + 2] == null ? '' : String(rawRecords[offset + 2]),
        adaptedRecord: { ...record, session: adapted.session },
        recommendation: adapted.recommendation,
        before: adapted.before,
        after: adapted.after,
      };
    });
    if (members.some(member => !member)) return res.status(404).json({ error: 'Одна или несколько программ не найдены' });
    if (members.some(member => member.completed)) return res.status(409).json({ error: 'Завершённую тренировку нельзя включить в пакет адаптации' });
    const batch = {
      schema: 'zarechie.adaptation-batch.v1', batchId, workspace, status: 'draft', createdAt,
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(), members,
    };
    await redis('set', adaptationBatchDraftKey(workspace, batchId), JSON.stringify(batch), 'EX', String(TTL_SECONDS));
    return res.status(200).json({ batch: publicBatch(batch) });
  }

  const batchId = clean(req.body?.batchId, 80);
  if (!batchId) return res.status(400).json({ error: 'batchId required' });

  if (action === 'commit') {
    const draftKey = adaptationBatchDraftKey(workspace, batchId);
    const rawDraft = await redis('get', draftKey).catch(() => null);
    const batch = parse(rawDraft);
    if (!batch || batch.status !== 'draft' || batch.workspace !== workspace || !Array.isArray(batch.members)) {
      return res.status(404).json({ error: 'Черновик пакета не найден или истёк' });
    }
    const appliedAt = new Date().toISOString();
    const appliedMembers = batch.members.map(member => {
      const session = markAdaptationApplied(member.adaptedRecord.session, appliedAt);
      const appliedRecord = {
        ...member.adaptedRecord,
        session: { ...session, adaptation: { ...session.adaptation, batchId } },
        savedAt: appliedAt,
      };
      const { adaptedRecord: _adaptedRecord, ...compactMember } = member;
      return { ...compactMember, appliedRaw: JSON.stringify(appliedRecord) };
    });
    const applied = { ...batch, status: 'applied', appliedAt, members: appliedMembers };
    const summary = publicBatch(applied);
    const keys = [draftKey, adaptationBatchAppliedKey(workspace, batchId), adaptationBatchLatestKey(workspace), ...appliedMembers.flatMap(member => memberKeys(workspace, member))];
    const args = [String(rawDraft), JSON.stringify(applied), JSON.stringify(summary), String(TTL_SECONDS), String(appliedMembers.length)];
    appliedMembers.forEach(member => {
      args.push(
        member.baseRaw,
        member.appliedRaw,
        String(Number.parseInt(member.date.replace(/-/g, ''), 10)),
        member.date,
        JSON.stringify({
          schema: 'zarechie.adaptation-loop.v1', playerId: member.playerId, date: member.date,
          draftId: member.draftId, batchId, status: 'awaiting_outcome', appliedAt, recommendation: member.recommendation,
        }),
        member.baseActualRaw,
        member.baseLogRaw,
      );
    });
    const [result] = await redisPipeline([['EVAL', COMMIT_SCRIPT, String(keys.length), ...keys, ...args]]);
    if (Number(result) !== 1) return res.status(409).json({ error: 'Одна из программ изменилась. Пересоберите пакет' });
    return res.status(200).json({ ok: true, batch: summary });
  }

  const appliedKey = adaptationBatchAppliedKey(workspace, batchId);
  const rawApplied = await redis('get', appliedKey).catch(() => null);
  const applied = parse(rawApplied);
  if (!applied || applied.status !== 'applied' || applied.workspace !== workspace || !Array.isArray(applied.members)) {
    return res.status(404).json({ error: 'Применённый пакет не найден или уже откачен' });
  }
  const rolledBackAt = new Date().toISOString();
  const rolledMembers = applied.members.map(member => {
    const beforeRecord = parse(member.baseRaw);
    const restoredRecord = {
      ...beforeRecord,
      savedAt: rolledBackAt,
      restoredFromBatch: batchId,
      restoredAt: rolledBackAt,
    };
    return { ...member, restoredRecord, restoredRaw: JSON.stringify(restoredRecord) };
  });
  const rolled = { ...applied, status: 'rolled_back', rolledBackAt, members: rolledMembers };
  const summary = publicBatch(rolled);
  const keys = [appliedKey, adaptationBatchLatestKey(workspace), ...rolledMembers.flatMap(member => memberKeys(workspace, member))];
  const args = [String(rawApplied), JSON.stringify(rolled), JSON.stringify(summary), String(TTL_SECONDS), String(rolledMembers.length)];
  rolledMembers.forEach(member => {
    args.push(
      member.appliedRaw,
      member.restoredRaw,
      String(Number.parseInt(member.date.replace(/-/g, ''), 10)),
      member.date,
      JSON.stringify({
        schema: 'zarechie.adaptation-loop.v1', playerId: member.playerId, date: member.date,
        draftId: member.draftId, batchId, status: 'rolled_back', rolledBackAt, recommendation: member.recommendation,
      }),
      member.baseActualRaw,
      member.baseLogRaw,
    );
  });
  const [result] = await redisPipeline([['EVAL', ROLLBACK_SCRIPT, String(keys.length), ...keys, ...args]]);
  if (Number(result) !== 1) return res.status(409).json({ error: 'После пакета одна из программ была изменена. Автоматический откат остановлен' });
  return res.status(200).json({ ok: true, batch: summary });
}
