import {chartNumber} from './coachVisualCharts.mjs';
// Read-only labels for the existing daily mini-bars; never repair source values.
export function miniRowDescription(row={}){
 const date=/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date.slice(8)+'.'+row.date.slice(5,7):String(row.date || 'Дата не указана');
 const value=chartNumber(row.value);
 return `${date}: ${value==null?row.gap || 'нет записи':value.toLocaleString('ru-RU',{maximumFractionDigits:1})+' кг'}${row.partial && value!=null?' · неполные данные':''}`;
}
export function miniPointerIndex(x,width,count){
 if(!count || !Number.isFinite(x) || !(width>0))return null;
 return Math.min(count-1,Math.max(0,Math.floor(x/width*count)));
}
