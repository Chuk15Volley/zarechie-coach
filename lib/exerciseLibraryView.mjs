export const LIBRARY_GROUPS=[['all','Все движения'],['squat','Присед'],['hinge','Задняя цепь'],['lunge','Одноногая работа'],['pull','Тяга'],['press','Жим'],['core','Кор'],['jump','Прыжок / бросок'],['mobility','Подвижность'],['other','Другие']];
export function eligibleLibraryCard(card,restrictions,isBanned,hasRestriction){return typeof card?.title==='string' && !!card.title.trim() && !isBanned(card.title) && !/incline push[ -]?up|наклонн.*отжим/i.test(card.title) && !hasRestriction(card.title,restrictions);}
export function libraryGroup(name=''){
 const rules=[['mobility',/mobility|mobilization|stretch|foam roll|мфр|мобил|растяж|breath|дыхани|shoulder.*rotation|shoulder.*cars/i],['core',/plank|pallof|dead bug|bird.?dog|rollout|планк|кор\b/i],['jump',/jump|hop|pogo|bound|throw|pass|slam|прыж|брос/i],['lunge',/lunge|split squat|step[ -]?(up|down)|выпад|болгар/i],['hinge',/deadlift|rdl\b|hip (thrust|hinge)|glute bridge|clamshell|leg curl|hamstring|back extension|гиперэкстенз|румын/i],['squat',/squat|присед/i],['pull',/row|pull|chin.?up|тяга|подтяг/i],['press',/press|push.?up|жим|отжим/i]];
 return rules.find(([,pattern])=>pattern.test(name))?.[0] || 'other';
}
export function libraryVideoId(url){
 try{const parsed=new URL(String(url || '')),host=parsed.hostname.toLowerCase().replace(/^www\./,'');if(!['https:','http:'].includes(parsed.protocol))return null;
 const id=host==='youtu.be'?parsed.pathname.split('/')[1]:['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)?parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1]:null;
 return /^[\w-]{11}$/.test(id || '')?id:null;}catch{return null;}
}
export function libraryMatches(card,{search='',group='all',media='all',equipment='all',region='all',exact=false}={}){
 const haystack=String(card.title || '').toLowerCase();
 return (exact?haystack===search.trim().toLowerCase():search.trim().toLowerCase().split(/\s+/).every(word=>haystack.includes(word))) && (equipment==='all' || libraryEquipment(card.title)===equipment) && (region==='all' || libraryRegion(card.title)===region) && (group==='all' || libraryGroup(card.title)===group) && (media==='all' || (media==='video')===!!libraryVideoId(card.video || card.autoVideo));
}
// Search facets only, not clinical suitability or an equipment prescription.
export const LIBRARY_EQUIPMENT=[['all','Любой инвентарь'],['db','Гантели'],['kb','Гири'],['barbell','Штанга'],['landmine','Landmine'],['band','Резина'],['cable','Блок'],['ball','Мяч'],['bodyweight','Собственный вес / без нагрузки'],['other','Не определён']];
export const LIBRARY_REGIONS=[['all','Все области'],['upper','Верх тела'],['lower','Низ тела'],['core','Кор'],['other','Не определена']];
export function libraryEquipment(name=''){
 return [['landmine',/landmine/i],['db',/\bdb\b|dumbbell|гантел/i],['kb',/\bkb\b|kettlebell|гир/i],['barbell',/barbell|штанг|trap.?bar/i],['band',/band|резин/i],['cable',/cable/i],['ball',/medicine ball|\bmb\b|med.?ball/i],['bodyweight',/unloaded|bodyweight|plank|push.?up|clamshell|glute bridge|mobility|stretch|calf raise|tibialis raise/i]].find(([,re])=>re.test(name))?.[0] || 'other';
}
export function libraryRegion(name=''){
 if(/plank|pallof|dead bug|bird.?dog|rollout|rotation|кор\b/i.test(name))return 'core';
 if(/shoulder|press|row|pull|chest|bench|bicep|tricep|плеч|жим|тяга.*рук/i.test(name))return 'upper';
 if(/squat|lunge|leg|hip|glute|calf|ankle|hamstring|deadlift|tibialis|прыж|присед|голеностоп/i.test(name))return 'lower';
 return 'other';
}
