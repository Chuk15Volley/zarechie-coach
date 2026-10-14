// Presentation never acknowledges or resolves an incident.
export function incidentGroups(notifications=[]){
 const ordered=[...notifications].sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt))),latest=new Map();
 for(const event of ordered){const key=event.kind+':'+(event.channel || 'in-app');if(!latest.has(key))latest.set(key,event);}
 return {active:[...latest.values()].filter(event=>event.status==='firing'),archive:ordered.filter(event=>event.status==='resolved' || latest.get(event.kind+':'+(event.channel || 'in-app'))!==event)};
}
export function healthReasons({checks={},services={},generationPerformance={},errors24h=0,readinessPerformance={}}){
 const reasons=[];
 for(const [key,label] of Object.entries({redis:'Хранилище недоступно',readySix:'Интеграция ReadySix не настроена',ai:'Сервис подготовки не настроен',trainerAuth:'Доступ тренера не настроен',backup:'Нет свежей резервной копии',recovery:'Нет свежего подтверждения восстановления'}))if(services[key]===false)reasons.push(label);
 if(checks.historyIntegrity===false)reasons.push('Полнота истории не подтверждена');
 if(generationPerformance.needsAttention)reasons.push('Мониторинг подготовки требует внимания — откройте активные сбои');
 if(errors24h>0)reasons.push(`Ошибок в журнале за 24 часа: ${errors24h} — проверьте их итоговый статус`);
 if(readinessPerformance.healthy===false)reasons.push(readinessPerformance.enoughSamples?'Превышено время ответа ReadySix':'Недостаточно наблюдений для оценки скорости ReadySix');
 return reasons;
}
export function releasePassport(env=process.env){
 const date=value=>value && Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 return {commit:env.SOURCE_REVISION || env.VERCEL_GIT_COMMIT_SHA || null,deploymentId:env.GYM_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID || null,environment:env.GYM_DEPLOYMENT_ENV || env.VERCEL_ENV || env.NODE_ENV || 'unknown',builtAt:date(env.GYM_BUILD_AT),publishedAt:date(env.GYM_PUBLISHED_AT)};
}
