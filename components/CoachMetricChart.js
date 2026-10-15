import {metricMissingLabel,factDisplayDate} from '../lib/coachPolish.mjs';
import {useEffect,useId,useRef,useState} from 'react';
import {performanceChartGeometry} from '../lib/strengthPerformance.mjs';
import {chartDateIndices,chartKeyIndex,nearestChartIndex,chartObservationCounts} from '../lib/coachVisualCharts.mjs';
const format=v=>v==null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const date=d=>d.slice(8,10)+'.'+d.slice(5,7);
export default function CoachMetricChart({points,metric,title,unit}){
 const id=useId(),plot=useRef(null),[overflow,setOverflow]=useState(false),[active,setActive]=useState(null);
 const width=Math.max(260,points.length*27+50),height=150,{min,max,coordinates,segments}=performanceChartGeometry(points,metric,width,height);
 const signature=JSON.stringify(points.map(p=>[p.date,p[metric],p.adapted,p.gap])),known=coordinates.filter(Boolean),latest=known.at(-1),{notPerformed,missing}=chartObservationCounts(points,metric);
 useEffect(()=>{setActive(null);const el=plot.current;if(!el)return;const resize=()=>{const clipped=el.scrollWidth>el.clientWidth+1;setOverflow(clipped);if(clipped)el.scrollLeft=el.scrollWidth;};resize();const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(el);return()=>observer?.disconnect();},[width,signature]);
 const current=active==null?null:points[active],point=active==null?null:coordinates[active],x=active==null?null:38+active*(width-60)/Math.max(1,points.length-1);
 const description=current?`${date(current.date)} · ${point?format(point.value)+' '+unit:current.gap || 'Значение не записано'}${current.adapted?' · локальная адаптация':''}`:'';
 function select(index){setActive(index);const el=plot.current;if(!el || index==null)return;const px=38+index*(width-60)/Math.max(1,points.length-1);if(px<el.scrollLeft+40)el.scrollLeft=Math.max(0,px-40);else if(px>el.scrollLeft+el.clientWidth-24)el.scrollLeft=px-el.clientWidth+24;}
 return <figure className={'coach-fact-metric coach-fact-metric-'+metric} data-chart-state={known.length===0?'empty':known.length===1?'single':'series'}>
  <figcaption><span>{title}</span><strong>{format(latest?.value)} <small>{unit}</small></strong><p>{latest?`Последняя запись · ${date(points[latest.index].date)}`:'Факт не записан'} · {metricMissingLabel(metric)}: {missing}{notPerformed>0?` · не выполнялось ${notPerformed}`:''}</p></figcaption>
  <div className="coach-chart-canvas">
   {known.length>0?<div className="coach-fact-plot" ref={plot} tabIndex={0} role="group" aria-label={`${title}: стрелки — выбрать дату, Home и End — первая и последняя запись`} aria-describedby={id+'-readout'} onFocus={()=>setActive(latest.index)} onBlur={()=>setActive(null)} onPointerLeave={e=>{if(!e.currentTarget.contains(document.activeElement))setActive(null);}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();select(chartKeyIndex(e.key,active,points.length));}else if(e.key==='Escape'){e.preventDefault();setActive(null);}}}>
    <svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:width}} role="img" aria-labelledby={id} onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();setActive(nearestChartIndex((e.clientX-rect.left)/rect.width*width,points.length,width));}} onPointerDown={e=>{const rect=e.currentTarget.getBoundingClientRect();setActive(nearestChartIndex((e.clientX-rect.left)/rect.width*width,points.length,width));}}>
     <title id={id}>{title}: {known.length} записей, {missing} незаписанных значений, {notPerformed} без этого варианта. Точные значения в таблице ниже.</title>
     {(metric==='rpe'?[1,5,10]:[min,(max+min)/2,max]).map((v,i)=>{const y=16+(max-v)/(max-min)*(height-42);return <g key={i}><line x1="36" x2={width-16} y1={y} y2={y} className="coach-fact-grid"/><text x="2" y={y+4} className="coach-fact-axis">{format(v)}</text></g>;})}
     {segments.filter(s=>s.length>1).map((s,i)=><polyline key={i} points={s.map(p=>`${p.x},${p.y}`).join(' ')} className="coach-fact-line"/>)}
     {coordinates.map((p,i)=>p?<circle key={i} cx={p.x} cy={p.y} r="4" className={points[i].adapted?'coach-fact-dot is-adapted':'coach-fact-dot'}><title>{factDisplayDate(points[i].date)}: {format(p.value)} {unit}{points[i].adapted?' · локальная адаптация':''}</title></circle>:<g key={i} className="coach-fact-gap"><path d={`M ${38+i*(width-60)/Math.max(1,points.length-1)-3} ${height-29} l 6 6 m -6 0 l 6 -6`}/><title>{factDisplayDate(points[i].date)}: {points[i].gap || 'Значение не записано'}</title></g>)}
     {chartDateIndices(points.length,width).map(i=><text key={points[i].date} x={38+i*(width-60)/Math.max(1,points.length-1)} y={height-5} textAnchor={i===0?'start':i===points.length-1?'end':'middle'} className="coach-fact-axis">{date(points[i].date)}</text>)}
     {active!=null && <g aria-hidden="true" className="coach-chart-guide"><line x1={x} x2={x} y1="12" y2={height-22}/>{point && <circle cx={point.x} cy={point.y} r="6"/>}</g>}
    </svg>
   </div>:<div className="coach-chart-empty"><span>Нет записанных значений</span><small>Пропуски сохранены</small></div>}
   <span className={'coach-chart-readout'+(active==null?' is-idle':'')} data-readout-position={point && point.y<height/2?'bottom':'top'} id={id+'-readout'} role="status">{description}</span>
   {known.length===1 && active==null && <span className="coach-chart-single">Одна запись · {date(points[latest.index].date)}</span>}
  </div>
  {overflow && <p className="coach-fact-scroll-hint">Последние даты справа · прокрутка ↔</p>}
 </figure>;
}
