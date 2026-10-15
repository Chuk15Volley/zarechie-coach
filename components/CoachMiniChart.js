import {chartNumber,historyLoadChart} from '../lib/coachVisualCharts.mjs';
const format=v=>v==null?'нет записи':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+' кг';
const date=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8)+'.'+d.slice(5,7):d;
export function MiniBars({rows=[],label,planned=false}){
 const max=Math.max(1,...rows.map(r=>chartNumber(r.value)??0)),step=200/Math.max(1,rows.length);
 const describe=row=>`${date(row.date)}: ${row.value==null?row.gap || 'нет записи':format(row.value)}${row.partial?' · неполные данные':''}`;
 return <svg className={'coach-mini-bars'+(planned?' is-plan':'')} viewBox="0 0 200 18" preserveAspectRatio="none" role="img" aria-label={label+': '+rows.map(describe).join('; ')}><title>{label} · {rows.map(describe).join('; ')}</title>{rows.map((row,index)=>{const value=chartNumber(row.value),h=value==null?0:value/max*14;return <g key={row.date}><title>{describe(row)}</title>{value==null?<path d={`M ${index*step+step/2-2} 14 h 4`} className="coach-mini-gap"/>:value===0?<path d={`M ${index*step+2} 16 h ${Math.max(1,step-4)}`} className="coach-mini-zero"/>:<rect className={row.partial?'is-partial':''} x={index*step+2} y={16-h} width={Math.max(1,step-4)} height={h} rx="1"/>}</g>;})}</svg>;
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
