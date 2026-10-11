import {isAuthorized} from '../../../lib/auth';
import {redis} from '../../../lib/redis';
import {getPlayerInfo} from '../../../lib/playerData';
import {getPlayerTimeZone,playerTimeZoneKey} from '../../../lib/playerTimeZoneStore';
import {validPlayerTimeZone,playerLocalDate} from '../../../lib/playerTimeZone.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const input=req.method==='GET'?req.query:req.body||{};
 const playerId=String(input.playerId||'');const workspace=input.workspace;
 if(workspace!=='nkperf'||!playerId||playerId.length>120)return res.status(400).json({error:'Выберите игрока NK Pro.'});
 if(req.method==='POST'&&!validPlayerTimeZone(input.timeZone))return res.status(400).json({error:'Выберите действительный часовой пояс.'});
 try{
  if(req.method==='POST'){
   if(!await getPlayerInfo(playerId,workspace))return res.status(404).json({error:'Игрок не найден.'});
   await redis('set',playerTimeZoneKey(workspace,playerId),JSON.stringify({timeZone:input.timeZone,updatedAt:new Date().toISOString()}));
  }
  const timeZone=await getPlayerTimeZone(playerId,workspace);
  return res.status(200).json({timeZone,today:playerLocalDate(timeZone)});
 }catch{return res.status(503).json({error:'Не удалось сохранить часовой пояс. Повторите попытку.'});}
}
