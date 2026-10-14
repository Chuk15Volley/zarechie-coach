export const LIBRARY_GROUPS=[['all','Все движения'],['squat','Присед'],['hinge','Задняя цепь'],['lunge','Одноногая работа'],['pull','Тяга'],['press','Жим'],['core','Кор'],['jump','Прыжок / бросок'],['locomotion','Перемещения'],['mobility','Подвижность'],['other','Другие']];
export function eligibleLibraryCard(card,restrictions,isBanned,hasRestriction){return typeof card?.title==='string' && !!card.title.trim() && !isBanned(card.title) && !/incline push[ -]?up|наклонн.*отжим/i.test(card.title) && !hasRestriction(card.title,restrictions);}
export function libraryGroup(name=''){
 if(/sprint|acceleration|shuffle|carioca|lateral cut|drop step|ускорени|приставно[йе]|бег\b/i.test(name))return 'locomotion';
 const rules=[['mobility',/mobility|mobilization|stretch|foam roll|мфр|мобил|растяж|breath|дыхани|shoulder.*rotation|shoulder.*cars/i],['core',/plank|pallof|dead bug|bird.?dog|rollout|планк|кор\b/i],['jump',/jump|hop|pogo|bound|throw|pass|slam|прыж|брос/i],['lunge',/lunge|split squat|step[ -]?(up|down)|выпад|болгар/i],['hinge',/deadlift|rdl\b|hip (thrust|hinge)|glute bridge|clamshell|leg curl|hamstring|back extension|гиперэкстенз|румын/i],['squat',/squat|присед/i],['pull',/row|pull|chin.?up|тяга|подтяг/i],['press',/press|push.?up|жим|отжим/i]];
 return rules.find(([,pattern])=>pattern.test(name))?.[0] || 'other';
}
export function discoveryTask(name=''){
 const text=searchableExercise(name);
 return [['shuffle',/shuffle|приставн/],['sprint',/sprint|acceleration|ускорени/],['cut',/lateral cut|drop step|carioca/],['hinge',/romanian|deadlift|hip hinge/],['bridge',/hip thrust|glute bridge/],['curl',/leg curl|hamstring curl/]].find(([,re])=>re.test(text))?.[0] || libraryGroup(name);
}
export function rankReplacementCards(cards,currentName){
 if(!currentName)return [...cards];
 const task=discoveryTask(currentName),group=libraryGroup(currentName),equipment=libraryEquipment(currentName);
 const score=card=>(discoveryTask(card.title)===task?300:0)+(libraryGroup(card.title)===group?100:0)+(equipment!=='other' && libraryEquipment(card.title)===equipment?25:0)+(libraryVariantMeta(card.title)===libraryVariantMeta(currentName)?10:0);
 return [...cards].sort((a,b)=>score(b)-score(a) || a.title.localeCompare(b.title,'en'));
}
export function libraryVideoId(url){
 try{const parsed=new URL(String(url || '')),host=parsed.hostname.toLowerCase().replace(/^www\./,'');if(!['https:','http:'].includes(parsed.protocol))return null;
 const id=host==='youtu.be'?parsed.pathname.split('/')[1]:['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)?parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1]:null;
 return /^[\w-]{11}$/.test(id || '')?id:null;}catch{return null;}
}
export function libraryMatches(card,{search='',group='all',media='all',equipment='all',region='all',exact=false}={}){
 const haystack=searchableExercise(card.title),query=searchableExercise(search);
 return (exact?String(card.title).toLowerCase()===search.trim().toLowerCase():query.split(/\s+/).filter(Boolean).every(word=>haystack.includes(word) || haystack.split(/\s+/).some(token=>nearWord(word,token)))) && (equipment==='all' || libraryEquipment(card.title)===equipment) && (region==='all' || libraryRegion(card.title)===region) && (group==='all' || libraryGroup(card.title)===group) && (media==='all' || (media==='video')===!!libraryVideoId(card.video || card.autoVideo));
}
// Aliases affect discovery only; canonical exercise identity and history are untouched.
export function searchableExercise(value=''){
 let text=String(value).toLowerCase().replace(/ё/g,'е');
 for(const [re,word] of [[/dumm?bell|dumbbell|гантел[а-я]*/g,' db '],[/kettlebell|гир[яиь]/g,' kb '],[/румын[а-я]*/g,' romanian '],[/станов[а-я]*|\brdl\b/g,' deadlift '],[/жим[а-я]*/g,' press '],[/присед[а-я]*/g,' squat '],[/выпад[а-я]*/g,' lunge '],[/прыж[а-я]*/g,' jump '],[/резин[а-я]*|лент[а-я]*/g,' band '],[/штанг[а-я]*/g,' barbell '],[/на одной ноге|одноног[а-я]*/g,' single leg ']])text=text.replace(re,word);
 if(/тяга/.test(text) && !/romanian/.test(text))text=text.replace(/тяга/g,'row');
 // Russian «тяга» can mean a hinge or a row; each is a discovery synonym.
 return text.replace(/тяга/g,' ').replace(/[^a-zа-я0-9]+/g,' ').trim();
}
function nearWord(a,b){if(a.length<5 || Math.abs(a.length-b.length)>1)return false;let edits=0,i=0,j=0;while(i<a.length && j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a[i]===b[j+1] && a[i+1]===b[j]){i+=2;j+=2;continue;}if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(a.length-i)+(b.length-j)<=1;}
export function libraryVariantMeta(name=''){
 const bits=[LIBRARY_EQUIPMENT.find(([key])=>key===libraryEquipment(name))?.[1] || 'Инвентарь уточнить'];
 if(/single.?leg|\bsl\b/i.test(name))bits.push('одна опорная нога');
 if(/one.?arm|single.?arm/i.test(name))bits.push('одна рука');
 if(/two.?hand/i.test(name))bits.push('двумя руками');
 if(/chest.?supported/i.test(name))bits.push('грудь на опоре');else if(/supported|kickstand/i.test(name))bits.push('с опорой');
 if(/neutral.?grip/i.test(name))bits.push('нейтральный хват');if(/incline/i.test(name))bits.push('наклонная скамья');if(/iso|hold/i.test(name))bits.push('удержание');return bits.join(' · ');
}
// Search facets only, not clinical suitability or an equipment prescription.
export const LIBRARY_EQUIPMENT=[['all','Любой инвентарь'],['db','Гантели'],['kb','Гири'],['barbell','Штанга'],['landmine','Landmine'],['band','Резина'],['cable','Блок'],['ball','Мяч'],['bodyweight','Собственный вес / без нагрузки'],['other','Не определён']];
export const LIBRARY_REGIONS=[['all','Все области'],['upper','Верх тела'],['lower','Низ тела'],['core','Кор'],['other','Не определена']];
export function libraryEquipment(name=''){
 return [['landmine',/landmine/i],['db',/\bdb\b|dumm?bell|dumbbell|гантел/i],['kb',/\bkb\b|kettlebell|гир/i],['barbell',/barbell|штанг|trap.?bar/i],['band',/band|резин/i],['cable',/cable/i],['ball',/medicine ball|\bmb\b|med.?ball/i],['bodyweight',/unloaded|bodyweight|plank|push.?up|clamshell|glute bridge|mobility|stretch|calf raise|tibialis raise/i]].find(([,re])=>re.test(name))?.[0] || 'other';
}
export function libraryRegion(name=''){
 if(/plank|pallof|dead bug|bird.?dog|rollout|rotation|кор\b/i.test(name))return 'core';
 if(/shoulder|press|row|pull|chest|bench|bicep|tricep|плеч|жим|тяга.*рук/i.test(name))return 'upper';
 if(/squat|lunge|leg|hip|glute|calf|ankle|hamstring|deadlift|tibialis|прыж|присед|голеностоп/i.test(name))return 'lower';
 return 'other';
}
