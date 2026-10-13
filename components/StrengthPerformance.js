import {useEffect,useId,useRef,useState} from 'react';
import {performancePoints,performanceChartGeometry} from '../lib/strengthPerformance.mjs';
const format = value => value == null ? '—' : Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2});
const dateLabel = date => date.slice(8,10)+'.'+date.slice(5,7);
const chains = {full_body:'Общая силовая',anterior_chain:'Передняя цепь',posterior_chain:'Задняя цепь'};
function MetricChart({points,metric,title,unit}) {
  const id=useId(),width=Math.max(260,points.length*27+50),height=150,{min,max,coordinates,segments}=performanceChartGeometry(points,metric,width,height);
  const known=coordinates.filter(Boolean),latest=known.at(-1),missing=points.length-known.length;
  const plot=useRef(null),[overflow,setOverflow]=useState(false);
  useEffect(()=>{const element=plot.current;if(!element)return;const resize=()=>{const clipped=element.scrollWidth>element.clientWidth+1;setOverflow(clipped);if(clipped)element.scrollLeft=element.scrollWidth;};resize();const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(element);return()=>observer?.disconnect();},[width,points]);
  return <figure className={'coach-fact-metric coach-fact-metric-'+metric}>
    <figcaption><span>{title}</span><strong>{format(latest?.value)} <small>{unit}</small></strong><p>{latest?`Последняя запись · ${dateLabel(points[latest.index].date)}`:'Факт не записан'} · пропуски {missing}/{points.length}</p></figcaption>
    <div className="coach-fact-plot" ref={plot} tabIndex={overflow?0:undefined} aria-label={overflow?`${title}: последние даты справа, график можно прокрутить`:undefined}><svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:width}} role="img" aria-labelledby={id}>
      <title id={id}>{title}: {known.length} записей, {missing} пропусков. Точные значения в таблице ниже.</title>
      {(metric==='rpe'?[1,5,10]:[min,(max+min)/2,max]).map((value,index)=>{const y=16+(max-value)/(max-min)*(height-42);return <g key={index}><line x1="36" x2={width-16} y1={y} y2={y} className="coach-fact-grid"/><text x="2" y={y+4} className="coach-fact-axis">{format(value)}</text></g>;})}
      {segments.filter(segment=>segment.length>1).map((segment,index)=><polyline key={index} points={segment.map(p=>`${p.x},${p.y}`).join(' ')} className="coach-fact-line"/>)}
      {coordinates.map((point,index)=>point?<circle key={index} cx={point.x} cy={point.y} r="4" className={points[index].adapted?'coach-fact-dot is-adapted':'coach-fact-dot'}><title>{points[index].date}: {format(point.value)} {unit}{points[index].adapted?' · локальная адаптация':''}</title></circle>:<g key={index} className="coach-fact-gap"><path d={`M ${38+index*(width-60)/Math.max(1,points.length-1)-3} ${height-29} l 6 6 m -6 0 l 6 -6`}/><title>{points[index].date}: {points[index].gap || 'Значение не записано'}</title></g>)}
      {points.map((point,index)=><text key={point.date} x={38+index*(width-60)/Math.max(1,points.length-1)} y={height-5} textAnchor="middle" className="coach-fact-axis">{dateLabel(point.date)}</text>)}
    </svg></div>{overflow && <p className="coach-fact-scroll-hint">Последние даты справа · прокрутка ↔</p>}
  </figure>;
}
export default function StrengthPerformance({series=[],onOpenDate,scope='Загруженные занятия',stale=false}) {
  const [selected,setSelected]=useState(''),[setIndex,setSetIndex]=useState(0),id=useId();
  const row=series.find(row=>row.key===selected) || series[0],maxSets=Math.max(1,...(row?.observations || []).map(point=>point.sets?.length || 0)),activeSet=Math.min(setIndex,maxSets-1),points=performancePoints(row,activeSet);
  return <section className="coach-fact-studio" aria-label="Графики фактических кг, повторов и RPE">
    <header><div><p className="coach-overview-eyebrow">ФАКТ / ОСНОВНЫЕ ДВИЖЕНИЯ</p><h3>Работа в цифрах</h3><p>{scope}. Только подтверждённое выполнение; плановые значения сюда не подставляются.</p></div><span className="coach-studio-badge">{stale?'История требует обновления':`Вариантов: ${series.length}`}</span></header>
    {!row?<p className="coach-fact-empty">Пока нет подтверждённых фактов основных A1 / B1 / B2 силовой. После полного выполнения появятся наблюдения; отсутствующие кг, повторы и RPE останутся пропусками.</p>:<>
      <div className="coach-fact-controls"><label htmlFor={id+'-lift'}>Точный вариант<select id={id+'-lift'} value={row.key} onChange={event=>{setSelected(event.target.value);setSetIndex(0);}}>{series.map(item=><option key={item.key} value={item.key}>{item.code} · {item.name} · {chains[item.trainingType] || item.trainingType}{item.loadUnits===2?' · пара':''}{item.perSide?' · на сторону':''}</option>)}</select></label><label htmlFor={id+'-set'}>Рабочий подход<select id={id+'-set'} value={activeSet} onChange={event=>setSetIndex(Number(event.target.value))}>{Array.from({length:maxSets},(_,index)=><option key={index} value={index}>Подход {index+1}</option>)}</select></label></div>
      <p className="coach-fact-caption">Кг {row.loadUnits===2?'одного снаряда из пары':'одного снаряда'} · повторы {row.perSide?'на сторону':'за подход'} · RPE всего упражнения, не занятия. × — пропуск, золотая точка — адаптация. Линия не соединяет пропуски и адаптации.</p>
      <div className="coach-fact-charts"><MetricChart points={points} metric="kg" title="Выполненный вес" unit="кг"/><MetricChart points={points} metric="reps" title="Выполненные повторы" unit={row.perSide?'на сторону':'повт.'}/><MetricChart points={points} metric="rpe" title="RPE упражнения" unit="/ 10"/></div>
      <details className="coach-fact-details"><summary>Точные значения и пропуски · {points.length} занятий</summary><div className="coach-fact-table"><table><caption>Подход {activeSet+1} · {row.name}</caption><thead><tr><th>Дата</th><th>Кг</th><th>Повторы{row.perSide?' / сторона':''}</th><th>RPE упражнения</th><th>Полнота факта</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><td>{onOpenDate?<button type="button" onClick={()=>onOpenDate(point.date)} aria-label={'Открыть программу '+point.date}>{point.date} ↗</button>:point.date}</td><td>{format(point.kg)}</td><td>{format(point.reps)}</td><td>{format(point.rpe)}</td><td>{[point.gap,!point.gap && point.kg==null?'Кг не записаны':'',!point.gap && point.reps==null?'Повторы не записаны':'',!point.gap && point.rpe==null?'RPE не записан':'',point.adapted?'Локальная адаптация':'',point.supplementStatus==='applied'?'Дополнение тренера учтено':point.supplementStatus==='stale'?'Старое дополнение не применяется':''].filter(Boolean).join(' · ') || 'Записано'}</td></tr>)}</tbody></table></div></details>
      <p className="coach-fact-caption">Показаны наблюдения одного варианта. Изменение дозы, повторов или адаптация могут менять RPE; график не оценивает прирост силы и не меняет прогрессию.</p>
    </>}
  </section>;
}
