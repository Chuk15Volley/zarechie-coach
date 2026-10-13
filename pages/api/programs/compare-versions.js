import {isAuthorized} from '../../../lib/auth';
import {redis} from '../../../lib/redis';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {validWorkspace} from '../../../lib/teamQueue.mjs';
import {sessionKey} from '../../../lib/workspacePrefix';
import {validCoachDate} from '../../../lib/coachAuditQuery.mjs';
import {coachProgramVersion,compareCoachPrograms} from '../../../lib/coachProgramVersions.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const {workspace,playerId,date,before,after}=req.query;
  if(!validWorkspace(workspace) || typeof playerId!=='string' || !/^[\w-]{1,100}$/.test(playerId) || !validCoachDate(date) || [before,after].some(id=>id!=null && (typeof id!=='string' || !/^[a-f0-9]{64}$/.test(id))))return res.status(400).json({error:'Некорректный игрок, дата или версия.'});
  if(!await enforceRateLimit(req,res,{scope:'coach-program-versions',limit:120,windowSeconds:600}))return;
  try{
    const key=sessionKey(workspace,playerId,date),[current,raws]=await Promise.all([redis('get',key),redis('lrange',key+':versions',0,9)]),records=[current,...raws].filter(Boolean).map(raw=>typeof raw==='string'?JSON.parse(raw):raw).filter(record=>record?.session?.blocks);
    const versions=[...new Map(records.map(record=>{const version=coachProgramVersion(record);return [version.id,version];}).reverse()).values()].reverse();
    if(!before && !after)return res.status(200).json({versions});
    const a=versions.find(version=>version.id===before),b=versions.find(version=>version.id===after);
    if(!a || !b)return res.status(404).json({error:'Версия уже недоступна. Обновите список версий.'});
    return res.status(200).json({comparison:compareCoachPrograms(a,b)});
  }catch{return res.status(503).json({error:'Не удалось загрузить версии. Повторите загрузку.'});}
}
