export const LIBRARY_GROUPS=[['all','Все движения'],['squat','Присед'],['hinge','Задняя цепь'],['lunge','Одноногая работа'],['pull','Тяга'],['press','Жим'],['core','Кор'],['jump','Прыжок / бросок'],['mobility','Подвижность'],['other','Другие']];
export function eligibleLibraryCard(card,restrictions,isBanned,hasRestriction){return typeof card?.title==='string' && !!card.title.trim() && !isBanned(card.title) && !/incline push[ -]?up|наклонн.*отжим/i.test(card.title) && !hasRestriction(card.title,restrictions);}
export function libraryGroup(name=''){
 const rules=[['mobility',/mobility|stretch|foam roll|мфр|мобил|растяж|breath|дыхани/i],['core',/plank|pallof|dead bug|bird.?dog|rollout|планк|кор\b/i],['jump',/jump|hop|pogo|bound|throw|slam|прыж|брос/i],['lunge',/lunge|split squat|step[ -]?(up|down)|выпад|болгар/i],['hinge',/deadlift|rdl\b|hip (thrust|hinge)|leg curl|hamstring|back extension|гиперэкстенз|румын/i],['squat',/squat|присед/i],['pull',/row|pull|chin.?up|тяга|подтяг/i],['press',/press|push.?up|жим|отжим/i]];
 return rules.find(([,pattern])=>pattern.test(name))?.[0] || 'other';
}
export function libraryVideoId(url){
 try{const parsed=new URL(String(url || '')),host=parsed.hostname.toLowerCase().replace(/^www\./,'');if(!['https:','http:'].includes(parsed.protocol))return null;
 const id=host==='youtu.be'?parsed.pathname.split('/')[1]:['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)?parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1]:null;
 return /^[\w-]{11}$/.test(id || '')?id:null;}catch{return null;}
}
export function libraryMatches(card,{search='',group='all',media='all'}={}){
 const haystack=String(card.title || '').toLowerCase();
 return search.trim().toLowerCase().split(/\s+/).every(word=>haystack.includes(word)) && (group==='all' || libraryGroup(card.title)===group) && (media==='all' || (media==='video')===!!libraryVideoId(card.video || card.autoVideo));
}
