export const coachDraftKey=(workspace,date,chain)=>`gym:coach-decisions:v1:${workspace}:${date}:${chain}`;
export function readCoachDraft(storage,key,now=Date.now()){
  try{const raw=storage.getItem(key);if(!raw)return null;const value=JSON.parse(raw);if(value.version!==1 || typeof value.revision!=='string' || !Number.isFinite(Date.parse(value.savedAt)) || now-Date.parse(value.savedAt)>14*86400000 || typeof value.selected!=='object' || !value.selected || Array.isArray(value.selected) || Object.keys(value.selected).length>30)return null;return value;}catch{return null;}
}
export function writeCoachDraft(storage,key,expectedRevision,value,now=Date.now()){
  const current=readCoachDraft(storage,key,now);if((current?.revision || null)!==(expectedRevision || null))return {conflict:true,current};
  if(!Object.keys(value.selected || {}).length){storage.removeItem(key);return {revision:null};}
  const draft={...value,version:1,revision:crypto.randomUUID(),savedAt:new Date(now).toISOString()};
  const raw=JSON.stringify(draft);if(raw.length>128000)throw Error('Правки слишком велики для локального восстановления. Сохраните меньшую группу.');storage.setItem(key,raw);return draft;
}
export function validRestoredDecisions(draft,workspace,date,chain){
  if(!draft?.selected || draft.workspace!==workspace || draft.date!==date || draft.chain!==chain)return false;
  if(draft.pending){const items=Object.entries(draft.selected).map(([playerId,value])=>({playerId,cycleId:value.editor?.cycleId,expectedRevision:value.editor?.expectedRevision,entries:value.entries}));if(draft.pending.workspace!==workspace || draft.pending.date!==date || draft.pending.trainingType!==chain || typeof draft.pending.requestId!=='string' || !/^[0-9a-f-]{36}$/.test(draft.pending.requestId) || JSON.stringify(items)!==JSON.stringify(draft.pending.items))return false;}
  return Object.entries(draft.selected).every(([id,value])=>/^[\w-]{1,100}$/.test(id) && typeof value?.editor?.cycleId==='string' && Array.isArray(value.editor.rows) && value.editor.rows.length<=9 && Array.isArray(value.entries) && value.entries.length<=9 && value.entries.every(entry=>value.editor.rows.some(row=>row.key===entry.key && row.code===entry.code && row.trainingType===chain) && ['keep','rotate'].includes(entry.exercise) && ['auto','hold'].includes(entry.progression) && ['normal','reduce_one'].includes(entry.volume) && typeof entry.note==='string' && entry.note.length<=300 && typeof entry.volumeReason==='string' && entry.volumeReason.length<=300));
}
