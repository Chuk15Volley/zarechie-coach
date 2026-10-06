import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Heart } from 'lucide-react';
import { newSnake, stepSnake } from '../../../lib/restSnake.mjs';
import { newTetris, tickTetris, tetrisAction } from '../../../lib/arcade/tetris.mjs';
import { newJump, tickJump, fireJump } from '../../../lib/arcade/jump.mjs';
import { newTanks, tickTanks, fireTank } from '../../../lib/arcade/tanks.mjs';
import { drawGame, SIZES } from '../../../lib/arcade/draw.mjs';
import GameControls from './GameControls';
import styles from './RestArcade.module.css';
const FACTORIES={snake:newSnake,tetris:newTetris,jump:newJump,tanks:newTanks};
const KEYS={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:'up',a:'left',d:'right',s:'down',w:'up'};
export default function GameStage({game:info}){
  const type=info.id,canvas=useRef(null),engine=useRef(null),held=useRef(new Set()),pending=useRef(null),mode=useRef('ready');
  const [status,setStatus]=useState('ready'),[stats,setStats]=useState({score:0,lives:3,stage:1});
  const setMode=useCallback(next=>{mode.current=next;held.current.clear();pending.current=null;setStatus(next);},[]);
  const input=useCallback((action,down)=>{
    if(mode.current!=='playing')return;
    if(!down){held.current.delete(action);return;}
    if(held.current.has(action))return;
    held.current.add(action);
    const g=engine.current;if(!g)return;
    if(type==='snake')pending.current=action;
    if(type==='tetris')tetrisAction(g,action==='up'?'rotate':action);
    if(type==='tanks'&&action==='fire')fireTank(g,g.player);
    if(type==='jump'&&action==='fire')fireJump(g);
  },[type]);
  const start=()=>{
    if(status!=='paused'){engine.current=FACTORIES[type]();setStats({score:0,lives:3,stage:1});}
    setMode('playing');
  };
  useEffect(()=>{
    const surface=canvas.current,c=surface.getContext('2d');
    const [w,h]=SIZES[type],scale=Math.min(window.devicePixelRatio||1,2);
    surface.width=w*scale;surface.height=h*scale;c.scale(scale,scale);
    const frameElement=surface.parentElement,area=frameElement.parentElement;
    const fit=()=>{const width=Math.min(area.clientWidth,area.clientHeight*w/h);frameElement.style.width=`${width}px`;frameElement.style.height=`${width*h/w}px`;};
    const resize=new ResizeObserver(fit);resize.observe(area);fit();
    engine.current=FACTORIES[type]();drawGame(c,type,engine.current);
    let frame,last=0,accumulator=0,snakeClock=0,report=0;
    const animate=time=>{
      const dt=last?Math.min((time-last)/1000,.06):0;last=time;
      const g=engine.current;
      if(mode.current==='playing'&&!document.hidden){
        accumulator+=dt;
        while(accumulator>=1/60){
          accumulator-=1/60;
          if(type==='snake'){snakeClock+=1/60;if(snakeClock>=.17){snakeClock=0;engine.current=stepSnake(engine.current,pending.current);pending.current=null;}}
          if(type==='tetris')tickTetris(g,1/60,held.current);
          if(type==='jump')tickJump(g,1/60,held.current);
          if(type==='tanks')tickTanks(g,1/60,held.current);
          if(engine.current.status!=='playing'){setMode(engine.current.status);break;}
        }
      }else{accumulator=0;snakeClock=0;}
      drawGame(c,type,engine.current);
      if(time-report>100||mode.current==='lost'||mode.current==='won'){report=time;const g=engine.current;setStats(prev=>prev.score===g.score&&prev.lives===(g.lives||0)&&prev.stage===(g.stage||1)?prev:{score:g.score,lives:g.lives||0,stage:g.stage||1});}
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    const mapKey=e=>{if(e.code==='Space')return type==='tetris'?'drop':(type==='tanks'||type==='jump')?'fire':null;if(type==='tetris'&&(e.key==='c'||e.key==='C'))return 'hold';return KEYS[e.key]||KEYS[e.key.toLowerCase()];};
    const down=e=>{if(e.key==='p'||e.key==='P'){e.preventDefault();if(!e.repeat&&(mode.current==='playing'||mode.current==='paused'))setMode(mode.current==='playing'?'paused':'playing');return;}const action=mapKey(e);if(action){e.preventDefault();if(!e.repeat)input(action,true);}};
    const up=e=>{const action=mapKey(e);if(action){e.preventDefault();input(action,false);}};
    const suspend=()=>{if(mode.current==='playing')setMode('paused');held.current.clear();};
    const visibility=()=>{if(document.hidden)suspend();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelAnimationFrame(frame);resize.disconnect();held.current.clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',suspend);document.removeEventListener('visibilitychange',visibility);};
  },[type,input,setMode]);
  const overlay=status!=='playing';
  return <section className={`${styles.gameStage} ${styles[type]}`} aria-label={info.title}>
    <div className={styles.gameHud}><span>СЧЁТ <b>{String(stats.score).padStart(3,'0')}</b></span>
      {type==='tanks'?<span className={styles.lives}><Heart size={13}/> {stats.lives}<small>Волна {stats.stage}</small></span>:<span className={styles.genre}>{info.genre}</span>}
      <button type="button" className={styles.pause} disabled={status!=='playing'&&status!=='paused'} onClick={()=>setMode(status==='paused'?'playing':'paused')} aria-label={status==='paused'?'Продолжить игру':'Пауза игры'}>{status==='paused'?<Play size={17}/>:<Pause size={17}/>}</button>
    </div>
    <div className={styles.playArea}>
      <div className={styles.canvasFrame} style={{aspectRatio:`${SIZES[type][0]} / ${SIZES[type][1]}`}}>
        <canvas ref={canvas} className={styles.canvas} aria-label={`${info.title}. Счёт: ${stats.score}`} role="img" />
        {overlay&&<div className={`${styles.overlay} ${status==='ready'?styles.ready:''}`}>
          <span className={styles.overlayTag}>{status==='ready'?'ГОТОВ К СТАРТУ':status==='paused'?'МОЖНО ВЫДОХНУТЬ':status==='won'?'ПОБЕДА':'ЕЩЁ ОДНА ПОПЫТКА?'}</span>
          <h3>{status==='ready'?info.title:status==='paused'?'Пауза':status==='won'?'Всё поле твоё!':'Игра окончена'}</h3>
          <p>{status==='ready'?info.instructions:status==='paused'?'Отдых продолжается. Возвращайся, когда будешь готов.':`Твой счёт: ${stats.score}`}</p>
          <button type="button" className={styles.start} onClick={start} autoFocus>{status==='lost'||status==='won'?<RotateCcw size={18}/>:<Play size={18} fill="currentColor"/>}{status==='ready'?'Начать игру':status==='paused'?'Продолжить':'Заново'}</button>
        </div>}
      </div>
    </div>
    <GameControls key={`${type}-${status}`} type={type} onInput={input} disabled={overlay}/>
    <p className={styles.gameHint}>{info.hint}</p>
  </section>;
}
