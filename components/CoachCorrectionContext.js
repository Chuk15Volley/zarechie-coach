import {useRef,useState} from 'react';
export default function CoachCorrectionContext({workspace,checks=[],children}){
 const key='gym-coach-context-v1:'+workspace,root=useRef(null),[open,setOpen]=useState(()=>{try{return sessionStorage.getItem(key)==='open';}catch{return false;}});
 const issues=checks.filter(item=>!item.ok);
 return <details ref={root} className="coach-correction-context" open={open} onToggle={event=>{if(event.target!==root.current)return;const value=event.currentTarget.open;setOpen(value);try{sessionStorage.setItem(key,value?'open':'closed');}catch{}}}><summary><span>Проверки и история нагрузки{checks.length?` · ${checks.filter(item=>item.ok).length}/${checks.length}`:''}</span>{issues.length>0 && <span className="coach-context-issues">{issues.map(item=><small key={item.label}>{item.label}{item.detail?' · '+item.detail:''}</small>)}</span>}</summary>{children}</details>;
}
