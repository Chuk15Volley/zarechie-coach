// Coach presentation only. Never changes source decisions or stored programs.
export function coachTrainingTitle(value){
 const names={inseason_strength:'Силовая',inseason_power:'Мощность / скорость',power_speed:'Мощность / скорость',strength_training_draft:'Силовая',recovery_review:'Восстановление / профилактика',full_body:'Всё тело',posterior_chain:'Задняя цепь',anterior_chain:'Передняя цепь',development:'Развивающая',maintenance:'Поддерживающая'};
 const parts=String(value || '').split(/\s*[·•]\s*/).map(part=>names[part] || part.trim()).filter(part=>part && !/^(?:копия программы|проверка тренером|программа|командн(?:ый|ая) программа|командный черновик)$/i.test(part));
 return [...new Set(parts)].join(' · ') || 'Тренировка';
}
export function coachNeedsDecision(item){
 const r=item.readiness || {},s=item.status || {},rtp=item.returnToPlay || {};
 // Unknown/missing sources have their own data filter; explicit red/clinical signals remain visible.
 return ['red','yellow'].includes(r.status) || !!rtp.active || !!s.developmentPlan?.review?.due || !!s.activeInjuries?.length || !!s.live?.alerts?.length || !!s.pendingCommands?.length || !!r.hardStop || !!r.hardStopSignal || !!r.readySixState?.hardStop || !!r.readySixState?.hardStopSignal || /(?:^|\s)(?:Боль\s|Исключить\s|Ограничить\s)/i.test([r.readySixState?.detail,...(item.recommendation?.reasons || [])].filter(Boolean).join(' '));
}
export function warmupScope(workspace,date){return workspace+':'+date;}
export function scopedWarmup(record,workspace,date){return record?.scope===warmupScope(workspace,date) && record.plan?.date===date?record.plan:null;}

export function commonCorrectionRule(session){
 const counts=new Map();for(const ex of (session?.blocks || []).flatMap(b=>b.exercises || [])){if(ex.autoReg)counts.set(ex.autoReg,(counts.get(ex.autoReg) || 0)+1);}
 return [...counts].sort((a,b)=>b[1]-a[1]).find(([,count])=>count>1)?.[0] || '';
}
