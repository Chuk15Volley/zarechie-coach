import {useEffect,useRef,useState} from 'react';
import {correctionEqual,correctionHistoryEdit,correctionHistoryStep} from '../lib/correctionInteraction.mjs';
export function useCorrectionHistory({scope,value,onChange,blocked,onStep}){
 const latest=useRef(null),histories=useRef(new Map()),[,render]=useState(0);latest.current={scope,value,onChange,blocked,onStep};
 const empty=()=>({past:[],future:[],key:null,at:0});
 function get(){return histories.current.get(latest.current.scope) || empty();}
 function store(h){histories.current.set(latest.current.scope,h);if(histories.current.size>20)histories.current.delete(histories.current.keys().next().value);render(n=>n+1);}
 function edit(change,key=null){const v=latest.current;if(v.blocked || !v.value)return;const next=typeof change==='function'?change(v.value):change;if(correctionEqual(v.value,next))return;store(correctionHistoryEdit(get(),v.value,next,key));latest.current={...v,value:next};v.onChange(next);}
 function step(redo=false){const v=latest.current;if(v.blocked || !v.value)return;const result=correctionHistoryStep(get(),v.value,redo);if(result.value===v.value)return;store(result.history);latest.current={...v,value:result.value};v.onChange(result.value);v.onStep?.();}
 return {edit,undo:()=>step(),redo:()=>step(true),canUndo:!!get().past.length,canRedo:!!get().future.length};
}
const detailKey=el=>[el.closest('article')?.getAttribute('aria-label') || '',el.querySelector('summary')?.textContent || ''].join('|');
export function useCorrectionView({viewKey,ready}){
 const active=useRef(null);
 function capture(){const v=active.current;if(!v || !v.root.isConnected || !v.root.querySelector('.coach-session-workspace'))return;try{
  const focused=v.root.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):v.focus;
  const details=[...v.root.querySelectorAll('details')].map(el=>[detailKey(el),el.open]);
  const bounds=v.root.getBoundingClientRect(),input=[...v.root.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focused),visible=el=>el && el.getBoundingClientRect().bottom>bounds.top && el.getBoundingClientRect().top<bounds.bottom;
  const anchor=visible(input)?input:[...v.root.querySelectorAll('.coach-exercise-studio')].find(visible);
  sessionStorage.setItem(v.key,JSON.stringify({at:Date.now(),top:v.root.scrollTop,focus:focused,details,anchor:anchor?{label:anchor.getAttribute('aria-label'),offset:anchor.getBoundingClientRect().top-bounds.top}:null}));
 }catch{}}
 useEffect(()=>{
  if(!ready)return;const root=document.querySelector('dialog[open] .team-program-dialog-body');if(!root)return;
  const v={root,key:viewKey,focus:null,restoring:true};active.current=v;let first,second,third,copy,observer,timer;
  try{copy=JSON.parse(sessionStorage.getItem(viewKey));}catch{}
  const save=()=>{if(!v.restoring)capture();},focus=event=>{v.focus=event.target.getAttribute?.('aria-label');save();};
  const oldAnchor=root.style.overflowAnchor;
  const stop=()=>{observer?.disconnect();clearTimeout(timer);root.style.overflowAnchor=oldAnchor;};
  function position(){if(!root.isConnected)return;const anchor=[...root.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===copy?.anchor?.label);if(anchor && Number.isFinite(copy.anchor.offset))root.scrollTop+=anchor.getBoundingClientRect().top-root.getBoundingClientRect().top-copy.anchor.offset;else root.scrollTop=Math.max(0,Number(copy?.top) || 0);}
  root.addEventListener('scroll',save,{passive:true});root.addEventListener('toggle',save,true);root.addEventListener('focusin',focus);
  for(const event of ['wheel','touchstart','pointerdown','keydown'])root.addEventListener(event,stop,{passive:true});
  first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{
   if(copy && Date.now()-copy.at<7*86400000){
    const states=new Map(copy.details || []);for(const el of root.querySelectorAll('details'))if(states.has(detailKey(el)))el.open=states.get(detailKey(el));
    const input=[...root.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===copy.focus);input?.focus({preventScroll:true});v.focus=copy.focus;
    root.style.overflowAnchor='none';position();observer=new ResizeObserver(position);const content=root.querySelector('.coach-session-workspace');if(content)observer.observe(content);timer=setTimeout(stop,5000);
    third=requestAnimationFrame(()=>{position();v.restoring=false;});
   }else{root.scrollTop=0;v.restoring=false;}
  });});
  return()=>{capture();stop();cancelAnimationFrame(first);cancelAnimationFrame(second);cancelAnimationFrame(third);root.removeEventListener('scroll',save);root.removeEventListener('toggle',save,true);root.removeEventListener('focusin',focus);for(const event of ['wheel','touchstart','pointerdown','keydown'])root.removeEventListener(event,stop);if(active.current===v)active.current=null;};
 },[viewKey,ready]);
 return capture;
}
export function correctionNumericEnter(event){
 if(event.key!=='Enter' || event.altKey || event.ctrlKey || event.metaKey || event.isComposing)return;
 const input=event.target;if(input.tagName!=='INPUT' || !input.closest('.coach-quick-plan') || input.classList.contains('coach-set-count') || input.getAttribute('aria-label')?.endsWith('повторы всем подходам'))return;
 const root=input.closest('dialog[open]') || input.closest('.coach-session-workspace');if(!root)return;
 const fields=[...root.querySelectorAll('.coach-quick-plan input')].filter(el=>!el.disabled && !el.classList.contains('coach-set-count') && !el.getAttribute('aria-label')?.endsWith('повторы всем подходам'));
 const next=fields[fields.indexOf(input)+(event.shiftKey?-1:1)];event.preventDefault();if(next){next.focus();next.select();}
}
