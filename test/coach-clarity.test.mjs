import test from 'node:test';
import assert from 'node:assert/strict';
import {separateReadinessServiceReasons,commonPlannedRepeat,samePlannedSets,conciseFactText} from '../lib/coachClarity.mjs';
import {plannedSetParts,repeatedPlannedSets} from '../lib/plannedLoadEditor.mjs';
test('coach symptom display separates service suffix without dropping clinical or source content',()=>{
 const source=['Боль Колено правое 1/10 Недостаточно данных: whoop; доверие снижено, автоматическое ограничение не назначается','Исключить максимальные прыжки','WHOOP требует контекстной проверки','Боль Поясница 3/10'];
 const original=structuredClone(source),result=separateReadinessServiceReasons(source);
 assert.deepEqual(source,original);
 assert.deepEqual(result,['Боль Колено правое 1/10','Недостаточно данных: whoop; доверие снижено, автоматическое ограничение не назначается',...source.slice(1)]);
 assert.equal(result.slice(0,2).join(' '),source[0]);
});
test('bulk display derives only equal values and units and never applies on read',()=>{
 for(const [sets,value] of [[['4','4'],'4'],[['8/side','8/side'],'8'],[['25 sec/side','25 sec/side'],'25'],[['1×5 м/сторону','1×5 м/сторону'],'1×5 м/сторону'],[['4','5'],''],[['4','4 sec'],''],[['4'],''],[[],'']]){
  const original=structuredClone(sets);assert.equal(commonPlannedRepeat(sets,plannedSetParts),value);assert.deepEqual(sets,original);
 }
 const sets=['8/side','8/side'];assert.ok(samePlannedSets(sets,repeatedPlannedSets(sets,'8')));assert.ok(!samePlannedSets(sets,repeatedPlannedSets(sets,'9')));assert.deepEqual(sets,['8/side','8/side']);
});
test('short fact captions preserve pending vs missing and factual zero',()=>{
 assert.equal(conciseFactText('Факт ещё не записан'),'Факт: ожидается');assert.equal(conciseFactText('Нет факта'),'Факт: не записан');assert.equal(conciseFactText('0 кг'),'Факт: 0 кг');assert.equal(conciseFactText('Неполный факт'),'Неполный факт');
});
