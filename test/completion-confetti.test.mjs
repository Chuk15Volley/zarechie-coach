import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfetti, confettiFrame, CONFETTI_DURATION_MS} from '../lib/completionConfetti.mjs';

test('paper falls and tumbles using elapsed time and expires within a bounded celebration', () => {
  const papers = createConfetti(390, 844, () => 0.5);
  assert.equal(papers.length, 100);
  const paper = papers[0];
  assert.equal(confettiFrame(paper, 0, 844), null);
  const early = confettiFrame(paper, 1000, 844), later = confettiFrame(paper, 2000, 844);
  assert.ok(later.y > early.y);
  assert.notEqual(later.scale, early.scale);
  assert.ok(later.opacity > 0 && later.opacity <= 1);
  assert.equal(confettiFrame(paper, CONFETTI_DURATION_MS, 844), null);
  assert.equal(confettiFrame(paper, 6000, 100), null);
});

test('particles remain finite over phone and desktop viewport sizes', () => {
  for (const [width, height] of [[320,568], [1440,900]]) {
    for (const paper of createConfetti(width,height)) {
      for(let time=0;time<=CONFETTI_DURATION_MS;time+=100) {
        const pose=confettiFrame(paper,time,height);
        if(!pose) continue;
        for(const key of ['x','y','angle','scale','opacity']) assert.ok(Number.isFinite(pose[key]));
        assert.ok(pose.scale>=0.08 && pose.scale<=1);
      }
    }
  }
});

// Exercise the actual canvas effect with a bounded animation clock and events.
import { readFileSync } from 'node:fs';
function effectHarness({ reduced = false, celebration = 'fresh-completion' } = {}) {
 const events=new Map(),frames=new Map();let serial=0,painted=0,cleanup;
 const context={scale(){},clearRect(){},save(){},translate(){},rotate(){},fillRect(){painted++;},restore(){}};
 const canvas={hidden:false,getContext:()=>context};
 const motion={matches:reduced,addEventListener:(k,fn)=>events.set('motion:'+k,fn),removeEventListener:k=>events.delete('motion:'+k)};
 const document={hidden:false,addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k)};
 const window={innerWidth:390,innerHeight:844,devicePixelRatio:3,matchMedia:()=>motion,
  addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k)};
 const source=readFileSync(new URL('../components/player/CompletionConfetti.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const canvasRef'),source.indexOf('  return celebration ?'));
 new Function('celebration','useRef','useEffect','window','document','performance','requestAnimationFrame','cancelAnimationFrame',
  'createConfetti','confettiFrame','CONFETTI_DURATION_MS',body)(celebration,()=>({current:canvas}),fn=>{cleanup=fn();},
  window,document,{now:()=>0},fn=>{frames.set(++serial,fn);return serial;},id=>frames.delete(id),createConfetti,confettiFrame,CONFETTI_DURATION_MS);
 return {canvas,events,document,motion,frames,cleanup,get painted(){return painted;},
  tick(time){const [id,fn]=frames.entries().next().value;frames.delete(id);fn(time);}};
}
test('completion canvas respects reduced motion and never starts without a live completion event',()=>{
 for(const options of [{reduced:true},{celebration:null}]) {
  const h=effectHarness(options);assert.equal(h.frames.size,0);assert.equal(h.events.size,0);
 }
});
test('canvas paints once scheduled, expires, and removes every listener on unmount',()=>{
 const h=effectHarness();assert.equal(h.canvas.width,780,'phone canvas pixel density is capped');
 h.tick(1000);assert.ok(h.painted>0);assert.equal(h.frames.size,1);
 h.tick(CONFETTI_DURATION_MS);assert.equal(h.canvas.hidden,true);assert.equal(h.frames.size,0);
 h.cleanup();assert.equal(h.events.size,0);
});
test('backgrounding or changing reduced-motion preference stops the current celebration',()=>{
 for(const event of ['visibilitychange','motion:change']) {
  const h=effectHarness();
  h.document.hidden=true;h.motion.matches=true;h.events.get(event)();
  assert.equal(h.frames.size,0);assert.equal(h.canvas.hidden,true);
  h.cleanup();assert.equal(h.events.size,0);
 }
});
