import {useEffect,useState} from 'react';
import {preloadExerciseCatalogue} from '../components/ExerciseLibraryExplorer';
import {EXERCISE_BANK} from '../lib/exerciseBank';
import {exactWarmupNames,exactWarmupVideoSource} from '../lib/coachOrderPresentation.mjs';
const bankCards=EXERCISE_BANK.map(entry=>({title:entry.n,video:entry.u}));
export default function useWarmupVideo(exercise,apiKey){
 const names=exactWarmupNames(exercise),scope=JSON.stringify(names),[resolved,setResolved]=useState(null),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setResolved(null);if(apiKey)preloadExerciseCatalogue(apiKey).then(cards=>{if(active)setResolved({scope,source:exactWarmupVideoSource(names,cards)});}).catch(()=>{if(active)setResolved({scope,error:'Каталог видео не загружен.'});});return()=>{active=false;};},[scope,apiKey,reload]);
 useEffect(()=>{const update=event=>{if(names.includes(event.detail?.name))setReload(value=>value+1);};window.addEventListener('gym-exercise-video-changed',update);return()=>window.removeEventListener('gym-exercise-video-changed',update);},[scope]);
 const result=resolved?.scope===scope?resolved:null,source=result?.source || exactWarmupVideoSource(names,bankCards);
 return {url:source?.url || null,sourceName:source?.name || '',loading:!!apiKey && !result,error:result?.error || '',retry:()=>setReload(v=>v+1)};
}
