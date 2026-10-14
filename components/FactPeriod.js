import {calendarToday} from '../lib/coachCalendar.mjs';
import {factPeriod,validFactPeriod} from '../lib/factPeriod.mjs';
export default function FactPeriod({value,onChange,disabled=false}) {
 return <div className="coach-fact-period" role="group" aria-label="Период фактических данных">
  <div className="coach-overview-filters">{[28,90,180].map(days=>{const range=factPeriod(days);return <button type="button" key={days} disabled={disabled} aria-pressed={value.from===range.from && value.to===range.to} onClick={()=>onChange(range)}>{days} дней</button>;})}</div>
  <label>С<input type="date" aria-label="Начало периода фактов" value={value.from} max={value.to} disabled={disabled} onChange={event=>onChange({...value,from:event.target.value})}/></label><label>По<input type="date" aria-label="Конец периода фактов" value={value.to} min={value.from} max={calendarToday()} disabled={disabled} onChange={event=>onChange({...value,to:event.target.value})}/></label>
  {!validFactPeriod(value.from,value.to) && <p role="alert">Выберите действительные даты: от 1 до 366 дней.</p>}
 </div>;
}
