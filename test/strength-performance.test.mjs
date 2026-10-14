import test from 'node:test';
import assert from 'node:assert/strict';
import {historyPerformanceSeries,cyclePerformanceSeries,performancePoints,performanceChartGeometry} from '../lib/strengthPerformance.mjs';
import {playerHistoryFacts} from '../lib/playerHistoryFacts.mjs';
import {actualFingerprint} from '../lib/strengthActualSupplement.mjs';
function fixture(day=1){const date=`2026-10-0${day}`,record={focus:'inseason_strength',date,savedAt:date+'T08:00:00Z',session:{blocks:[{label:'B',exercises:[{code:'B1',name:'One-Arm DB Bench Press',loadUnits:1,weightKg:99,targetSets:['5/side','5/side']}]}]}},log={savedAt:date+'T10:00:00Z',completedAt:date+'T09:59:00Z',done:{'0-0-0':true,'0-0-1':true},weights:{'0-0-0':20},repetitions:{'0-0-0':5}};return {record,log};}
function history(record,log,supplement){return {date:record.date,focus:record.focus,trainingType:'anterior_chain',plannedTonnage:9999,factReview:playerHistoryFacts(record,null,log,supplement)};}
test('actual charts retain recorded zero, ignore plan/session RPE and show independent per-field gaps',()=>{
 const {record,log}=fixture();log.weights['0-0-0']=0;
 const series=historyPerformanceSeries([history(record,log)]),first=performancePoints(series[0],0)[0],second=performancePoints(series[0],1)[0];
 assert.equal(first.kg,0);assert.equal(first.reps,5);assert.equal(first.rpe,null);assert.equal(second.kg,null);assert.equal(second.reps,null);assert.equal(series[0].perSide,true);
});
test('confirmed supplement updates charts, stale facts revert to real gaps, undone session stays absent',()=>{
 const {record,log}=fixture(),supplement={version:2,baseFingerprint:actualFingerprint(record,null,log),revision:'test',patches:[{exercise:'0-0',set:1,field:'kg',value:22},{exercise:'0-0',set:1,field:'reps',value:6},{exercise:'0-0',field:'rpe',value:7}]};
 let point=performancePoints(historyPerformanceSeries([history(record,log,supplement)])[0],1)[0];assert.deepEqual([point.kg,point.reps,point.rpe],[22,6,7]);assert.equal(point.supplementStatus,'applied');
 const stale={...log,savedAt:'2026-10-01T10:01:00Z'};point=performancePoints(historyPerformanceSeries([history(record,stale,supplement)])[0],1)[0];assert.deepEqual([point.kg,point.reps,point.rpe],[null,null,null]);assert.equal(point.supplementStatus,'stale');
 assert.equal(historyPerformanceSeries([history(record,{...stale,done:{}},supplement)]).length,0);
});
test('exact name, slot, chain, implement count and per-side units stay separate; unperformed dates break chronology',()=>{
 const a=fixture(),b=fixture(2),c=fixture(3);b.record.session.blocks[0].exercises[0].name='DB Bench Press';b.record.session.blocks[0].exercises[0].loadUnits=2;c.log.done={};
 const series=historyPerformanceSeries([history(c.record,c.log),history(b.record,b.log),history(a.record,a.log)]);assert.equal(series.length,2);const original=series.find(row=>row.name==='One-Arm DB Bench Press');assert.equal(original.observations.length,3);assert.equal(original.observations[1].gap,'Этот вариант не выполнялся');assert.equal(original.observations[2].gap,'Полное выполнение не подтверждено');
 const changed=history(a.record,a.log);changed.trainingType='posterior_chain';assert.equal(historyPerformanceSeries([history(a.record,a.log),{...changed,date:'2026-10-04'}]).length,2);
 for(const change of [row=>{row.loadUnits=2;},row=>{row.code='B2';},row=>{row.sets=row.sets.map(set=>({...set,target:'5'}));}]){const second=structuredClone(history(a.record,a.log));second.date='2026-10-04';change(second.factReview.rows[0]);assert.equal(historyPerformanceSeries([history(a.record,a.log),second]).length,2);}
});
test('cycle graphs include other-variant dates as gaps and never use incomplete set values or session RPE',()=>{
 const series=cyclePerformanceSeries({completionDates:['2026-10-01','2026-10-02'],exercises:[{key:'exact',name:'Trap Bar Deadlift',observations:[{date:'2026-10-01',sessionRpe:8,exerciseRpe:null,sets:[{completed:false,kg:90,reps:5,perSide:false}]}]}]});
 const points=performancePoints(series[0]);assert.equal(points[0].kg,null);assert.equal(points[0].reps,null);assert.equal(points[0].rpe,null);assert.equal(points[1].gap,'Этот вариант не выполнялся');
});
test('SVG geometry breaks at gaps/adaptations, preserves zero and fixes RPE to 1–10',()=>{
 const points=[{kg:0,rpe:1},{kg:20,rpe:7},{kg:null,rpe:null},{kg:25,rpe:8},{kg:22,rpe:6,adapted:true},{kg:24,rpe:7}];
 const geometry=performanceChartGeometry(points,'kg');assert.deepEqual(geometry.segments.map(segment=>segment.map(point=>point.index)),[[0,1],[3],[5]]);assert.equal(geometry.coordinates[0].value,0);assert.equal(geometry.coordinates[2],null);assert.equal(geometry.coordinates[4].value,22);
 const rpe=performanceChartGeometry(points,'rpe');assert.equal(rpe.min,1);assert.equal(rpe.max,10);assert.ok(rpe.coordinates.every(point=>point==null || Number.isFinite(point.y)));
});
test('timed prescriptions never become plotted repetitions; adaptation metadata stays attached',()=>{
 const {record,log}=fixture();Object.assign(record.session.blocks[0].exercises[0],{targetSets:['20 sec','20 sec'],symptomAdapted:true});
 const series=historyPerformanceSeries([history(record,log)]),point=performancePoints(series[0])[0];assert.equal(point.reps,null);assert.equal(point.adapted,true);
});
