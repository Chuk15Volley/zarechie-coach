import { useRef, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCw, ChevronsDown, Crosshair, Archive } from 'lucide-react';
import styles from './RestArcade.module.css';
const ARROWS=[['up','Вверх',ArrowUp],['left','Влево',ArrowLeft],['down','Вниз',ArrowDown],['right','Вправо',ArrowRight]];
function Key({action,label,Icon,onInput,disabled,accent=false}){
  const [pressed,setPressed]=useState(false);
  const release=()=>{setPressed(false);onInput(action,false);};
  return <button type="button" disabled={disabled} className={`${styles.key} ${accent?styles.actionKey:''} ${pressed?styles.pressed:''}`} aria-label={label}
    onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);setPressed(true);onInput(action,true);}}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onClick={e=>{if(e.detail===0){onInput(action,true);onInput(action,false);}}}>
    <Icon size={28}/><span>{label}</span>
  </button>;
}
export default function GameControls({type,onInput,disabled}){
  const pointer=useRef(null),last=useRef(null);
  const [pressed,setPressed]=useState(null);
  const change=d=>{if(last.current===d)return;if(last.current)onInput(last.current,false);last.current=d;setPressed(d);if(d)onInput(d,true);};
  const release=()=>{pointer.current=null;change(null);};
  const move=e=>{if(pointer.current!==e.pointerId)return;const r=e.currentTarget.getBoundingClientRect();const x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;change(Math.max(Math.abs(x),Math.abs(y))<r.width/7?null:Math.abs(x)>Math.abs(y)?(x>0?'right':'left'):(y>0?'down':'up'));};
  if(type==='jump')return <div className={styles.jumpControls} aria-label="Управление прыжками">
    <Key action="left" label="Влево" Icon={ArrowLeft} {...{onInput,disabled}}/><Key action="fire" label="Выстрел" Icon={Crosshair} {...{onInput,disabled}} accent/><Key action="right" label="Вправо" Icon={ArrowRight} {...{onInput,disabled}}/>
  </div>;
  if(type==='tetris')return <div className={styles.tetrisControls} aria-label="Управление тетрисом">
    <Key action="left" label="Влево" Icon={ArrowLeft} {...{onInput,disabled}}/><Key action="rotate" label="Поворот" Icon={RotateCw} {...{onInput,disabled}} accent/><Key action="right" label="Вправо" Icon={ArrowRight} {...{onInput,disabled}}/>
    <Key action="hold" label="Запас" Icon={Archive} {...{onInput,disabled}}/><Key action="down" label="Вниз" Icon={ArrowDown} {...{onInput,disabled}}/><Key action="drop" label="Сбросить" Icon={ChevronsDown} {...{onInput,disabled}} accent/>
  </div>;
  return <div className={`${styles.driveControls} ${type==='tanks'?styles.tankControls:''}`}>
    <div className={styles.pad} aria-label="Крестовина" onPointerDown={e=>{if(disabled||pointer.current!==null||e.button!==0)return;pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className={styles.padCenter} aria-hidden="true">✦</span>
      {ARROWS.map(([d,label,Icon])=><button key={d} type="button" disabled={disabled} className={`${styles.key} ${styles[d]} ${pressed===d?styles.pressed:''}`} aria-label={label} onClick={e=>{if(e.detail===0){onInput(d,true);onInput(d,false);}}}><Icon size={30}/></button>)}
    </div>
    {type==='tanks'&&<Key action="fire" label="Огонь" Icon={Crosshair} {...{onInput,disabled}} accent/>}
  </div>;
}
