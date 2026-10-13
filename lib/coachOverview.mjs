// Presentation only: source quality never recalculates medical permission or load.
const labels={whoop:'WHOOP',survey:'Опрос ReadySix',neuro:'Прыжковые / скоростные тесты',lsi:'LSI'};
const array=value=>Array.isArray(value)?value:[];
export function readinessIssues(readiness, envelope={}) {
 envelope ||= {};
 const issues=[];
 if(envelope.error)issues.push({kind:'unavailable',text:'ReadySix не обновлён: '+envelope.error});
 else if(envelope.cache==='stale')issues.push({kind:'stale',text:'ReadySix: предыдущий снимок после ошибки обновления'});
 else if(envelope.revalidating)issues.push({kind:'stale',text:'ReadySix: обновление снимка ещё выполняется'});
 if(!readiness?.id){issues.push({kind:'missing',text:'Нет состояния игрока из ReadySix'});return issues;}
 const provenance=readiness.dataProvenance || {},stale=new Set(array(provenance.staleSources));
 for(const source of stale){const date=provenance.sourceFreshness?.[source]?.date;issues.push({kind:'stale',text:(labels[source] || source)+': устарело'+(date?' · '+date:'')});}
 for(const source of array(provenance.missingSources))if(!stale.has(source))issues.push({kind:'missing',text:(labels[source] || source)+': нет данных'});
 return issues;
}
export function loadEvidenceLabel(evidence) {
 if(!evidence || evidence.source==='no_session')return null;
 if(evidence.supplementStatus==='stale')return {kind:'stale',text:'Дополнение тренера устарело; проверьте исходный факт'};
 if(evidence.source==='missing')return {kind:'missing',text:'Факт не записан'};
 if(evidence.partial)return {kind:'missing',text:Number(evidence.missingSets)>0?`Нет кг / повторов: ${evidence.missingSets} подх.`:'Фактические данные неполные'};
 if(evidence.source==='coach_verified')return {kind:'verified',text:'Факт дополнен тренером'};
 return null;
}
export function draftForPlayer(results,playerId,workspace,date) {
 return array(results).find(row=>String(row.playerId)===String(playerId) && row.workspace===workspace && row.date===date && row.status==='done' && row.draft && !row.saved) || null;
}
export function summarizeLoadOverview(data={}) {
 const players=array(data.players),dates=array(data.dates);let actual=0,planned=0,gaps=0,verified=0;
 for(const player of players)for(const date of dates){actual+=Number(player.byDay?.[date]) || 0;planned+=Number(player.plannedByDay?.[date]) || 0;const label=loadEvidenceLabel(player.evidenceByDay?.[date]);if(['missing','stale'].includes(label?.kind))gaps++;if(label?.kind==='verified')verified++;}
 return {actual,planned,gaps,verified,players:players.length};
}
