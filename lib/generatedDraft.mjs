export const generatedDraftKey = (workspace, playerId, date) => `${workspace === 'nkperf' ? 'nkperf' : 'coach'}:program-draft:${playerId}:${date}`;
export function generatedDraftRecord(result, request, generatedAt = new Date().toISOString()) {
  if (!['prehab_training_draft', 'restricted_training_draft', 'restricted_day_plan'].includes(result?.session?.kind)) return null;
  return { session: result.session, player: result.player || null, dataSummary: result.dataSummary || '', quality: result.quality || null,
    date: result.date, dayGoal: result.dayGoal || request.dayGoal || '', focus: result.focus || request.focus || '',
    trainingType: result.trainingType || request.trainingType || '', trainingLabel: result.session.kind === 'prehab_training_draft' ? 'Профилактика · черновик' : 'Ограничения · черновик',
    draft: true, generatedAt };
}
