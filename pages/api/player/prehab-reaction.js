import { redis } from '../../../lib/redis';
import { pfx, sessionKey } from '../../../lib/workspacePrefix';
import { resolveShareToken } from '../../../lib/shareToken';
import { getPrehabReactions } from '../../../lib/prehabReactionStore';
import { normalizePrehabReaction, PREHAB_STAGES, prehabReactionKey, nextPrehabDate, worseningPrehabZones } from '../../../lib/prehabReaction.mjs';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(new Date());
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).end();
  const input = req.method === 'GET' ? req.query : req.body || {};
  const { token, date, stage } = input;
  if (!token || !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date) return res.status(400).json({ error:'Некорректная дата или ссылка.' });
  try {
    const resolved = await resolveShareToken(token);
    if (!resolved?.playerId) return res.status(404).json({ error:'Ссылка недействительна.' });
    const { playerId, workspace } = resolved;
    const raw = await redis('get', sessionKey(workspace, playerId, date));
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (record?.session?.kind !== 'prehab_training_draft') return res.status(404).json({ error:'Профилактическая программа не найдена.' });
    const [reaction] = await getPrehabReactions(playerId, [date], workspace);
    if (req.method === 'GET') return res.status(200).json({ reaction, today:today(), nextMorningDate:nextPrehabDate(date), worsenedZones:worseningPrehabZones(reaction) });
    if (!PREHAB_STAGES.includes(stage)) return res.status(400).json({ error:'Некорректный этап оценки.' });
    const currentDate = today();
    if (date > currentDate || stage === 'nextMorning' && currentDate < nextPrehabDate(date)) return res.status(409).json({ error:'Этот этап оценки ещё не наступил.' });
    if (stage !== 'before' && !reaction.before) return res.status(409).json({ error:'Сначала сохраните исходную оценку до занятия.' });
    if (stage === 'before' && reaction.before) return res.status(409).json({ error:'Исходная оценка уже зафиксирована.' });
    let normalized;
    try { normalized = normalizePrehabReaction(input); } catch (error) { return res.status(400).json({ error:error.message }); }
    const value = { ...normalized, submittedAt:new Date().toISOString(), reportedDate:currentDate, retrospective:stage !== 'nextMorning' ? currentDate > date : currentDate > nextPrehabDate(date) };
    const result = await redis('set', `${prehabReactionKey(pfx(workspace), playerId, date)}:${stage}`, JSON.stringify(value), ...(stage === 'before' ? ['NX'] : []));
    if (stage === 'before' && result !== 'OK') return res.status(409).json({ error:'Исходная оценка уже сохранена. Обновите страницу.' });
    const next = { ...reaction, [stage]:value };
    return res.status(200).json({ reaction:next, worsenedZones:worseningPrehabZones(next) });
  } catch { return res.status(503).json({ error:'Не удалось сохранить или загрузить оценку. Повторите попытку.' }); }
}
