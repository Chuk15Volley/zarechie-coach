// Projection only: a separately coach-saved program can finish this player's day.
// A program predating the prepared draft does not hide an intentional new correction.
export function teamSessionIds(playerId){const id=String(playerId).replace(/^whoop_/,'');return /^\d+$/.test(id)?[id,`whoop_${id}`]:[String(playerId)];}
export function savedProgramForTeamDay(queue,player,job,records){
 if(!job || job.status!=='done' || job.workspace!==queue.workspace || job.teamQueueId!==queue.id || !teamSessionIds(job.playerId).includes(String(player.playerId)))return null;
 const prepared=Date.parse(job.completedAt || job.generatedAt || queue.createdAt);
 if(!Number.isFinite(prepared))return null;
 return records.filter(record=>record && record.draft!==true && (Array.isArray(record.session?.blocks) || record.session?.teamGeneration?.batchId===player.batchId) && (!record.date || record.date===queue.date) && Number.isFinite(Date.parse(record.savedAt)) && Date.parse(record.savedAt)>=prepared).sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt))[0] || null;
}
