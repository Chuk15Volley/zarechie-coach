import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {playerLocalDate,playerLocalClock,playerTimeZoneLabel,validPlayerTimeZone} from '../lib/playerTimeZone.mjs';
import {calendarToday} from '../lib/coachCalendar.mjs';
test('NK Pro roster loading and forced sync both return saved profile timezones',async()=>{
 const source=readFileSync(new URL('../pages/api/nkperf/sync.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 const roster=[{id:'voronkova',name:'Irina'},{id:'other',name:'Other'}];
 const handler=new Function('isAuthorized','enforceRateLimit','redis','getNKRoster','hydratePlayerPhotos','hydratePlayerTimeZones',source+';return handler;')(()=>true,async()=>true,async command=>command==='get'?JSON.stringify(roster):'OK',async()=>roster,async p=>p,async p=>p.map(v=>({...v,timeZone:v.id==='voronkova'?'Asia/Shanghai':'Europe/Moscow'})));
 for(const method of ['GET','POST']){const res={status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler({method},res);assert.equal(res.code,200);assert.equal(res.data.players[0].timeZone,'Asia/Shanghai');assert.equal(res.data.players[1].timeZone,'Europe/Moscow');}
});
test('China crosses midnight five hours before Moscow and calendars agree',()=>{
 const now=new Date('2026-10-11T17:30:00Z');assert.equal(playerLocalDate('Europe/Moscow',now),'2026-10-11');assert.equal(playerLocalDate('Asia/Shanghai',now),'2026-10-12');assert.equal(playerLocalClock('Asia/Shanghai',now),'01:30');assert.equal(calendarToday(now,'Asia/Shanghai'),'2026-10-12');assert.match(playerTimeZoneLabel('Asia/Shanghai',now),/МСК \+5/);
});
test('IANA rules track winter/summer offsets instead of a fixed Moscow difference',()=>{
 assert.match(playerTimeZoneLabel('Europe/Paris',new Date('2026-07-01T12:00:00Z')),/МСК −1/);assert.match(playerTimeZoneLabel('Europe/Paris',new Date('2026-01-01T12:00:00Z')),/МСК −2/);assert.equal(validPlayerTimeZone('Asia/Shanghai'),true);for(const value of ['China','bad/zone','',null,'../../secret'])assert.equal(validPlayerTimeZone(value),false);
});
test('profile timezone remains isolated from the roster and Moscow workspace',async()=>{
 const source=readFileSync(new URL('../lib/playerTimeZoneStore.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');const reads=[];
 const factory=new Function('redis','redisPipeline','playerTimeZone','DEFAULT_PLAYER_TIME_ZONE',source+';return {getPlayerTimeZone,hydratePlayerTimeZones,playerTimeZoneKey};');
 const m=factory(async(...args)=>{reads.push(args);return JSON.stringify({timeZone:'Asia/Shanghai'});},async()=>[JSON.stringify({timeZone:'Asia/Shanghai'}),null],x=>validPlayerTimeZone(x)?x:'Europe/Moscow','Europe/Moscow');
 assert.equal(await m.getPlayerTimeZone('same','zarechie'),'Europe/Moscow');assert.equal(reads.length,0);assert.equal(await m.getPlayerTimeZone('same','nkperf'),'Asia/Shanghai');assert.equal(reads[0][1],'nkperf:player:time_zone:same');
 const hydrated=await m.hydratePlayerTimeZones([{id:'same'},{id:'other'}],'nkperf');assert.equal(hydrated[0].timeZone,'Asia/Shanghai');assert.equal(hydrated[1].timeZone,'Europe/Moscow');
});
test('timezone API requires coach authentication, NK Pro and a valid zone before any write',async()=>{
 const source=readFileSync(new URL('../pages/api/players/time-zone.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');let writes=0;
 for(const [authorized,body,expected] of [[false,{workspace:'nkperf',playerId:'p',timeZone:'Asia/Shanghai'},401],[true,{workspace:'zarechie',playerId:'p',timeZone:'Asia/Shanghai'},400],[true,{workspace:'nkperf',playerId:'p',timeZone:'bad/zone'},400],[true,{workspace:'nkperf',playerId:'p',timeZone:'Asia/Shanghai'},200]]){
  const deps={isAuthorized:()=>authorized,redis:async()=>{writes++;},getPlayerInfo:async()=>({id:'p'}),getPlayerTimeZone:async()=> 'Asia/Shanghai',playerTimeZoneKey:()=> 'nkperf:player:time_zone:p',validPlayerTimeZone,playerLocalDate};
  const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',body},res);assert.equal(res.code,expected);
 }assert.equal(writes,1);
});
test('generation, save and player SSR resolve the configured zone while explicit dates remain unchanged',()=>{
 const generation=readFileSync(new URL('../pages/api/programs/generate.js',import.meta.url),'utf8');assert.match(generation,/getPlayerTimeZone\(String\(playerId\),workspace\)/);assert.match(generation,/const targetDate = date \|\| today/);assert.match(generation,/todayISO\(timeZone\)/);
 const player=readFileSync(new URL('../pages/player/[id].js',import.meta.url),'utf8');assert.match(player,/const date=todayISO\(timeZone\)/);assert.match(player,/date=\$\{localToday\}/);
 const calendar=readFileSync(new URL('../components/CoachCalendar.js',import.meta.url),'utf8');assert.match(calendar,/calendarToday\(new Date\(\),timeZone\)/);
});
