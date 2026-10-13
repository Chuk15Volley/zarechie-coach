import {isAuthorized,coachAuditActor} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {validWorkspace} from '../../../lib/teamQueue.mjs';
import {loadStrengthInventory,saveStrengthInventory} from '../../../lib/strengthInventoryStore';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const input=req.method==='GET'?req.query:req.body || {},workspace=input.workspace;if(!validWorkspace(workspace))return res.status(400).json({error:'Некорректное пространство.'});
 if(!await enforceRateLimit(req,res,{scope:'strength-equipment',limit:120,windowSeconds:600}))return;
 try{const context=await loadStrengthInventory(workspace);if(req.method==='GET')return res.status(200).json({equipment:context.equipment,settings:context.settings,fingerprint:context.fingerprint,revision:context.metadata?.revision || null,savedAt:context.metadata?.savedAt || null});
  return res.status(200).json({...await saveStrengthInventory(context,input,coachAuditActor(req)),regenerateStrengthDrafts:true});
 }catch(error){return res.status(error.status || 503).json({error:error.status?error.message:'Не удалось прочитать или сохранить инвентарь. Правки оставлены на экране.'});}
}
