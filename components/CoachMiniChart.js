import {createPortal} from 'react-dom';
import {miniPopupPosition} from '../lib/coachPolish.mjs';
import {useEffect,useId,useState,useLayoutEffect,useRef} from 'react';
import {miniRowDescription,miniPointerIndex} from '../lib/coachMiniReadout.mjs';
import {chartNumber,chartKeyIndex,historyLoadChart} from '../lib/coachVisualCharts.mjs';
const format=v=>v==null?'нет записи':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+' кг';
export function MiniBars({rows=[],label,planned=false}){
 const [active,setActive]=useState(null),readoutId=useId(),signature=rows.map(r=>r.date).join('|'),root=useRef(null),popup=useRef(null),[position,setPosition]=useState(null);
 useEffect(()=>setActive(null),[label,signature]);
 const max=Math.max(1,...rows.map(r=>chartNumber(r.value)??0)),step=200/Math.max(1,rows.length),selected=rows[active];
 const description=selected?miniRowDescription(selected):'';
 useLayoutEffect(()=>{
  if(!selected){setPosition(null);return;}
  const place=()=>{const anchor=root.current?.closest('.coach-stat-chart,.coach-week-stat') || root.current;if(!anchor || !popup.current)return;const card=anchor.getBoundingClientRect(),size=popup.current.getBoundingClientRect();setPosition({...miniPopupPosition(card,size,{width:window.innerWidth,height:window.innerHeight}),fontFamily:getComputedStyle(root.current).fontFamily});};
  place();window.addEventListener('resize',place);document.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);};
 },[description,label,signature]);
 const point=event=>{const box=event.currentTarget.getBoundingClientRect();setActive(miniPointerIndex(event.clientX-box.left,box.width,rows.length));};
 return <div ref={root} className="coach-mini-chart" role="group" tabIndex={rows.length?0:undefined} aria-label={label+' · стрелки выбирают день, Home и End — начало и конец'} aria-describedby={selected?readoutId:undefined} onFocus={()=>setActive(i=>i??(rows.length?rows.length-1:null))} onBlur={()=>setActive(null)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setActive(null);}else if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setActive(i=>chartKeyIndex(event.key,i,rows.length));}}}>
 <svg className={'coach-mini-bars'+(planned?' is-plan':'')} viewBox="0 0 200 18" preserveAspectRatio="none" role="img" aria-label={label+': '+rows.map(miniRowDescription).join('; ')} onPointerMove={point} onPointerDown={point} onPointerLeave={()=>setActive(null)}><title>{label} · {rows.map(miniRowDescription).join('; ')}</title>{rows.map((row,index)=>{const value=chartNumber(row.value),h=value==null?0:value/max*14;return <g key={row.date} data-active={active===index}><title>{miniRowDescription(row)}</title>{value==null?<path d={`M ${index*step+step/2-2} 14 h 4`} className="coach-mini-gap"/>:value===0?<path d={`M ${index*step+2} 16 h ${Math.max(1,step-4)}`} className="coach-mini-zero"/>:<rect className={row.partial?'is-partial':''} x={index*step+2} y={16-h} width={Math.max(1,step-4)} height={h} rx="1"/>}<rect className="coach-mini-hit" x={index*step} y="0" width={step} height="18"/></g>;})}</svg>
 {selected && typeof document!=='undefined' && createPortal(<span ref={popup} className="coach-premium coach-mini-popup" id={readoutId} role="status" style={{...position,visibility:position?'visible':'hidden'}}>{description}</span>,document.body)}
 </div>;
}
export function ProgramRatio({value,total}){
 if(!Number.isFinite(value) || !Number.isFinite(total) || total<=0)return null;
 return <svg className="coach-program-ratio" viewBox="0 0 200 4" preserveAspectRatio="none" role="img" aria-label={`Программы назначены ${value} из ${total} игроков`}><path d="M 0 2 H 200" className="coach-ratio-base"/><path d={`M 0 2 H ${Math.max(0,Math.min(200,value/total*200))}`} className="coach-ratio-value"/></svg>;
}
export function HistoryLoadBars({session}){
 const {actual,plan,partial}=historyLoadChart(session),max=Math.max(1,actual??0,plan??0);
 return <svg className="coach-history-load-bars" viewBox="0 0 200 12" preserveAspectRatio="none" role="img" aria-label={`Тоннаж · факт: ${format(actual)}${partial?' · неполные данные':''}; план: ${format(plan)}`}><title>Факт: {format(actual)}{partial?' · неполные данные':''}. План: {format(plan)}</title>{[[actual,2,false],[plan,8,true]].map(([value,y,planned])=>value==null?<path key={y} d={`M 0 ${y} h 6`} className="coach-mini-gap"/>:<path key={y} d={`M 0 ${y} h ${value===0?1:value/max*200}`} className={planned?'coach-history-bar-plan':partial?'coach-history-bar-actual is-partial':'coach-history-bar-actual'}/>)}</svg>;
}
export function CoachLoading({label}){return <span className="coach-loading-state"><svg aria-hidden="true" viewBox="0 0 240 60" preserveAspectRatio="none"><path d="M 12 10 H 228 M 12 30 H 176 M 12 50 H 210"/></svg><span>{label}</span></span>;}
