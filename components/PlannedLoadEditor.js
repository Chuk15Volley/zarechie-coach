import {useEffect,useRef,useState} from 'react';
import {isPairableFreeWeightExercise,loadUnitsForExercise} from '../lib/tonnage';
import {repeatedPlannedSets} from '../lib/plannedLoadEditor.mjs';

function PlannedWeight({code,value,onChange}){
 const [raw,setRaw]=useState(value==null?'':String(value)),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setRaw(value==null?'':String(value));},[value]);
 return <input type="text" inputMode="decimal" aria-label={`${code} · плановый вес в кг`} value={raw} placeholder="Не задан" onFocus={event=>{focused.current=true;event.target.select();}} onChange={event=>{const next=event.target.value;if(!/^\d*(?:[.,]\d*)?$/.test(next))return;setRaw(next);if(next==='')onChange(null);else if(Number.isFinite(Number(next.replace(',','.'))))onChange(Number(next.replace(',','.')));}} onBlur={()=>{focused.current=false;setRaw(value==null?'':String(value));}}/>;
}

export default function PlannedLoadEditor({code,name,sets,weightKg,targetRpeMax,loadUnits,onChangeSet,onChangeSets,onAddSet,onRemoveSet,onChangeWeightKg,onChangeTargetRpeMax,onChangeLoadUnits}){
 const [repeat,setRepeat]=useState('');
 const pairable=isPairableFreeWeightExercise(name),units=loadUnitsForExercise({name,loadUnits});
 const apply=()=>{if(repeat.trim())onChangeSets(repeatedPlannedSets(sets,repeat));};
 return <section className="coach-quick-plan" aria-label={`Плановая нагрузка ${code}`}>
  <div className="coach-quick-load-row"><label><span>{pairable?'Кг одного снаряда':'Вес, кг'}</span><PlannedWeight code={code} value={weightKg} onChange={onChangeWeightKg}/></label>
  {pairable && <fieldset className="coach-implement-choice"><legend>Количество снарядов</legend><div>{[1,2].map(n=><button key={n} type="button" aria-label={`${code} · ${n} ${n===1?'снаряд':'снаряда'}`} aria-pressed={units===n} onClick={()=>onChangeLoadUnits(n)}>{n}</button>)}</div><small>{weightKg!=null?`${weightKg} кг × ${units}`:'Вес каждого снаряда'}</small></fieldset>}
  <label><span>Целевой RPE ≤</span><input type="number" inputMode="decimal" step="0.5" min="1" max="10" aria-label={`${code} · целевой RPE упражнения`} value={targetRpeMax ?? ''} onChange={event=>onChangeTargetRpeMax(event.target.value===''?null:Number(event.target.value))} placeholder="Не задан"/></label></div>
  <div className="coach-quick-sets-heading"><span>Повторы / время · подходов: {sets.length}</span><label><span className="sr-only">Одинаково во всех подходах {code}</span><input aria-label={`${code} · повторы всем подходам`} value={repeat} onChange={event=>setRepeat(event.target.value)} placeholder="Всем подходам" onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();apply();}}}/></label><button type="button" disabled={!repeat.trim()} onClick={apply}>Применить всем</button></div>
  <div className="coach-set-inputs" aria-label="Редактирование подходов">{sets.map((set,index)=><div key={index}><span>{index+1}</span><input aria-label={`${code} · подход ${index+1} · повторы или время`} value={set} onFocus={event=>event.target.select()} onChange={event=>onChangeSet(index,event.target.value)} placeholder="—"/>{sets.length>1 && <button type="button" aria-label={`Удалить подход ${index+1}`} onClick={()=>onRemoveSet(index)}>×</button>}</div>)}<button type="button" aria-label={`${code} · добавить подход`} onClick={onAddSet}>＋</button></div>
 </section>;
}
