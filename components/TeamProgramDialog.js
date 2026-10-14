import {correctionStatus} from '../lib/correctionInteraction.mjs';
import CoachAvatar from './CoachAvatar';
import {useEffect,useRef} from 'react';
export default function TeamProgramDialog({open,name,player,date,opening,saving,error,saved,dirty=false,onUndo,onRedo,canUndo=false,canRedo=false,saveBlocked=false,draftSaved=false,onClose,onSave,onSaveNext,validationBlocked=false,onSaveDraft,onPrevious,onNext,children}){
 const dialog=useRef(null);
 useEffect(()=>{if(open && !dialog.current.open)dialog.current.showModal();if(!open && dialog.current.open)dialog.current.close();},[open]);
 const navLocked=saved && dirty;
 const advance=!saved && onSaveNext && (onNext || onPrevious),disabled=saving || opening || (saved && !dirty) || saveBlocked || validationBlocked;
 const secondary=fn=>event=>{event.currentTarget.closest('details')?.removeAttribute('open');fn();};
 return <dialog ref={dialog} className="team-program-dialog" aria-label={`Коррекция программы · ${name}`} onCancel={event=>{event.preventDefault();if(!saving)onClose();}}>
  <header className="team-program-dialog-heading"><div className="coach-dialog-player"><CoachAvatar player={player || {name}}/><div><p>{date}</p><h2>{name}</h2><span>{opening?'Открываю…':correctionStatus({saved,dirty,draftSaved,saving,blocked:saveBlocked})}{navLocked?' · сохраните правки перед переходом':''}</span></div></div>
  <div className="team-program-dialog-actions"><button type="button" onClick={onUndo} disabled={saving || opening || !canUndo || saveBlocked} aria-label="Отменить последнюю правку" title="⌘Z / Ctrl+Z вне поля">↶</button><button type="button" onClick={onRedo} disabled={saving || opening || !canRedo || saveBlocked} aria-label="Повторить последнюю правку" title="⌘⇧Z / Ctrl+Y вне поля">↷</button><button type="button" disabled={saving || opening || navLocked || !onPrevious} onClick={onPrevious} aria-label="Предыдущий игрок" title="Предыдущий игрок">←</button><button type="button" disabled={saving || opening || navLocked || !onNext} onClick={onNext} aria-label="Следующий игрок" title="Следующий игрок">→</button>
  <button type="button" className="team-primary-action" disabled={disabled} onClick={advance?onSaveNext:onSave} title={advance?'⌘⇧S / Ctrl+Shift+S':'⌘S / Ctrl+S'}>{saving?'Сохраняю…':saved?dirty?'Сохранить изменения':'Сохранено':advance?'Сохранить и следующий →':'Сохранить и закрыть'}</button>
  <details className="coach-save-options" onKeyDown={e=>{if(e.key==='Escape' && e.currentTarget.open){e.preventDefault();e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label="Варианты сохранения">Ещё</summary><div>{advance && <button type="button" disabled={disabled} onClick={secondary(onSave)}>Сохранить и закрыть</button>}{onSaveDraft && <button type="button" disabled={saving || opening || saveBlocked || validationBlocked} onClick={secondary(onSaveDraft)}>Сохранить черновик на сервере</button>}<p>Черновик игроку не выдаётся.</p></div></details>
  <button type="button" className="team-dialog-close" disabled={saving} onClick={onClose} aria-label="Закрыть карточку программы">✕</button></div></header>
  <div className="team-program-dialog-body">{error && <p role="alert" className="coach-data-warning">{error}</p>}{opening?<p role="status" className="team-draft-opening">Открываю программу…</p>:children}</div>
 </dialog>;
}
