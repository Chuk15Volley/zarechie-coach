import {commentRpe} from '../lib/coachPresentation.mjs';
// Planned prescription only. Never derive RPE from a session score or invent kg.
export default function ExercisePrescription({weightKg,sets=[],targetRpeMax,loadUnits=1,compact=false,weightNote}) {
 const known=weightKg!=null && weightKg!=='' && Number.isFinite(Number(weightKg)) && Number(weightKg)>=0;
 const rpe=Number(targetRpeMax),knownRpe=targetRpeMax!=null && Number.isFinite(rpe) && rpe>=1 && rpe<=10;
 return <dl className={'coach-prescription'+(compact?' coach-prescription--compact':'')} aria-label="Плановая нагрузка">
  <div><dt>Вес{loadUnits===2?' / снаряд':''}</dt><dd>{known?<>{Number(weightKg).toLocaleString('ru-RU')} <small>кг</small></>:<span className="coach-value-missing">По RPE</span>}</dd></div>
  <div><dt>{sets.length} подх. · повторы / время</dt><dd className="coach-prescription-sets" aria-label={sets.length?sets.join(' / '):'Задание не задано'}>{sets.length?sets.map((set,index)=><span key={index} className="coach-prescription-part"><span className="coach-prescription-set" data-long={String(set).length>26}>{set}</span>{index<sets.length-1 && <span className="coach-prescription-separator"> / </span>}</span>):'—'}</dd></div>
  <div><dt>Целевой RPE</dt><dd>{knownRpe?<>≤ {rpe.toLocaleString('ru-RU')}</>:<span className="coach-value-missing">{commentRpe(weightNote,targetRpeMax)?`${commentRpe(weightNote,targetRpeMax)} · из комментария`:'Не задан'}</span>}</dd></div>
 </dl>;
}
