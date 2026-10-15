import {useEffect,useState} from 'react';
import {preloadExerciseCatalogue} from '../components/ExerciseLibraryExplorer';
import {EXERCISE_BANK} from '../lib/exerciseBank';
import {exactWarmupNames,exactWarmupVideo} from '../lib/coachOrderPresentation.mjs';
export default function useWarmupVideo(exercise,apiKey){
 const names=exactWarmupNames(exercise),scope=JSON.stringify(names),[resolved,setResolved]=useState(null);
 useEffect(()=>{let active=true;setResolved(null);if(apiKey)preloadExerciseCatalogue(apiKey).then(cards=>{if(active)setResolved({scope,url:exactWarmupVideo(names,cards)});}).catch(()=>{});return()=>{active=false;};},[scope,apiKey]);
 return resolved?.scope===scope && resolved.url?resolved.url:exactWarmupVideo(names,EXERCISE_BANK.map(entry=>({title:entry.n,video:entry.u})));
}
