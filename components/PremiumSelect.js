import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import styles from './PremiumSelect.module.css';

const plain = node => Children.toArray(node).map(child => isValidElement(child) ? plain(child.props.children) : String(child ?? '')).join('');
function optionRows(children, inheritedDisabled = false) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment || child.type === 'optgroup') return optionRows(child.props.children, inheritedDisabled || child.props.disabled);
    if (child.type !== 'option') return [];
    return [{ value: child.props.value ?? plain(child.props.children), label: plain(child.props.children), disabled: inheritedDisabled || child.props.disabled, sub: child.props.title }];
  });
}

// Accepts existing native-select handlers as well as the coach's options API.
export default function PremiumSelect({ value, defaultValue, onChange, options, children, className = '', title, disabled = false, compact = false, id, name, onBlur, onFocus, ...props }) {
  const uid = useId(), trigger = useRef(null), popup = useRef(null), search = useRef(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null), [query, setQuery] = useState(''), [active, setActive] = useState(0), [label, setLabel] = useState(''), [local, setLocal] = useState(defaultValue);
  const rows = options || optionRows(children), selected = rows.find(row => String(row.value) === String(value ?? local)) || rows[0];
  const filtered = rows.filter(row => `${plain(row.label)} ${row.sub || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const listId = `${uid}-list`, searchable = rows.length > 7;
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); }
  function choose(row) {
    if (!row || row.disabled || disabled || trigger.current?.matches(':disabled')) return;
    setLocal(row.value); close(true);
    if (String(row.value) !== String(value ?? local)) {
      const target = { value: String(row.value), name, id, type: 'select-one' };
      onChange?.(options ? row.value : { target, currentTarget: target, type: 'change' });
    }
  }
  useEffect(() => {
    if (props['aria-label'] || props['aria-labelledby'] || title) return;
    const parent = trigger.current?.closest('label') || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
    if (parent) {
      const copy = parent.cloneNode(true); copy.querySelectorAll('button,input,select,textarea').forEach(node => node.remove());
      setLabel(copy.textContent.trim());
    }
  });
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const viewport = window.visualViewport, vw = viewport?.width || innerWidth, vh = viewport?.height || innerHeight, offset = viewport?.offsetTop || 0;
      const bounds = trigger.current.closest('dialog[open]')?.getBoundingClientRect();
      const leftBound = Math.max(8, bounds?.left || 0), rightBound = Math.min(vw - 8, bounds?.right || vw), topBound = Math.max(offset + 8, bounds?.top || 0), bottomBound = Math.min(vh + offset - 8, bounds?.bottom || vh + offset);
      if (rect.bottom < topBound || rect.top > bottomBound) { close(); return; }
      const height = Math.min(390, rows.length * 48 + (searchable ? 72 : 36)), below = bottomBound - rect.bottom - 8, above = rect.top - topBound - 8, up = below < Math.min(height, 220) && above > below;
      const maxHeight = Math.max(96, Math.min(height, up ? above : below)), width = Math.min(Math.max(rect.width, Math.min(320, vw - 16)), rightBound - leftBound);
      setPosition({ left: Math.max(leftBound, Math.min(rect.left, rightBound - width)), top: up ? Math.max(topBound, rect.top - maxHeight - 8) : Math.min(rect.bottom + 8, bottomBound - maxHeight), width, maxHeight });
    };
    const outside = event => { if (!trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) close(); };
    place(); document.addEventListener('pointerdown', outside); window.addEventListener('resize', place); window.addEventListener('scroll', place, true); window.visualViewport?.addEventListener('resize', place);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.visualViewport?.removeEventListener('resize', place); };
  }, [open, rows.length, searchable]);
  useEffect(() => { if (open && position && searchable) search.current?.focus({ preventScroll: true }); }, [open, !!position, searchable]);
  useEffect(() => { if (open) document.getElementById(`${uid}-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, uid]);
  function show() {
    if (disabled || trigger.current?.matches(':disabled')) return;
    setQuery(''); setActive(Math.max(0, rows.findIndex(row => String(row.value) === String(value ?? local)))); setPosition(null); setOpen(true);
  }
  function key(event) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (event.target === search.current && ['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); if (!open) { show(); return; }
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1);
      next = Math.max(0, Math.min(filtered.length - 1, next));
      while (filtered[next]?.disabled && next >= 0 && next < filtered.length) next += event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
      if (filtered[next]) setActive(next);
    } else if (event.key === 'Enter' || event.key === ' ' && event.target !== search.current) {
      event.preventDefault(); event.stopPropagation(); if (open) choose(filtered[active]); else show();
    } else if (open && event.target !== search.current && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const found = filtered.findIndex(row => !row.disabled && plain(row.label).toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())); if (found >= 0) setActive(found);
    }
  }
  const accessible = props['aria-label'] || title || label || undefined;
  return <>
    <button {...props} id={id} name={name} ref={trigger} type="button" role="combobox" aria-label={accessible} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && filtered[active] ? `${uid}-option-${active}` : undefined} disabled={disabled} title={title} onFocus={onFocus} onBlur={onBlur} onKeyDown={key} onClick={() => open ? close() : show()} className={`${className} ${styles.trigger} ${compact ? styles.compact : ''}`}>
      <span>{selected?.label || 'Выберите'}</span><ChevronDown size={15} aria-hidden="true" className={open ? styles.rotated : ''} />
    </button>
    {open && position && createPortal(<div ref={popup} className={styles.popup} style={position} onClick={event => event.stopPropagation()} onKeyDown={key}>
      {searchable ? <div className={styles.search}><Search size={15} aria-hidden="true" /><input ref={search} type="search" aria-label={`Поиск: ${accessible || 'вариант'}`} value={query} placeholder="Найти вариант…" autoComplete="off" aria-controls={listId} aria-activedescendant={filtered[active] ? `${uid}-option-${active}` : undefined} onChange={event => { setQuery(event.target.value); setActive(0); }} /></div> : <div className={styles.caption}>{accessible || 'Выберите вариант'}</div>}
      <div id={listId} role="listbox" aria-label={accessible} className={styles.options}>{filtered.map((row, index) => <button type="button" tabIndex={-1} id={`${uid}-option-${index}`} key={String(row.value)} role="option" aria-selected={String(row.value) === String(value ?? local)} disabled={row.disabled} data-active={active === index} onPointerMove={() => setActive(index)} onClick={event => { event.preventDefault(); choose(row); }} className={styles.option}><span className={styles.tick}>{String(row.value) === String(value ?? local) && <Check size={13} aria-hidden="true" />}</span><span><strong>{row.label}</strong>{row.sub && <small>{row.sub}</small>}</span></button>)}{!filtered.length && <p className={styles.empty}>Ничего не найдено</p>}</div>
    </div>, trigger.current?.closest('dialog[open], [role="dialog"]') || document.querySelector('main') || document.body)}
  </>;
}
