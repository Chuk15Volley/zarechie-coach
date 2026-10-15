import test from 'node:test';
import assert from 'node:assert/strict';
import {miniRowDescription,miniPointerIndex} from '../lib/coachMiniReadout.mjs';
import {chartKeyIndex} from '../lib/coachVisualCharts.mjs';
test('mini readout preserves zero, missing plan, partial actual and source input',()=>{
 const rows=Object.freeze([Object.freeze({date:'2026-10-12',value:0}),Object.freeze({date:'2026-10-13',value:null,gap:'Нет программ'}),Object.freeze({date:'2026-10-15',value:2500.5,partial:true})]);
 const before=JSON.stringify(rows);
 assert.equal(miniRowDescription(rows[0]),'12.10: 0 кг');
 assert.equal(miniRowDescription(rows[1]),'13.10: Нет программ');
 assert.match(miniRowDescription(rows[2]),/^15\.10: 2\s500,5 кг · неполные данные$/);
 for(const value of ['',null,false,NaN,-1])assert.equal(miniRowDescription({date:'2026-10-15',value}),'15.10: нет записи');
 assert.equal(JSON.stringify(rows),before);
});
test('touch and keyboard can reach every daily column without leaving the range',()=>{
 assert.equal(miniPointerIndex(0,210,7),0);assert.equal(miniPointerIndex(209,210,7),6);
 assert.equal(miniPointerIndex(-20,210,7),0);assert.equal(miniPointerIndex(800,210,7),6);
 assert.equal(miniPointerIndex(100,0,7),null);assert.equal(miniPointerIndex(10,200,0),null);
 assert.deepEqual(Array.from({length:7},(_,i)=>miniPointerIndex(i*30+15,210,7)),[0,1,2,3,4,5,6]);
 assert.equal(chartKeyIndex('Home',6,7),0);assert.equal(chartKeyIndex('ArrowLeft',0,7),0);
 assert.equal(chartKeyIndex('End',0,7),6);assert.equal(chartKeyIndex('ArrowRight',6,7),6);
});
