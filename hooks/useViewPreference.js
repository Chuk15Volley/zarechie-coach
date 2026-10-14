import {useEffect,useState} from 'react';
// UI context only; never stores athlete facts or credentials.
export default function useViewPreference(key,initial){
 const [entry,setEntry]=useState({key,value:initial}),value=entry.key===key?entry.value:initial;
 useEffect(()=>{let saved;try{saved=JSON.parse(sessionStorage.getItem(key));}catch{}setEntry({key,value:saved ?? initial});},[key]);
 const update=next=>setEntry(previous=>{const current=previous.key===key?previous.value:initial,result=typeof next==='function'?next(current):next;try{sessionStorage.setItem(key,JSON.stringify(result));}catch{}return {key,value:result};});
 return [value,update];
}
