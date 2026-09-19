import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from 'lucide-react';
import { BOARD_SIZE, newSnake, stepSnake } from '../../lib/restSnake.mjs';
import styles from './RestSnake.module.css';

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
const CONTROLS = [['up', 'Вверх', ArrowUp], ['left', 'Влево', ArrowLeft], ['down', 'Вниз', ArrowDown], ['right', 'Вправо', ArrowRight]];

export default function RestSnake({ remaining, onClose }) {
  const [game, setGame] = useState(newSnake);
  const dialog = useRef(null);
  const pending = useRef(null);
  const steer = direction => { if (!pending.current) pending.current = direction; };

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const keydown = event => {
      const direction = KEYS[event.key];
      if (direction) { event.preventDefault(); steer(direction); }
    };
    window.addEventListener('keydown', keydown);
    const interval = setInterval(() => {
      if (document.hidden) { pending.current = null; return; }
      const direction = pending.current;
      pending.current = null;
      setGame(current => stepSnake(current, direction));
    }, 170);
    return () => { clearInterval(interval); window.removeEventListener('keydown', keydown); };
  }, []);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="rest-snake-title" onCancel={onClose}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>МИНИ-ПАУЗА</span><h2 id="rest-snake-title">Змейка</h2></div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть игру" autoFocus><X size={20} /></button>
      </header>
      <div className={styles.stats}>
        <span>Счёт <b>{String(game.score).padStart(2, '0')}</b></span>
        <span className={remaining <= 10 ? styles.ending : ''}>Отдых <b>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</b></span>
      </div>
      <div className={styles.board}>
        <svg viewBox={`0 0 ${BOARD_SIZE * 10} ${BOARD_SIZE * 10}`} role="img" aria-label={`Поле змейки. Счёт: ${game.score}`}>
          <defs><pattern id="snake-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#96eec9" strokeOpacity=".07" strokeWidth=".4" /></pattern></defs>
          <rect width="160" height="160" fill="url(#snake-grid)" />
          {game.food && <rect x={game.food[0] * 10 + 2} y={game.food[1] * 10 + 2} width="6" height="6" fill="#ffc078" />}
          {game.snake.map(([x, y], index) => <rect key={`${x}-${y}`} x={x * 10 + .6} y={y * 10 + .6} width="8.8" height="8.8" fill={index === 0 ? '#e2fff1' : '#79dfb0'} />)}
        </svg>
        {game.status !== 'playing' && <div className={styles.result} role="status">
          <strong>{game.status === 'won' ? 'Всё поле твоё!' : 'Попробуем ещё?'}</strong>
          <span>Счёт: {game.score}</span>
          <button type="button" onClick={() => { pending.current = null; setGame(newSnake()); }}>Заново</button>
        </div>}
      </div>
      <div className={styles.controls} aria-label="Управление змейкой">
        {CONTROLS.map(([direction, label, Icon]) => <button type="button" key={direction} className={styles[direction]} aria-label={label} onClick={() => steer(direction)}><Icon size={25} strokeWidth={2.5} /></button>)}
      </div>
      <p className={styles.hint}>Собирай пиксели · управляй стрелками<br />Когда отдых закончится, игра закроется сама.</p>
    </dialog>
  );
}
