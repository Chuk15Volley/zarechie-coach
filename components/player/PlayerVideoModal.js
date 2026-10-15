import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PlayerVideoModal({ name, videoId, watchUrl, children, onClose }) {
 const ref=useRef(null);
 const [host,setHost]=useState(null);
 useEffect(()=>{setHost(document.querySelector('.player-page-shell') || document.body);},[]);
 useEffect(()=>{
  if(!host)return;
  const focus=document.activeElement, previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden'; ref.current?.querySelector('button')?.focus();
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();onClose();} if(event.key==='Tab'){const items=[...ref.current.querySelectorAll('button,a,iframe')];const first=items[0],last=items.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',keydown);
  return ()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keydown);if(focus?.isConnected)focus.focus();};
 },[host]);
 return host ? createPortal(<div className="gym-result-overlay player-video-overlay" onClick={onClose}>
  <section ref={ref} className="player-video-modal" role="dialog" aria-modal="true" aria-label={`Техника: ${name}`} onClick={e=>e.stopPropagation()}>
   <div className="gym-result-heading"><h2>{name}</h2><button type="button" aria-label="Закрыть видео" onClick={onClose}>×</button></div>
   <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`} title={`Техника: ${name}`} referrerPolicy="origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
   {children}
   <p>Если плеер недоступен, <a href={watchUrl} target="_blank" rel="noopener noreferrer">открыть оригинал на YouTube</a>.</p>
  </section>
 </div>,host) : null;
}

