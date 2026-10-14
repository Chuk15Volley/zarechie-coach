import CoachAvatar from './CoachAvatar';
import {ArrowRight,Users} from 'lucide-react';
const initials=name=>String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('');
export default function CoachHome({workspace,players,date,calendar,onSelectPlayer,onNavigate}){
 const name=workspace==='nkperf'?'NK Performance':'Заречье';
 return <section className="coach-home print:hidden" aria-label={'Главный экран · '+name}>
  <header className="coach-home-header"><div><p className="coach-eyebrow">Korenchuk / Performance System</p><h1>Игроки</h1><p className="coach-home-subtitle">{name}<span aria-hidden="true"> / </span>{players.length?'В составе: '+players.length:'Загрузка состава…'}</p></div><div className="coach-home-calendar"><span>Дата планирования</span>{calendar}</div></header>
  <div className="coach-home-roster"><div className="coach-section-heading"><div><p className="coach-eyebrow">Персональная работа</p><h2>Индивидуальная работа</h2></div><span className="coach-count"><Users size={14}/>{players.length || '—'}</span></div><div className="coach-home-players">{players.map(player=><button type="button" key={player.id} className="coach-home-player" onClick={()=>onSelectPlayer(player)}><CoachAvatar player={player}/><span className="coach-player-copy"><strong>{player.name}</strong><small>{player.position || 'Амплуа не указано'}</small></span><ArrowRight size={14}/></button>)}</div>{!players.length && <p role="status" className="coach-empty">Загружаю актуальный состав из ReadySix…</p>}</div>
  <p className="coach-home-footnote">Состояние и допуск — из ReadySix. Программы и фактические результаты — в зале.</p>
 </section>;
}
