import { redisPipeline } from './redis';
import { pfx } from './workspacePrefix';
import { PREHAB_STAGES, prehabReactionKey } from './prehabReaction.mjs';
export async function getPrehabReactions(playerId, dates, workspace) {
  if (!dates.length) return [];
  const values = await redisPipeline(dates.flatMap(date => PREHAB_STAGES.map(stage => ['GET', `${prehabReactionKey(pfx(workspace), playerId, date)}:${stage}`])));
  return dates.map((date, i) => Object.fromEntries([['date', date], ...PREHAB_STAGES.map((stage, j) => {
    const value = values[i * 3 + j];
    return [stage, typeof value === 'string' ? JSON.parse(value) : value || null];
  })]));
}
