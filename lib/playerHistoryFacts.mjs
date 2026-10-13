import {strengthMissingEditor} from './strengthActualSupplement.mjs';
// Reuse the same completion, edition and source checks as the supplement editor.
export function playerHistoryFacts(record,actual,log,supplement){
 if((record?.focus || record?.quality?.focus)!=='inseason_strength')return null;
 const editor=strengthMissingEditor(record,actual,log,supplement);
 if(!editor)return {completed:false,canConfirm:false,missing:{kg:0,reps:0,rpe:0},rows:[],status:'awaiting_completion',staleReasons:[]};
 const missing={kg:0,reps:0,rpe:0};
 for(const row of editor.rows){missing.rpe+=row.missingRpe?1:0;for(const set of row.sets){missing.kg+=set.missingKg?1:0;missing.reps+=set.missingReps?1:0;}}
 const rows=editor.rows.map(row=>{const [bi,ei]=row.exercise.split('-').map(Number);return {...row,symptomAdapted:!!record.session?.blocks?.[bi]?.exercises?.[ei]?.symptomAdapted};});
 return {completed:!!editor.completedAt,completedAt:editor.completedAt,canConfirm:editor.canConfirm!==false,missing,rows,status:editor.supplementStatus==='stale'?'stale':Object.values(missing).some(Boolean)?'missing':'complete',supplementStatus:editor.supplementStatus,staleReasons:editor.staleReasons || []};
}
export {historyNeedsFacts} from './playerHistoryPolicy.mjs';
