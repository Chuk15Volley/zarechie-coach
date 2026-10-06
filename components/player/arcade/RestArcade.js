import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Clock3, Gamepad2, X } from 'lucide-react';
import GameStage from './GameStage';
import styles from './RestArcade.module.css';
const GAMES=[
  {id:'snake',title:'Змейка',genre:'ПИКСЕЛЬНАЯ КЛАССИКА',tag:'Собирай и расти',instructions:'Собирай золотые пиксели. Не врезайся в стену или свой хвост.',hint:'Нажимай стрелки или веди палец по крестовине.'},
  {id:'tetris',title:'Тетрис',genre:'ЛИНИЯ ЗА ЛИНИЕЙ',tag:'Найди место каждой фигуре',instructions:'Заполняй горизонтальные линии. Поворачивай фигуры, используй запас и подсказку падения.',hint:'↑ поворот · ↓ быстрее · пробел — сброс · C — запас'},
  {id:'jump',title:'Doodle Jump',genre:'ТОЛЬКО ВВЕРХ',tag:'Выше облаков',instructions:'Прыжки автоматические. Держи влево или вправо, ищи пружины. Выше появятся монстры — стреляй или прыгай им на голову.',hint:'← → движение · выстрел / пробел · прыжки автоматические.'},
  {id:'tanks',title:'Танчики',genre:'ЗАЩИТИ БАЗУ',tag:'Броня. Кирпичи. Победа.',instructions:'Защищай базу внизу экрана. Разрушай кирпичи и уничтожай танки противника. У тебя три жизни.',hint:'Крестовина — движение · удерживай «Огонь» для стрельбы.'},
];
function Cover({type}){
  return <svg viewBox="0 0 240 132" aria-hidden="true" className={styles.cover}>
    {type==='snake'&&<><defs><pattern id="cover-snake-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#b9ffe5" strokeOpacity=".07"/></pattern></defs><rect width="240" height="132" fill="#0d2821"/><rect width="240" height="132" fill="url(#cover-snake-grid)"/>{[[4,5],[5,5],[6,5],[7,5],[7,4],[7,3],[8,3],[9,3]].map(([x,y],i)=><rect key={i} x={x*16} y={y*16} width="14" height="14" rx="2" fill={i===7?'#e2fff0':'#83dcb1'}/>)}<rect x="153" y="51" width="2" height="3" fill="#17432f"/><rect x="153" y="57" width="2" height="3" fill="#17432f"/><rect x="183" y="78" width="12" height="12" rx="2" fill="#ffd096"/></>}
    {type==='tetris'&&<><rect width="240" height="132" fill="#202037"/>{[[1,5,'#69e0ef'],[2,5,'#69e0ef'],[3,5,'#69e0ef'],[4,5,'#69e0ef'],[2,4,'#ffd56c'],[3,4,'#ffd56c'],[2,3,'#ffd56c'],[3,3,'#ffd56c'],[5,5,'#ffb374'],[5,4,'#ffb374'],[5,3,'#ffb374'],[6,5,'#ffb374'],[7,5,'#8ae6a4'],[8,5,'#8ae6a4'],[8,4,'#8ae6a4'],[9,4,'#8ae6a4'],[6,1,'#bc94ff'],[5,2,'#bc94ff'],[6,2,'#bc94ff'],[7,2,'#bc94ff']].map(([x,y,color],i)=><g key={i}><rect x={x*19+5} y={y*19+1} width="17" height="17" rx="2" fill={color}/><path d={`M${x*19+8} ${y*19+4}h11`} stroke="#ffffff66"/></g>)}</>}
    {type==='jump'&&<><defs><pattern id="cover-paper" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#92bfb1" strokeOpacity=".22"/></pattern></defs><rect width="240" height="132" fill="#f3eedb"/><rect width="240" height="132" fill="url(#cover-paper)"/><path d="M31 0V132" stroke="#dcaaa966"/><g stroke="#526745" strokeWidth="2"><rect x="39" y="106" width="55" height="8" rx="4" fill="#a1cc62"/><rect x="166" y="89" width="54" height="8" rx="4" fill="#91c4d8"/><rect x="62" y="23" width="53" height="8" rx="4" fill="#a1cc62"/><path d="M116 86Q105 48 124 44Q145 42 148 78L140 88Z" fill="#b0d65c"/><path d="M120 86v7h-7m23-7v7h7" fill="none"/><rect x="120" y="50" width="9" height="12" rx="3" fill="#fffdec"/><rect x="133" y="50" width="9" height="12" rx="3" fill="#fffdec"/><path d="M126 55v4m13-4v4"/><path d="M146 67h9v6h-9" fill="#b0d65c"/></g></>}
    {type==='tanks'&&<><rect width="240" height="132" fill="#202a2c"/>{[[0,1],[1,1],[2,1],[8,1],[9,1],[10,1],[0,5],[1,5],[2,5],[8,5],[9,5],[10,5]].map(([x,y],i)=><g key={i}><rect x={x*21+5} y={y*20} width="19" height="18" fill="#af7858"/><path d={`M${x*21+5} ${y*20+9}h19m-9-9v9m-6 0v9`} stroke="#503e35"/></g>)}<g transform="translate(92 86)"><rect x="-17" y="-17" width="9" height="34" fill="#c3b378"/><rect x="8" y="-17" width="9" height="34" fill="#c3b378"/><rect x="-10" y="-14" width="20" height="29" fill="#f3d681"/><rect x="-6" y="-7" width="12" height="16" fill="#b99a48"/><rect x="-3" y="-28" width="6" height="28" fill="#f3d681"/></g><g transform="translate(165 37) rotate(180)"><rect x="-13" y="-13" width="7" height="26" fill="#9c9385"/><rect x="6" y="-13" width="7" height="26" fill="#9c9385"/><rect x="-8" y="-11" width="16" height="23" fill="#e4a183"/><rect x="-2" y="-23" width="4" height="23" fill="#e4a183"/></g><rect x="90" y="30" width="4" height="7" fill="#ffe4a8"/></>}
  </svg>;
}
export default function RestArcade({remaining,onClose}){
  const dialog=useRef(null),[selected,setSelected]=useState(null);
  useEffect(()=>{
    const element=dialog.current,previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';element.showModal();
    return()=>{element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{if(remaining<=0)onClose();},[remaining,onClose]);
  return <dialog ref={dialog} className={`${styles.dialog} ${selected?styles.activeGame:styles.menuDialog}`} aria-labelledby="arcade-title" onCancel={onClose}>
    <header className={styles.header}>
      {selected?<button type="button" className={styles.iconButton} onClick={()=>setSelected(null)} aria-label="К выбору игр"><ArrowLeft size={21}/></button>:<span className={styles.arcadeIcon}><Gamepad2 size={25}/></span>}
      <div className={styles.title}><span>NK · POCKET ARCADE</span><h2 id="arcade-title">{selected?selected.title:'Время на игру'}</h2></div>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Закрыть игры" autoFocus><X size={21}/></button>
    </header>
    <div className={`${styles.restBar} ${remaining<=10?styles.ending:''}`} role="timer" aria-label={`До конца отдыха ${remaining} секунд`}>
      <span><Clock3 size={15}/>{remaining<=10?'Скоро к подходу':'Отдых между подходами'}</span><b>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</b>
    </div>
    {selected?<GameStage key={selected.id} game={selected}/>:<div className={styles.menu}>
      <div className={styles.menuIntro}><span className={styles.eyebrow}>ЧЕТЫРЕ МАЛЕНЬКИХ ПРИКЛЮЧЕНИЯ</span><p>Выбери, как провести паузу.</p></div>
      <div className={styles.cards}>{GAMES.map(game=><button type="button" key={game.id} onClick={()=>setSelected(game)} className={`${styles.card} ${styles[game.id]}`} aria-label={`Играть: ${game.title}`}>
        <Cover type={game.id}/><div className={styles.cardCopy}><span className={styles.cardGenre}>{game.genre}</span><strong>{game.title}<ArrowUpRight size={18}/></strong><span className={styles.cardTag}>{game.tag}</span></div>
      </button>)}</div>
      <p className={styles.menuNote}><span/>Когда отдых закончится, игра закроется сама.</p>
    </div>}
  </dialog>;
}
