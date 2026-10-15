import {useEffect,useRef} from 'react';
const overlays=[];
export default function CoachOverlay({onClose,locked=false,children,...props}){
 const root=useRef(null),close=useRef(onClose),busy=useRef(locked);close.current=onClose;busy.current=locked;
 useEffect(()=>{
  const el=root.current,previous=document.activeElement;overlays.push(el);
  const controls=()=>[...el.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')].filter(node=>!node.disabled && node.tabIndex>=0 && node.getClientRects().length && !node.closest('[inert]'));
  (controls()[0] || el).focus({preventScroll:true});
  const key=event=>{if(overlays.at(-1)!==el || event.defaultPrevented)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy.current)close.current?.();}
   if(event.key==='Tab'){const items=controls(),first=items[0] || el,last=items.at(-1) || el;if(event.shiftKey && (document.activeElement===first || !el.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey && (document.activeElement===last || !el.contains(document.activeElement))){event.preventDefault();first.focus();}}
  };
  el.addEventListener('keydown',key);return()=>{el.removeEventListener('keydown',key);const index=overlays.indexOf(el);if(index>=0)overlays.splice(index,1);if(previous?.isConnected && !previous.closest('[inert]'))previous.focus({preventScroll:true});};
 },[]);
 return <div {...props} ref={root} role="dialog" aria-modal="true" tabIndex={-1} onMouseDown={event=>{if(event.target===event.currentTarget && !busy.current)close.current?.();}}>{children}</div>;
}
