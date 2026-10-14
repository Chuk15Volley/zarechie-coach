import {validFactPeriod} from '../lib/factPeriod.mjs';
import {useState} from 'react';
import {periodFacts} from '../lib/coachAuditPresentation.mjs';
import FactPeriod from './FactPeriod';
const shift=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export default function PeriodComparison({points=[],scope=''}){
 const first=points[0]?.date || new Date().toISOString().slice(0,10),last=points.at(-1)?.date || first;
 const [a,setA]=useState(()=>({from:first,to:shift(last,-14)<first?first:shift(last,-14)})),[b,setB]=useState(()=>({from:shift(last,-13)<first?first:shift(last,-13),to:last}));
 const valid=validFactPeriod(a.from,a.to) && validFactPeriod(b.from,b.to);
 const overlap=a.from<=b.to && b.from<=a.to;
 return <details className="coach-period-comparison"><summary>Сравнить два периода · полнота кг / повторов / RPE</summary><p>{scope}. Сравнение выбранного точного варианта и рабочего подхода, только в загруженной истории.</p><div className="coach-source-comparison"><section><h4>Первый период</h4><FactPeriod value={a} onChange={setA}/></section><section><h4>Второй период</h4><FactPeriod value={b} onChange={setB}/></section></div>{overlap && <p>Периоды пересекаются: одни записи попадут в обе колонки.</p>}{valid && <table><thead><tr><th>Записи выбранного варианта</th><th>Первый период</th><th>Второй период</th></tr></thead><tbody>{['observations','kg','reps','rpe'].map(key=><tr key={key}><th>{{observations:'Подтверждённые наблюдения',kg:'Записаны кг',reps:'Записаны повторы',rpe:'Записан RPE упражнения'}[key]}</th>{[a,b].map((period,i)=><td key={i}>{periodFacts(points,period)[key]}</td>)}</tr>)}<tr><th>Последний точный факт</th>{[a,b].map((period,i)=>{const p=periodFacts(points,period).latest;return <td key={i}>{p?`${p.date}: ${p.kg ?? '—'} кг × ${p.reps ?? '—'} · RPE ${p.rpe ?? '—'}`:'Нет наблюдений'}</td>;})}</tr></tbody></table>}<p>Разная доза и локальные адаптации требуют отдельного разбора. Пропуски не заменяются нулями; изменение силы по этим значениям не рассчитывается.</p></details>;
}
