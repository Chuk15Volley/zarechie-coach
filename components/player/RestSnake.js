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
  const pointer = useRef(null);
  const [pressed, setPressed] = useState(null);
  const steer = direction => { if (!pending.current) pending.current = direction; };
  const moveStick = event => {
    if (pointer.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const direction = Math.max(Math.abs(x), Math.abs(y)) < bounds.width / 7 ? null
      : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    setPressed(direction);
    if (direction) pending.current = direction;
  };
  const releaseStick = () => { pointer.current = null; setPressed(null); };

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
      <div className={styles.controls} aria-label="Управление змейкой"
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveStick(event);
        }}
        onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}>
        <span className={styles.stickCenter} aria-hidden="true"><span /></span>
        {CONTROLS.map(([direction, label, Icon]) => <button type="button" key={direction} className={`${styles[direction]} ${pressed === direction ? styles.pressed : ''}`} aria-label={label} onClick={event => { if (event.detail === 0) steer(direction); }}><Icon size={32} strokeWidth={2.5} /></button>)}
      </div>
      <p className={styles.hint}>Нажимай стрелки или веди палец по крестовине.<br />В конце отдыха игра закроется сама.</p>
    </dialog>
  );
}
