// Display policy only. Never changes prescriptions, readiness or stored evidence.
export function coachDate(value,year=false){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')))return value || '—';
 return new Date(value+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'});
}
export function trainingTitle(value){
 const names={recovery_review:'Восстановление / профилактика',strength_training_draft:'Силовая · черновик',power_speed:'Мощность / скорость'};
 return [...new Set(String(value || 'Тренировка').split(' · ').map(part=>names[part] || part).filter(part=>part!=='программа'))].join(' · ');
}
export function sourceStatusLabel(label){return label==='План без индивидуальных ограничений'?'Статус ReadySix: базовый план':label || 'Состояние не передано';}
export function recommendationLabel(label){return label==='План без индивидуальных ограничений'?'План с учётом локальных ограничений':label;}
export function factAmount(value,evidence,hasSession=true){
 if(!hasSession)return 'Нет программы';
 if(value==null || value==='' || !Number.isFinite(Number(value)) || evidence?.source==='missing' || (Number(value)===0 && (evidence?.partial || evidence?.supplementStatus==='stale')))return 'Нет факта';
 return Number(value)>=1000?`${(Number(value)/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} т`:`${Number(value).toLocaleString('ru-RU',{maximumFractionDigits:1})} кг`;
}
export function sessionFactAmount(value,evidence,execution,hasSession=true){
 if(!hasSession || evidence?.source==='no_session')return 'Нет программы';
 if((value==null || Number(value)===0) && !execution?.completed && !(execution?.completedSets>0))return 'Факт ещё не записан';
 return factAmount(value,evidence,hasSession);
}
export function commentRpe(note,target){
 if(target!=null && target!=='' && Number.isFinite(Number(target)))return null;
 const match=String(note || '').match(/\bRPE\s*(\d+(?:[.,]\d+)?)(?:\s*[–—-]\s*(\d+(?:[.,]\d+)?))?/i);
 if(!match)return null;const values=match.slice(1).filter(Boolean).map(v=>Number(v.replace(',','.')));
 return values.every(v=>v>=1 && v<=10)?match[0].replace(/\s+/g,' '):null;
}
export function activeServiceProblems(services={}){return Object.entries(services).filter(([,ok])=>ok===false).map(([name])=>({backup:'Нет свежей резервной копии',recovery:'Нет свежей проверки восстановления',redis:'Хранилище требует проверки',readySix:'Источник ReadySix недоступен',ai:'Сервис генерации требует проверки',trainerAuth:'Доступ тренера требует проверки',auth:'Доступ тренера требует проверки'}[name] || 'Требует проверки: '+name));}
export function incidentGuidance(code){
 if(['NETWORK_INTERRUPTED','POLL_TIMEOUT','SERVICE_UNAVAILABLE','RATE_LIMIT'].includes(code))return 'Проверьте очередь: готовый черновик мог сохраниться. Обновите статус перед повтором.';
 if(['PREPARATION_FAILED','GENERATION_FAILED','QUALITY_REVIEW'].includes(code))return 'Откройте задачу в командных черновиках и её причину. Повторная подготовка создаёт черновик; сохранённую программу не заменяет.';
 return 'Проверьте состояние задачи и публикации в командных черновиках. Повторяйте только незавершённую задачу.';
}
export function sourceHighlights(reasons=[]){
 // Preserve verbatim source symptom/constraint fragments; never infer permission.
 const parts=reasons.flatMap(reason=>String(reason).split(/(?=Боль |WHOOP|RSI|Исключить |Ограничить )/)).map(v=>v.trim()).filter(Boolean);
 return [...new Set(parts.filter(v=>/^(Боль |Исключить |Ограничить )/.test(v)))];
}
export function budgetLabel(budget={}){
 if(budget.status==='calibrating')return 'Недостаточно истории';
 if(!(budget.sets>0 || budget.tonnage>0))return 'Процент не рассчитан';
 return Number.isFinite(Number(budget.utilizationPercent))?`${budget.utilizationPercent}%`:'Процент не рассчитан';
}
