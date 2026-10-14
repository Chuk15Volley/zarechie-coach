// Local coach interaction only: never writes programs, evidence or dose automatically.
export const correctionEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function resizedPlannedSets(sets,count){
 const n=Number(count);if(!Number.isInteger(n) || n<1 || n>20 || n===sets.length)return sets;
 return Array.from({length:n},(_,i)=>i<sets.length?sets[i]:sets.at(-1) || '');
}
export function correctionStatus({saved,dirty,draftSaved,saving,blocked}){
 if(saving)return 'Сохраняю…';if(blocked)return 'Исходный план защищён';
 if(dirty)return 'Есть изменения · игроку ещё не выданы';
 if(saved)return 'Программа сохранена игроку';if(draftSaved)return 'Черновик сохранён на сервере · игроку не выдан';
 return 'Черновик · видео, техника и нагрузка';
}
export function correctionHistoryEdit(history,before,after,key=null,now=Date.now()){
 if(correctionEqual(before,after))return history;
 const merge=key && history.key===key && now-history.at<1500;
 return {past:merge?history.past:[...history.past,before].slice(-40),future:[],key,at:now};
}
export function correctionHistoryStep(history,current,redo=false){
 const list=redo?history.future:history.past;if(!list.length)return {history,value:current};
 return redo?{value:list[0],history:{past:[...history.past,current].slice(-40),future:list.slice(1),key:null,at:0}}:{value:list.at(-1),history:{past:list.slice(0,-1),future:[current,...history.future].slice(0,40),key:null,at:0}};
}
export function correctionViewKey({workspace,playerId,date}){return 'gym-correction-view-v1:'+JSON.stringify([workspace,String(playerId),date]);}
