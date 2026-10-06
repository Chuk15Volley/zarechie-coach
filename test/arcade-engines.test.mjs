import test from 'node:test';
import assert from 'node:assert/strict';
import { newTetris, tetrisAction, tickTetris, lockPiece, fits, ghostY } from '../lib/arcade/tetris.mjs';
import { newJump, tickJump } from '../lib/arcade/jump.mjs';
import { newTanks, tickTanks, fireTank, canTankMove } from '../lib/arcade/tanks.mjs';
const random=()=>.42;

test('tetris uses all seven pieces before repeating a bag and holds once per turn',()=>{
 const g=newTetris(random);assert.equal(new Set([g.piece.type,...g.queue.slice(0,6)]).size,7);
 const original=g.piece.type;tetrisAction(g,'hold');assert.equal(g.hold,original);
 const current=g.piece.type;tetrisAction(g,'hold');assert.equal(g.piece.type,current);
 tetrisAction(g,'drop');assert.equal(g.held,false);
});
test('tetris hard drop lands on the ghost and clears four complete lines',()=>{
 const g=newTetris(random);for(let y=16;y<20;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?null:'J');
 g.piece={type:'I',matrix:[[1],[1],[1],[1]],x:4,y:0};assert.equal(ghostY(g),16);
 tetrisAction(g,'drop');assert.equal(g.lines,4);assert.equal(g.score,832);assert.ok(g.board.every(r=>r.every(v=>!v)));
});
test('tetris rotation kicks off walls and held movement never enters a wall',()=>{
 const g=newTetris(random);g.piece={type:'T',matrix:[[0,1,0],[0,1,1],[0,1,0]],x:-1,y:5};
 assert.ok(fits(g,g.piece));tetrisAction(g,'rotate');assert.ok(fits(g,g.piece));
 for(let i=0;i<60;i++)tickTetris(g,1/60,new Set(['left']));assert.ok(fits(g,g.piece));
});
test('tetris locks after a delay and tops out when locking above the ceiling',()=>{
 const g=newTetris(random);g.piece.y=ghostY(g);const old=g.piece;
 tickTetris(g,.2);assert.equal(g.piece,old);tickTetris(g,.3);assert.notEqual(g.piece,old);
 g.piece={type:'O',matrix:[[1,1],[1,1]],x:4,y:-1};lockPiece(g);assert.equal(g.status,'lost');
});
test('jump bounces only when falling across a platform; springs jump higher',()=>{
 for(const spring of [false,true]){const g=newJump(random);g.platforms=[{x:140,y:300,w:70,type:'normal',spring}];g.highest=-200;g.x=175;g.y=280;g.vy=150;tickJump(g,1/60);assert.equal(g.vy,spring?-650:-390);assert.equal(g.y,282);}
});
test('jump wraps at screen edges, scrolls upward and loses below view',()=>{
 const g=newJump(random);g.x=359;g.vx=240;tickJump(g,.02,new Set(['right']));assert.ok(g.x<10);
 g.y=100;g.vy=-100;tickJump(g,.02);assert.ok(g.camera<0);assert.ok(g.score>0);
 g.y=g.camera+550;g.vy=100;tickJump(g,.02);assert.equal(g.status,'lost');
});
test('fragile jump platforms break instead of bouncing',()=>{
 const g=newJump(random);const platform={x:140,y:300,w:70,type:'break'};g.platforms=[platform];g.highest=-200;g.x=175;g.y=280;g.vy=150;tickJump(g,1/60);assert.equal(platform.broken,true);assert.ok(g.vy>0);
});
test('tank bullets destroy brick but steel remains and blocks movement',()=>{
 for(const type of [1,2]){const g=newTanks(random);g.map=Array.from({length:26},()=>Array(26).fill(0));g.map[10][8]=type;g.player={x:136,y:200,dir:'up',cool:0,shield:0};assert.equal(canTankMove(g,g.player,136,176),false);fireTank(g,g.player);for(let i=0;i<15;i++)tickTanks(g,1/60);assert.equal(g.map[10][8],type===1?0:2);}
});
test('tank enemy damage respects respawn protection, and base damage ends game',()=>{
 const g=newTanks(random);g.bullets=[{x:g.player.x,y:g.player.y+2,dx:0,dy:-1,enemy:true}];tickTanks(g,1/60);assert.equal(g.lives,3);
 g.player.shield=0;g.bullets=[{x:g.player.x,y:g.player.y+2,dx:0,dy:-1,enemy:true}];tickTanks(g,1/60);assert.equal(g.lives,2);assert.ok(g.player.shield>0);
 g.bullets=[{x:g.base.x,y:g.base.y,dx:0,dy:1,enemy:true}];tickTanks(g,1/60);assert.equal(g.status,'lost');
});
test('destroyed enemy awards points, held fire repeats, and waves advance',()=>{
 const g=newTanks(random);g.enemies=[{x:136,y:365,dir:'up',hp:1,cool:9,turn:9}];g.spawn=99;g.bullets=[{x:136,y:370,dx:0,dy:-1,enemy:false}];tickTanks(g,1/60);assert.equal(g.score,100);assert.equal(g.kills,1);
 g.spawned=8;tickTanks(g,1/60);assert.equal(g.stage,2);assert.equal(g.spawned,0);
 for(let i=0;i<60;i++)tickTanks(g,1/60,new Set(['fire']));assert.ok(g.player.cool>0);
});

test('tank starts aligned with a clear lane and can drive out without nudging sideways',()=>{
 const g=newTanks(random);const start=g.player.y;
 for(let i=0;i<120;i++)tickTanks(g,1/60,new Set(['up']));assert.ok(g.player.y<start-150);
});

test('jump projectiles remove monsters and a side collision ends the run',()=>{
 const g=newJump(random);g.monsters=[{x:180,y:360}];g.shots=[{x:180,y:370}];tickJump(g,1/60);assert.equal(g.monsters.length,0);
 g.monsters=[{x:g.x,y:g.y}];tickJump(g,1/60);assert.equal(g.status,'lost');
});
