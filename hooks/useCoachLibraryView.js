import {useEffect,useRef,useState} from 'react';
import {defaultLibraryContext,libraryContext} from '../lib/coachEasePresentation.mjs';
import {LIBRARY_GROUPS,LIBRARY_EQUIPMENT,LIBRARY_REGIONS} from '../lib/exerciseLibraryView.mjs';
const facets={group:LIBRARY_GROUPS.map(([id])=>id),equipment:LIBRARY_EQUIPMENT.map(([id])=>id),region:LIBRARY_REGIONS.map(([id])=>id),media:['all','video','missing'],collection:['all','favorites','recent']};
export default function useCoachLibraryView(scope,ready,initialGroup='all'){
 const key='gym-library-view-v1:'+scope,root=useRef(null),viewRef=useRef(null);
 const [view,setView]=useState(()=>{try{if(scope)return libraryContext(JSON.parse(sessionStorage.getItem(key)),facets);}catch{}return {...defaultLibraryContext,group:initialGroup};});
 const scroll=useRef(view.scroll);viewRef.current=view;
 function persist(){if(!scope)return;try{sessionStorage.setItem(key,JSON.stringify({...viewRef.current,scroll:scroll.current}));}catch{}}
 function change(patch){setView(old=>({...old,...typeof patch==='function'?patch(old):patch}));}
 useEffect(persist,[view,key,scope]);
 useEffect(()=>{
  if(!scope || !ready || !root.current)return;
  const el=root.current.closest('.workspace-main') || document.scrollingElement;let first,second,restoring=true;
  const save=()=>{if(!restoring){scroll.current=el.scrollTop;persist();}};
  first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{el.scrollTop=scroll.current || 0;restoring=false;});});
  el.addEventListener('scroll',save,{passive:true});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);persist();el.removeEventListener('scroll',save);};
 },[scope,key,ready]);
 return {view,change,root};
}
