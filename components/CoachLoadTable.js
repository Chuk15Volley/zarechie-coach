import {useLayoutEffect,useRef} from 'react';
import {loadTableOffset,loadTablePosition} from '../lib/coachPolish.mjs';
const views=new Map(),prefix='gym-coach-load-view-v1:';
export default function CoachLoadTable({workspace,dates=[],children}){
 const root=useRef(null),scope=workspace+':'+dates.join(','),ready=dates.length>0;
 useLayoutEffect(()=>{
  const el=root.current;if(!el || !ready)return;
  const key=prefix+scope;let saved=views.get(key);
  if(!saved)try{saved=JSON.parse(sessionStorage.getItem(key));}catch{}
  const max=()=>Math.max(0,el.scrollWidth-el.clientWidth);
  el.scrollLeft=loadTableOffset(saved,max());
  const remember=()=>{saved=loadTablePosition(el.scrollLeft,max());views.delete(key);views.set(key,saved);while(views.size>12)views.delete(views.keys().next().value);try{sessionStorage.setItem(key,JSON.stringify(saved));const keys=Object.keys(sessionStorage).filter(k=>k.startsWith(prefix));for(const k of keys.filter(k=>k!==key).slice(0,Math.max(0,keys.length-12)))sessionStorage.removeItem(k);}catch{}};
  const resize=()=>{el.scrollLeft=loadTableOffset(saved,max());};
  remember();el.addEventListener('scroll',remember,{passive:true});window.addEventListener('resize',resize);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(el);
  return()=>{remember();el.removeEventListener('scroll',remember);window.removeEventListener('resize',resize);observer?.disconnect();};
 },[scope,ready]);
 return <div ref={root} className="coach-overview-table" role="region" aria-label="Тоннаж за семь дней" tabIndex={0}>{children}</div>;
}
