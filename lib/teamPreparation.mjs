export const transientPreparationStatus=status=>[408,425,429].includes(Number(status)) || Number(status)>=500;
export function preparationFailure(context,error,status){
 return {...context,status:transientPreparationStatus(status)?'preparing':'preparation_failed',leaseUntil:0,error};
}
export function teamDraftIdentity(row){return [row.workspace,row.teamQueueId,row.playerId,row.batchId].join(':');}
export function sameDraftView(context,workspace,playerId,date){return !!context && context.workspace===workspace && String(context.playerId)===String(playerId) && context.date===date;}
export function draftVersion(job){return job?.draftRevision || job?.completedAt || job?.generatedAt || 'original';}
