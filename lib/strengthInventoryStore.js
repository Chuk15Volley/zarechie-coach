import {createHash,randomUUID} from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {queuePrefix} from './teamQueue.mjs';
import {normalizeStrengthEquipment} from './strengthEquipment.mjs';
import {strengthInventorySetup} from './strengthInventorySetup.mjs';
import {coachAuditCommands} from './coachAudit.mjs';
const parse=value=>value?typeof value==='string'?JSON.parse(value):value:null;
const error=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export async function loadStrengthInventory(workspace){
 const key=queuePrefix(workspace)+':strength:equipment',keys=[key,key+':settings'],raws=await Promise.all(keys.map(key=>redis('get',key))),metadata=parse(raws[1]);
 return {keys,raws,equipment:normalizeStrengthEquipment(parse(raws[0]) || {}),metadata,settings:metadata?.settings || {},fingerprint:createHash('sha256').update(JSON.stringify(raws)).digest('hex')};
}
export const SAVE_INVENTORY_SCRIPT=`for i=1,#KEYS do if (redis.call('GET',KEYS[i]) or '')~=ARGV[i] then return 0 end end; local cmds=cjson.decode(ARGV[#KEYS+1]); for _,cmd in ipairs(cmds) do redis.call(unpack(cmd)) end; return 1`;
export async function saveStrengthInventory(context,{workspace,setup,fingerprint,requestId},actor){
 if(typeof requestId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))error('Перечитайте инвентарь перед сохранением.',400);
 const normalized=strengthInventorySetup(setup);if(normalized.error)error(normalized.error,400);
 const requestHash=createHash('sha256').update(JSON.stringify([fingerprint,normalized])).digest('hex');
 if(context.metadata?.requestId===requestId){if(context.metadata.requestHash!==requestHash)error('Запрос сохранён с другими данными. Перечитайте инвентарь.');return {replayed:true,revision:context.metadata.revision};}
 if(fingerprint!==context.fingerprint)error('Инвентарь изменён в другом окне. Перечитайте настройки перед сохранением.');
 const savedAt=new Date().toISOString(),revision=randomUUID(),metadata={version:1,revision,savedAt,actor,settings:normalized.settings,requestId,requestHash};
 const commands=[['SET',context.keys[0],JSON.stringify(normalized.equipment)],['SET',context.keys[1],JSON.stringify(metadata)],['SET',queuePrefix(workspace)+':strength:equipment-updated',JSON.stringify({revision,savedAt})],['LPUSH',context.keys[1]+':versions',JSON.stringify({metadata,equipment:normalized.equipment})],['LTRIM',context.keys[1]+':versions',0,19],...coachAuditCommands(workspace,{type:'equipment_changed',scopeLabel:'Инвентарь пространства',revision,previousRevision:context.metadata?.revision || null,actor,beforeEquipment:context.equipment,afterEquipment:normalized.equipment,at:savedAt})];
 const [saved]=await redisPipeline([['EVAL',SAVE_INVENTORY_SCRIPT,context.keys.length,...context.keys,...context.raws.map(value=>value || ''),JSON.stringify(commands)]]);
 if(Number(saved)!==1)error('Инвентарь изменился во время сохранения. Настройки не перезаписаны.');return {replayed:false,revision};
}
