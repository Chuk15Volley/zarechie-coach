import test from 'node:test';
import assert from 'node:assert/strict';
import {chartDateIndices,chartKeyIndex,nearestChartIndex,chartObservationCounts,teamLoadChartRows,weekPlanChartRows,historyLoadChart,confirmedQueueSaves} from '../lib/coachVisualCharts.mjs';
const freeze=v=>{if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
test('axis ticks keep endpoints without label collisions in dense and sparse histories',()=>{
 for(const count of [0,1,2,9,11,61]){const width=Math.max(260,count*27+50),ticks=chartDateIndices(count,width);assert.equal(ticks.length>0,count>0);if(!count)continue;assert.equal(ticks[0],0);assert.equal(ticks.at(-1),count-1);for(let i=1;i<ticks.length;i++)assert.ok((ticks[i]-ticks[i-1])*(width-60)/Math.max(1,count-1)>=56);}
});
test('pointer and keyboard can inspect exact first, last and missing observations',()=>{
 assert.equal(nearestChartIndex(-10,9,293),0);assert.equal(nearestChartIndex(500,9,293),8);assert.equal(nearestChartIndex(38+4*(293-60)/8,9,293),4);
 assert.equal(chartKeyIndex('ArrowLeft',0,9),0);assert.equal(chartKeyIndex('ArrowRight',8,9),8);assert.equal(chartKeyIndex('Home',8,9),0);assert.equal(chartKeyIndex('End',1,9),8);assert.equal(chartKeyIndex('ArrowRight',null,0),null);
});
test('exercise RPE stays known when a selected set did not exist; counts never overlap',()=>{
 const points=freeze([{kg:null,rpe:7,gap:'Такого подхода нет'},{kg:0,rpe:null},{kg:null,rpe:null,gap:'Этот вариант не выполнялся'}]);
 assert.deepEqual(chartObservationCounts(points,'rpe'),{known:1,missing:1,notPerformed:1});
 assert.deepEqual(chartObservationCounts(points,'kg'),{known:1,missing:0,notPerformed:2});
});
test('daily bars retain genuine zero, distinguish missing from no program and label partial sums',()=>{
 const data=freeze({dates:['a','b','c','d'],players:[{byDay:{a:0,b:80,c:0},plannedByDay:{a:0,b:100,c:200},evidenceByDay:{a:{source:'recorded'},b:{source:'player_log',partial:true},c:{source:'missing'},d:{source:'no_session'}},executionByDay:{a:{completed:true},b:{completedSets:1},c:{completed:false}}},{byDay:{b:0},plannedByDay:{b:120},evidenceByDay:{b:{source:'missing'}}}]});
 const actual=teamLoadChartRows(data),plan=teamLoadChartRows(data,'plan');
 assert.equal(actual[0].value,0);assert.equal(actual[1].value,80);assert.equal(actual[1].partial,true);assert.equal(actual[2].value,null);assert.equal(actual[3].gap,'Нет программ');assert.equal(plan[1].value,220);assert.equal(plan[0].value,0);
});
test('week bars use only stored planned tonne values on the exact date, without invented zero',()=>{
 const data=freeze({dates:['a','b','c'],athletes:[{days:[{date:'a',hasSession:true,plannedTonnage:500},{date:'b',hasSession:true,plannedTonnage:0},{date:'c',hasSession:false,plannedTonnage:999}]},{days:[{date:'a',hasSession:true}]}]});
 const rows=weekPlanChartRows(data);assert.deepEqual(rows.map(r=>r.value),[500,0,null]);assert.equal(rows[0].partial,true);assert.equal(rows[2].gap,'Нет программ');
});
test('history plan/fact bars do not substitute planned kg for missing execution',()=>{
 assert.deepEqual(historyLoadChart(freeze({tonnage:0,plannedTonnage:900,loadEvidence:{source:'missing'},execution:{completed:false}})),{actual:null,plan:900,partial:false});
 assert.equal(historyLoadChart({tonnage:0,plannedTonnage:0,loadEvidence:{source:'recorded'},execution:{completed:true}}).actual,0);
 assert.equal(historyLoadChart({tonnage:80,plannedTonnage:900,loadEvidence:{source:'player_log',partial:true}}).partial,true);
});
test('queue confirmation appears only for a server-confirmed false-to-true transition in the same queue',()=>{
 const previous={scope:'z:q1',rows:new Map([['1',false],['2',true]])},next=freeze([{playerId:'1',saved:true},{playerId:'2',saved:true},{playerId:'3',saved:true}]);
 assert.deepEqual(confirmedQueueSaves(previous,next,'z:q1'),['1']);assert.deepEqual(confirmedQueueSaves(previous,next,'nk:q1'),[]);assert.deepEqual(confirmedQueueSaves(null,next,'z:q1'),[]);assert.deepEqual(confirmedQueueSaves(previous,[{playerId:'1',status:'done',reviewed:true,saved:false}],'z:q1'),[]);
});
