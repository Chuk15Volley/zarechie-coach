// Presentation and local view state only; no athlete facts are stored or changed.
export function miniPopupPosition(card,size,viewport){
 const width=Math.min(280,Math.max(1,viewport.width-16)),height=Math.max(0,size.height || 0);
 const left=Math.max(8,Math.min(viewport.width-width-8,card.left+(card.width-width)/2));
 const above=card.top-height-8;
 return {left,top:above>=8?above:card.bottom+8,width};
}
export function loadTableOffset(saved,maxScroll){
 const max=Math.max(0,Number.isFinite(maxScroll)?maxScroll:0);
 if(!saved || saved.atEnd===true)return max;
 return Number.isFinite(saved.left)?Math.max(0,Math.min(max,saved.left)):max;
}
export function loadTablePosition(left,maxScroll){
 const max=Math.max(0,Number.isFinite(maxScroll)?maxScroll:0),offset=Math.max(0,Math.min(max,Number(left)||0));
 return {left:offset,atEnd:max-offset<=2};
}
export function factDisplayDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return value || '—';
 const date=new Date(value+'T12:00:00Z');
 return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==value?value:date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
}
export const factDisplayRange=(from,to)=>factDisplayDate(from)+' — '+factDisplayDate(to);
export const metricMissingLabel=metric=>({kg:'Без веса',reps:'Без повторов',rpe:'Без RPE'}[metric] || 'Без записи');
