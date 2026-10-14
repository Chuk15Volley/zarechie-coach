import {techniqueSignature} from '../../../lib/coachAuditPresentation.mjs';
import {isAuthorized,coachAuditActor} from '../../../lib/auth';
import {redis} from '../../../lib/redis';
import {coachLibraryCards} from '../../../lib/coachLibraryCatalogue';
import {materialVersion,reviewKey,reviewView,APPEND_TECHNIQUE_REVIEW} from '../../../lib/techniqueReview.mjs';
export default async function handler(req,res){
 if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!['GET','POST'].includes(req.method))return res.status(405).end();
 res.setHeader('Cache-Control','no-store');
 const id=req.method==='GET'?req.query.id:req.body?.id;
 if(typeof id!=='string' || !id.length || id.length>300)return res.status(400).json({error:'Некорректное упражнение'});
 try{
 const card=(await coachLibraryCards()).find(card=>card.canonicalId===id);
 if(!card)return res.status(404).json({error:'Упражнение больше не доступно'});
 const expectedSignature=req.method==='GET'?req.query.signature:req.body?.signature;
 if(expectedSignature!==techniqueSignature(card))return res.status(409).json({error:'Материал каталога изменился. Обновите каталог перед проверкой.'});
 const version=materialVersion(card),key=reviewKey(id),read=async()=>{const rows=await redis('lrange',key,0,99);return (Array.isArray(rows)?rows:[]).map(row=>typeof row==='string'?JSON.parse(row):row);};
 const events=await read(),view=reviewView(events,version);
 if(req.method==='GET')return res.status(200).json(view);
 const {type,verified,version:expectedVersion,revision}=req.body || {};
 if(!['description','video'].includes(type) || typeof verified!=='boolean' || !Number.isSafeInteger(revision) || revision<0)return res.status(400).json({error:'Некорректная отметка'});
 if(expectedVersion!==version || revision!==view.revision)return res.status(409).json({error:'Материал или журнал изменился. Обновите карточку перед подтверждением.'});
 if(type==='video' && !(card.video || card.autoVideo))return res.status(400).json({error:'Видео не добавлено'});
 const event={revision:revision+1,type,verified,version,at:new Date().toISOString(),actor:coachAuditActor(req)};
 const ok=await redis('eval',APPEND_TECHNIQUE_REVIEW,1,key,String(revision),JSON.stringify(event));
 if(Number(ok)!==1)return res.status(409).json({error:'Другой тренер обновил журнал. Повторно откройте карточку.'});
 return res.status(200).json(reviewView([event,...events].slice(0,100),version));
 }catch{return res.status(503).json({error:'Журнал проверки недоступен. Подтверждение не сохранено; обновите карточку.'});}
}
