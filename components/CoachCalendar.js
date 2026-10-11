import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarToday, calendarWeek, calendarMonthCells, shiftCalendarDate, shiftCalendarMonth, calendarDateAllowed, validCalendarDate } from '../lib/coachCalendar.mjs';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const label = date => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const compactLabel = date => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const monthLabel = month => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));

export default function CoachCalendar({ value, onChange, minDate, maxDate, size = 'default', className = '', navigate = false, quickDays = false, disabled = false, timeZone = 'Europe/Moscow' }) {
  const selected = validCalendarDate(value) ? value : calendarToday(new Date(),timeZone);
  const today = calendarToday(new Date(),timeZone);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [position, setPosition] = useState(null);
  const [focusDate, setFocusDate] = useState(selected);
  const trigger = useRef(null), panel = useRef(null);
  const id = useId();
  const allowed = date => !disabled && calendarDateAllowed(date, minDate, maxDate);
  const previous = shiftCalendarDate(selected, -1), next = shiftCalendarDate(selected, 1);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = date => { if (allowed(date)) { onChange(date); close(); } };
  useEffect(() => { setMonth(selected.slice(0, 7)); setFocusDate(selected); }, [selected]);
  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(window.innerWidth < 640 ? 308 : 280, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom;
      const height = Math.min(window.innerWidth < 640 ? 450 : 370, window.innerHeight - 24);
      setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: below >= height + 8 ? rect.bottom + 8 : Math.max(12, rect.top - height - 8), maxHeight: height });
    }
    function outside(event) { if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); }
    function key(event) { if (event.key === 'Escape') { event.preventDefault(); close(); } }
    place(); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => { if (open && position) panel.current?.querySelector(`[data-date="${focusDate}"]`)?.focus(); }, [open, position, focusDate, month]);
  function moveMonth(delta) { const nextMonth = shiftCalendarMonth(month, delta); setMonth(nextMonth); setFocusDate(`${nextMonth}-01`); }
  function keyboard(event, date) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (delta === undefined) return;
    event.preventDefault(); const target = shiftCalendarDate(date, delta);
    if (allowed(target)) { setFocusDate(target); setMonth(target.slice(0, 7)); }
  }
  const buttonStyle = 'grid min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-30';
  return <div className={`min-w-0 ${className}`} aria-label={navigate ? 'Переключение дней' : undefined}>
    <div className={`flex items-center gap-1.5 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {navigate && <button type="button" className={buttonStyle} disabled={!allowed(previous)} aria-label="Предыдущий день" onClick={() => onChange(previous)}><ChevronLeft size={17} /></button>}
      <button ref={trigger} type="button" disabled={disabled} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" aria-label={`Открыть календарь: ${label(selected)}`} onClick={() => { setMonth(selected.slice(0, 7)); setFocusDate(selected); setOpen(v => !v); }} className="flex min-h-11 sm:min-h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 font-semibold text-slate-200 hover:border-cyan-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-30">
        <Calendar size={15} className="shrink-0 text-cyan-300" /><span className="truncate">{compactLabel(selected)}</span>
      </button>
      {navigate && <button type="button" className={buttonStyle} disabled={!allowed(next)} aria-label="Следующий день" onClick={() => onChange(next)}><ChevronRight size={17} /></button>}
      {navigate && <button type="button" disabled={!allowed(today)} onClick={() => onChange(today)} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-cyan-200 hover:bg-white/5 disabled:opacity-30 sm:min-h-8">Сегодня</button>}
    </div>
    {quickDays && <div className="mt-2 grid grid-cols-7 gap-1" aria-label="Дни недели">{calendarWeek(selected).map((date, i) => <button type="button" key={date} disabled={!allowed(date)} aria-label={label(date)} aria-pressed={date === value} aria-current={date === today ? 'date' : undefined} onClick={() => onChange(date)} className={`min-h-11 sm:min-h-8 rounded-lg py-1 text-center disabled:opacity-25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${date === value ? 'bg-cyan-300 font-bold text-slate-950' : date === today ? 'border border-cyan-300/40 text-cyan-200' : 'bg-white/[0.03] text-slate-400 hover:bg-white/10'}`}><span className="block text-[9px]">{weekdays[i]}</span><span className="block text-xs">{Number(date.slice(-2))}</span></button>)}</div>}

    {open && position && createPortal(<div ref={panel} id={id} role="dialog" aria-label="Выбор даты" className="premium-popover fixed z-[200] overflow-auto rounded-2xl border border-white/15 bg-[#0b1724] p-3 font-sans shadow-2xl" style={{ ...position, fontFamily: 'var(--font-manrope, ui-sans-serif), system-ui, sans-serif' }}>
      <div className="mb-2 flex items-center gap-2"><button type="button" className={buttonStyle} aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button><span className="flex-1 text-center text-sm font-bold capitalize text-slate-100" aria-live="polite">{monthLabel(month)}</span><button type="button" className={buttonStyle} aria-label="Следующий месяц" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button></div>
      <div className="grid grid-cols-7">{weekdays.map(day => <span key={day} className="py-1 text-center text-xs text-slate-400">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1" aria-label="Даты месяца">{calendarMonthCells(month).map(({ date, inMonth }) => <button type="button" key={date} data-date={date} tabIndex={date === focusDate ? 0 : -1} disabled={!allowed(date)} aria-label={label(date)} aria-pressed={date === value} aria-current={date === today ? 'date' : undefined} onKeyDown={event => keyboard(event, date)} onClick={() => choose(date)} className={`min-h-11 sm:min-h-8 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-20 ${date === value ? 'bg-cyan-300 font-bold text-slate-950' : date === today ? 'border border-cyan-300/50 text-cyan-200' : inMonth ? 'text-slate-200 hover:bg-white/10' : 'text-slate-500 hover:bg-white/10'}`}>{Number(date.slice(-2))}</button>)}</div>
      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2"><button type="button" className="min-h-11 sm:min-h-8 rounded-xl px-3 text-sm font-semibold text-cyan-200 disabled:opacity-30" disabled={!allowed(today)} onClick={() => choose(today)}>Сегодня</button><button type="button" className="min-h-11 sm:min-h-8 rounded-xl px-3 text-sm text-slate-400" onClick={close}>Закрыть</button></div>
    </div>, document.body)}
  </div>;
}
