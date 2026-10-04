import test from 'node:test';
import assert from 'node:assert/strict';
import { shortCue, playerExerciseName } from '../lib/playerGym.mjs';
test('athlete short cue corrects stale breathing text for unloaded dynamic movement',()=>{
 const ex={name:'Glute Bridge',prehabRegion:'unloaded',cue:'Темп: спокойное дыхание без задержек и усилия.'};
 assert.match(shortCue(ex),/плавно и под контролем/);
 assert.doesNotMatch(shortCue(ex),/спокойное дыхание/);
});
test('old prophylaxis names display in English in athlete views',()=>{
 assert.equal(playerExerciseName({name:'Мягкие движения стопой сидя'}),'Seated Ankle Pumps');
 assert.equal(playerExerciseName({name:'Glute Bridge'}),'Glute Bridge');
});
