import {createHash} from 'node:crypto';
// Opaque identity only: no notes, questionnaire or player information in events.
// Any changed generation input creates a different retry family.
export function generationScope(request){
 if(!['zarechie','nkperf'].includes(request?.workspace || 'zarechie') || !request?.playerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(request.date)))return null;
 const canonical=value=>Array.isArray(value)?value.map(canonical):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const ignored=new Set(['teamQueueId','autoSave']);
 const source=Object.fromEntries(Object.entries({...request,workspace:request.workspace || 'zarechie',playerId:String(request.playerId)}).filter(([key])=>!ignored.has(key)));
 return createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex');
}
export function successfulGenerationRetry(event,events){
 return events.filter(next=>next.code==='PREPARED' && Date.parse(next.at)>=Date.parse(event.at) && (next.batchId===event.batchId || event.scopeKey && next.scopeKey===event.scopeKey)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0] || null;
}
