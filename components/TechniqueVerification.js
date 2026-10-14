import {useEffect,useState} from 'react';
import {techniqueSignature} from '../lib/coachAuditPresentation.mjs';
export default function TechniqueVerification({card}){
 const signature=techniqueSignature(card),[checks,setChecks]=useState({}),[loaded,setLoaded]=useState(false);
 useEffect(()=>{setLoaded(false);try{const saved=JSON.parse(localStorage.getItem('gym:technique-review:v1') || '{}');setChecks(saved[signature] || {});}catch{setChecks({});}setLoaded(true);},[signature]);
 function mark(type){const next={...checks,[type]:checks[type]?null:new Date().toISOString()};setChecks(next);try{const saved=JSON.parse(localStorage.getItem('gym:technique-review:v1') || '{}');localStorage.setItem('gym:technique-review:v1',JSON.stringify({...saved,[signature]:next}));}catch{}}
 return <section className="coach-technique-review" aria-label="Проверка точного варианта"><strong>Проверка тренером</strong><p>Проверка хранится только в этом браузере и относится к текущим описанию и ссылке. Индивидуальные указания остаются в программе.</p>{['description','video'].map(type=><button key={type} type="button" disabled={!loaded || type==='video' && !(card.video || card.autoVideo)} aria-pressed={!!checks[type]} onClick={()=>mark(type)}>{type==='video'?'Видео':'Описание'}: {checks[type]?'проверено мной · '+new Date(checks[type]).toLocaleDateString('ru-RU'):'не проверено'}{checks[type]?' · снять отметку':''}</button>)}</section>;
}
