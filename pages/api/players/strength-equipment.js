import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { pfx } from '../../../lib/workspacePrefix';
import { normalizeStrengthEquipment, validStrengthEquipment } from '../../../lib/strengthEquipment.mjs';
export default async function handler(req,res) {
  if (!isAuthorized(req)) return res.status(401).json({error:'Unauthorized'});
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const workspace=(req.method==='GET'?req.query.workspace:req.body?.workspace)==='nkperf'?'nkperf':'zarechie';
  const key=`${pfx(workspace)}:strength:equipment`;
  try {
    if(req.method==='POST') {
      if (!validStrengthEquipment(req.body?.equipment)) return res.status(400).json({error:'Укажите до 200 положительных весов на снаряд через точку с запятой; дробные кг — через точку.'});
      const equipment=normalizeStrengthEquipment(req.body?.equipment);
      await redis('set',key,JSON.stringify(equipment));
      return res.status(200).json({ok:true,equipment});
    }
    const raw=await redis('get',key);
    return res.status(200).json({equipment:normalizeStrengthEquipment(typeof raw==='string'?JSON.parse(raw):raw)});
  } catch { return res.status(503).json({error:'Не удалось прочитать или сохранить инвентарь.'}); }
}
