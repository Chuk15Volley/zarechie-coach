import {coachDate} from '../lib/coachPresentation.mjs';
import {coachNumber} from '../lib/coachOrderPresentation.mjs';
export default function WeightProvenance({name,evidence}){
 if(!evidence)return null;
 return <details className="coach-weight-provenance"><summary>Источник рабочего веса · {evidence.date?coachDate(evidence.date):'дата не записана'}</summary><p>{name} · кг {evidence.loadUnits===2?'каждого снаряда из пары':'одного снаряда'} · повторы {evidence.repEvidence?.perSide?'суммарно с обеих сторон':'как записаны в журнале'}</p>{evidence.loggedSets?.length?<ol>{evidence.loggedSets.map((set,index)=><li key={index}>Подход {index+1}: {coachNumber(set.kg)} кг × {coachNumber(set.reps)}</li>)}</ol>:<p>Точные подходы в этом снимке не сохранены. Откройте историю выполнения.</p>}<p>RPE упражнения: {evidence.rpeScope==='exercise'?evidence.rpe ?? 'не записан':'не записан'}{evidence.rpeScope!=='exercise' && evidence.rpe!=null?` · RPE ${evidence.rpeScope==='block'?'блока':'занятия'} ${evidence.rpe} не заменяет RPE упражнения`:''}. История относится только к этому варианту и количеству снарядов.</p></details>;
}
