import {isAuthorized} from '../../../lib/auth';
import {validCoachDate} from '../../../lib/coachAuditQuery.mjs';
import {loadGymFacts} from '../../../lib/gymLoadStore';
import {strengthSessionCompletion} from '../../../lib/strengthCompletion.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const {workspace,playerId,date}=req.query;
 if(!['zarechie','nkperf'].includes(workspace) || typeof playerId!=='string' || !/^[\w-]{1,100}$/.test(playerId) || !validCoachDate(date))return res.status(400).json({error:'Некорректный игрок или дата.'});
 try{const [facts]=await loadGymFacts(workspace,[{playerId,date}]);if(!facts)return res.status(200).json({execution:null});
 const completion=strengthSessionCompletion(facts.record,facts.rawActual,facts.rawLog),totalSets=facts.record.session.blocks.reduce((sum,block)=>sum+(block.exercises || []).reduce((s,ex)=>s+(ex.targetSets?.length || 0),0),0);
 return res.status(200).json({execution:{...completion,totalSets,savedAt:facts.record.savedAt || facts.record.generatedAt || null,date}});
 }catch{return res.status(503).json({error:'Не удалось проверить выполнение. Обновите статус.'});}
}
