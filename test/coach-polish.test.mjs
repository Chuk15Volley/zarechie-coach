import test from 'node:test';
import assert from 'node:assert/strict';
import {miniPopupPosition,loadTableOffset,loadTablePosition,factDisplayDate,factDisplayRange} from '../lib/coachPolish.mjs';
test('mini tooltip stays clear of the full statistic card and inside horizontal viewport',()=>{
 for(const viewport of [{width:390,height:844},{width:1280,height:720}])for(const card of [{left:16,top:280,bottom:389,width:170},{left:220,top:4,bottom:113,width:160}]){
  const p=miniPopupPosition(card,{height:54},viewport);
  assert.ok(p.left>=8 && p.left+p.width<=viewport.width-8);
  assert.ok(p.top+54<=card.top || p.top>=card.bottom);
 }
});
test('load table opens on latest dates, restores local scroll, and follows right edge on resize',()=>{
 assert.equal(loadTableOffset(null,420),420);
 const saved=loadTablePosition(120,420);assert.deepEqual(saved,{left:120,atEnd:false});assert.equal(loadTableOffset(saved,600),120);
 assert.equal(loadTableOffset(saved,80),80);
 const end=loadTablePosition(420,420);assert.equal(loadTableOffset(end,700),700);
 assert.equal(loadTableOffset({left:NaN},420),420);assert.equal(loadTableOffset({left:-10},420),0);
 assert.equal(loadTableOffset(null,-10),0);
});
test('visible fact dates use Russian calendar dates without changing range inputs',()=>{
 const from='2026-07-18',to='2026-10-15';assert.match(factDisplayDate(from),/^18 июля 2026/);
 assert.match(factDisplayRange(from,to),/^18 июля 2026.* — 15 октября 2026/);
 assert.equal(from,'2026-07-18');assert.equal(to,'2026-10-15');assert.equal(factDisplayDate(''), '—');assert.equal(factDisplayDate('opaque date'),'opaque date');
 assert.equal(factDisplayDate('2026-02-31'),'2026-02-31');
});
