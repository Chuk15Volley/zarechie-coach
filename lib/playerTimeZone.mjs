export const DEFAULT_PLAYER_TIME_ZONE = 'Europe/Moscow';
export const COMMON_PLAYER_TIME_ZONES = [
 ['Europe/Moscow','Москва'],['Asia/Shanghai','Китай'],['Europe/Istanbul','Турция'],['Europe/Rome','Италия'],['Europe/Paris','Франция'],['Europe/Belgrade','Сербия'],['Asia/Dubai','ОАЭ'],['Asia/Tokyo','Япония'],['Asia/Seoul','Южная Корея'],['America/New_York','Нью-Йорк'],['America/Los_Angeles','Лос-Анджелес'],
];
export function validPlayerTimeZone(value) {
 if(typeof value !== 'string' || !value || value.length>80 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value))return false;
 try { new Intl.DateTimeFormat('en',{timeZone:value}).format();return true; } catch { return false; }
}
export function playerTimeZone(value) {return validPlayerTimeZone(value)?value:DEFAULT_PLAYER_TIME_ZONE;}
export function playerLocalDate(timeZone=DEFAULT_PLAYER_TIME_ZONE,now=new Date()) {
 return new Intl.DateTimeFormat('sv-SE',{timeZone:playerTimeZone(timeZone)}).format(now);
}
export function playerLocalClock(timeZone,now=new Date()) {
 return new Intl.DateTimeFormat('ru-RU',{timeZone:playerTimeZone(timeZone),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
}
function offsetMinutes(timeZone,now) {
 const parts=new Intl.DateTimeFormat('en',{timeZone:playerTimeZone(timeZone),timeZoneName:'longOffset'}).formatToParts(now);
 const value=parts.find(p=>p.type==='timeZoneName')?.value || 'GMT';
 const match=value.match(/GMT([+-])(\d{2}):(\d{2})/);
 return match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3])):0;
}
export function playerTimeZoneLabel(timeZone,now=new Date()) {
 const zone=playerTimeZone(timeZone);const name=COMMON_PLAYER_TIME_ZONES.find(([id])=>id===zone)?.[1]||zone;
 const difference=offsetMinutes(zone,now)-offsetMinutes(DEFAULT_PLAYER_TIME_ZONE,now);
 const hours=Math.abs(difference)/60;
 return `${name} · ${difference===0?'МСК':`МСК ${difference>0?'+':'−'}${hours}`}`;
}
