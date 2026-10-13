import {STRENGTH_EQUIPMENT,normalizeStrengthEquipment,validStrengthEquipment} from './strengthEquipment.mjs';
const number=value=>typeof value==='number'?value:typeof value==='string' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(value)?Number(value.trim().replace(',','.')):NaN;
export function strengthWeightRange(input){
 const min=number(input?.min),step=number(input?.step),max=number(input?.max);
 if(![min,step,max].every(value=>Number.isFinite(value) && value>0 && value<=1000) || max<min)return {error:'Укажите положительные минимум, шаг и максимум; максимум не меньше минимума.'};
 const scaled=[min,step,max].map(value=>Math.round(value*1000));
 if([min,step,max].some((value,i)=>Math.abs(value*1000-scaled[i])>1e-7) || !scaled[1])return {error:'Используйте не более трёх знаков после запятой.'};
 const [a,b,c]=scaled,span=c-a;if(span%b!==0)return {error:'Максимум должен получаться целым числом шагов от минимума.'};
 const count=span/b+1;if(count>200)return {error:'Диапазон содержит больше 200 весов. Увеличьте шаг или уменьшите максимум.'};
 return {weights:Array.from({length:count},(_,i)=>(a+i*b)/1000),settings:{mode:'range',min,step,max}};
}
export function parseStrengthWeightList(value){
 if(Array.isArray(value))return value.map(number);
 if(typeof value!=='string')return null;
 // Semicolons/whitespace delimit values; decimal commas belong to one weight.
 return value.trim()?value.trim().split(/[;\s]+/).map(number):[];
}
export function strengthInventorySetup(setup){
 if(!setup || typeof setup!=='object' || Array.isArray(setup) || Object.keys(setup).some(key=>!Object.hasOwn(STRENGTH_EQUIPMENT,key)))return {error:'Некорректные категории инвентаря.'};
 const equipment={},settings={};
 for(const key of Object.keys(STRENGTH_EQUIPMENT)){
  const row=setup[key];if(!row || !['list','range'].includes(row.mode))return {error:'Выберите способ ввода для каждого снаряда.'};
  if(row.mode==='range'){
   const result=strengthWeightRange(row);if(result.error)return {error:STRENGTH_EQUIPMENT[key]+': '+result.error};equipment[key]=result.weights;settings[key]=result.settings;
  }else{
   const values=parseStrengthWeightList(row.values);if(!values || !validStrengthEquipment({[key]:values}))return {error:STRENGTH_EQUIPMENT[key]+': перечислите до 200 положительных весов через точку с запятой.'};equipment[key]=values;settings[key]={mode:'list'};
  }
 }
 return {equipment:normalizeStrengthEquipment(equipment),settings};
}
export function inventorySetupFromSaved(equipment,settings={}){
 return Object.fromEntries(Object.keys(STRENGTH_EQUIPMENT).map(key=>[key,settings[key]?.mode==='range'?{...settings[key]}:{mode:'list',values:(equipment[key] || []).join('; ')}]));
}
