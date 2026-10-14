import {incidentGroups} from '../lib/coachOperationsPresentation.mjs';
const date=value=>value?new Date(value).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'Дата не передана';
function Event({event,archived=false}){return <article className="coach-incident-event"><strong>{event.status==='resolved'?'Устранено':archived?'Историческое событие':'Активно'} · {event.status==='resolved'?'Восстановление подтверждено':event.title}</strong><p>{event.message}</p><small>{date(event.occurredAt)} · {event.status==='resolved'?'Прежний сигнал: '+event.title:event.kind}</small></article>;}
export default function OperationalIncidents({notifications=[]}){
 const {active,archive}=incidentGroups(notifications);
 return <section className="coach-incident-journal" aria-label="SLO-инциденты"><h3>Активные SLO-инциденты · {active.length}</h3>{active.length?active.map(event=><Event key={event.eventId} event={event}/>):<p>В загруженном журнале активных SLO-событий нет.</p>}<details><summary>Архив событий · {archive.length}</summary><p>Последние 30 уведомлений. Отсутствие события в этом окне не подтверждает его устранение.</p>{archive.map(event=><Event key={event.eventId} event={event} archived/>)}</details></section>;
}
