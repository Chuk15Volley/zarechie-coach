import {strengthSessionCompletion} from './strengthCompletion.mjs';
import {selectGymEdition} from './gymEdition.mjs';
const parse=value=>{if(!value)return null;return typeof value==='string'?JSON.parse(value):value;};
// Use the same alias edition selection and original execution evidence as history.
export function completedProgramSnapshot(ids,raws){
 const candidates=ids.map((id,index)=>{const [record,rawActual,rawLog]=raws.slice(index*3,index*3+3).map(parse);return {record,rawActual,rawLog,sourcePlayerId:id};});
 const edition=selectGymEdition(candidates);
 return edition?strengthSessionCompletion(edition.record,edition.rawActual,edition.rawLog).completed:false;
}
// Compare exact raw bytes atomically with all program/result writes; a completion
// or edition change during validation must reject, never erase original evidence.
export const SAVE_UNEXECUTED_PROGRAM = `
for i=1,#KEYS do
 if (redis.call('GET',KEYS[i]) or '')~=ARGV[i+1] then return 0 end
end
local cmds=cjson.decode(ARGV[1]); for _,cmd in ipairs(cmds) do redis.call(unpack(cmd)) end; return 1
`;
