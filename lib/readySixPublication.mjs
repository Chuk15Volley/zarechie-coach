import crypto from 'node:crypto';
function stable(value) {
  if(Array.isArray(value))return value.map(stable);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>!['generatedAt','fetchedAt','capturedAt'].includes(key)).map(key=>[key,stable(value[key])]));
  return value;
}
// Store a digest, never another copy of the medical source or a new readiness score.
export function readySixPublicationCheck(snapshot, restrictions) {
  if(!snapshot?.readySixMeta || !snapshot.readySixDecision)return null;
  const fields=['targetDate','readySixDecision','readySixCalendar','readySixPlanning','morning','surveys','postMorningSurveys','injuryLog','annotations','manual','overtraq','overtraqHistory'];
  const context=Object.fromEntries(fields.map(key=>[key,snapshot[key] ?? null]));
  return crypto.createHash('sha256').update(JSON.stringify(stable({...context,restrictions:restrictions || []}))).digest('hex');
}

const sections={
  permission:{label:'Допуск и рекомендации',fields:['readySixDecision']},
  questionnaires:{label:'Анкеты и жалобы',fields:['morning','surveys','postMorningSurveys','overtraq','overtraqHistory']},
  medical:{label:'Медицинские записи и отметки',fields:['injuryLog','annotations','manual']},
  calendar:{label:'Матчи, площадка и поездки',fields:['targetDate','readySixCalendar','readySixPlanning','chronicSurveys','chronicPostMorningSurveys']},
  restrictions:{label:'Запреты тренера',fields:[]},
};
// Section hashes explain where a change occurred without retaining medical answers.
export function readySixPublicationState(snapshot,restrictions){
  const digest=readySixPublicationCheck(snapshot,restrictions);if(!digest)return null;
  const hashes=Object.fromEntries(Object.entries(sections).map(([key,section])=>[key,crypto.createHash('sha256').update(JSON.stringify(stable(key==='restrictions'?restrictions || []:Object.fromEntries(section.fields.map(field=>[field,snapshot[field] ?? null]))))).digest('hex')]));
  return {version:1,digest,sections:hashes};
}
export function readySixPublicationChanges(previous,current,previousDigest){
  if(!current || !(previous?.digest || previousDigest))return {status:'unknown',changes:[],message:'Нет подтверждённого снимка для сравнения. Обновите черновик и проверьте его заново.'};
  if((previous?.digest || previousDigest)===current.digest && (!previous?.sections || Object.keys(sections).every(key=>previous.sections[key]===current.sections[key])))return {status:'unchanged',changes:[],message:'Данные ReadySix совпадают с данными черновика.'};
  const changes=previous?.version===1 && previous?.sections?Object.entries(sections).filter(([key])=>previous.sections[key]!==current.sections[key]).map(([key,{label}])=>({key,label})):[];
  return {status:'changed',changes,message:changes.length?'Изменились: '+changes.map(item=>item.label.toLowerCase()).join('; ')+'. Обновите черновик и проверьте его заново.':'ReadySix изменился. Для детализации старого черновика требуется новый подбор.'};
}
