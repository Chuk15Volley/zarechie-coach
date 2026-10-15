// Coach UI only: no prescription, identity, clinical policy or stored evidence changes.
export function variantCueWarnings(name,text=''){
 const title=String(name),value=String(text),warnings=[];
 if(/\b(?:iso(?:metric)?|hold)\b/i.test(title) && !/изометр|статич|удерж[^.!?]{0,70}(?:положени|позици|наклон|секунд|\bсек\b)|\bhold\b[^.!?]{0,70}(?:position|seconds?|\bsec\b|\d+\s*s\b)|isometric/i.test(value))warnings.push('В названии есть удержание, но оно не описано.');
 if(/\b(?:slam|throw|pass)\b/i.test(title) && !/брос|бить|удар.*мяч|\b(?:slam|throw|pass)\b/i.test(value))warnings.push('В названии есть бросок, но он не описан.');
 if(/(?:single[ -]?leg|\bsl\b).*(?:rdl|romanian)|(?:rdl|romanian).*(?:single[ -]?leg|\bsl\b)/i.test(title) && !/одной.*ног|опорн.*ног|свободн.*ног|single[ -]?leg/i.test(value))warnings.push('Не уточнена работа на одной опорной ноге.');
 return warnings;
}
export const defaultLibraryContext={search:'',group:'all',media:'all',equipment:'all',region:'all',exact:false,collection:'all',selectedId:null,limit:12,scroll:0};
export function libraryContext(value,facets){
 if(!value || typeof value!=='object' || Array.isArray(value))return {...defaultLibraryContext};
 const next={...defaultLibraryContext};
 if(typeof value.search==='string')next.search=value.search.slice(0,300);
 for(const key of ['group','media','equipment','region','collection'])if(facets[key].includes(value[key]))next[key]=value[key];
 next.exact=value.exact===true;next.selectedId=typeof value.selectedId==='string'?value.selectedId.slice(0,300):null;
 if(Number.isInteger(value.limit) && value.limit>=12 && value.limit<=5000)next.limit=value.limit;
 if(Number.isFinite(value.scroll) && value.scroll>=0 && value.scroll<=2000000)next.scroll=value.scroll;
 return next;
}
export function nextFactField(fields,values,currentKey,key,reverse=false){
 const pending=fields.filter(field=>values[key(field)]===undefined || String(values[key(field)]).trim()==='');
 if(!pending.length)return null;
 const current=fields.findIndex(field=>key(field)===currentKey),ordered=reverse?[...pending].reverse():pending;
 return ordered.find(field=>reverse?fields.indexOf(field)<current:fields.indexOf(field)>current) || ordered[0];
}
export function coachWeightUnit(units){return units===2?'Кг одного снаряда из пары':'Кг одного снаряда';}
export function systemEventTime(value){return typeof value==='number'?value:Date.parse(value);}
export function systemEvents(events,status='all',now=Date.now()){
 return (events || []).filter(event=>status==='all' || event.status===status && Number.isFinite(systemEventTime(event.at)) && now-systemEventTime(event.at)>=0 && now-systemEventTime(event.at)<=86400000);
}
