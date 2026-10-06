export const TANK_SIZE=24, TILE=16, FIELD=416;
const VECTORS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const overlap=(a,b)=>Math.abs(a.x-b.x)<24&&Math.abs(a.y-b.y)<24;
export function newTanks(random=Math.random){
  const map=Array.from({length:26},()=>Array(26).fill(0));
  // Brick avenues, steel bunkers, water and concealing woodland.
  for(let y=4;y<21;y++)for(let x=2;x<24;x++){
    if([2,3,6,7,10,11,14,15,18,19,22,23].includes(x)&&!([8,9,14,15].includes(y)))map[y][x]=1;
  }
  for(const [x,y] of [[6,6],[18,6],[10,12],[14,12]])for(let j=0;j<2;j++)for(let i=0;i<2;i++)map[y+j][x+i]=2;
  for(let y=10;y<12;y++)for(let x=4;x<8;x++)map[y][x]=3;
  for(let y=16;y<19;y++)for(let x=17;x<21;x++)map[y][x]=4;
  for(let y=23;y<26;y++)for(let x=11;x<=14;x++)if(y===23||x===11||x===14)map[y][x]=1;
  return {map,player:{x:144,y:400,dir:'up',cool:0,shield:2},enemies:[],bullets:[],effects:[],base:{x:208,y:400},lives:3,score:0,kills:0,stage:1,spawn:1,spawned:0,status:'playing',random,time:0,nextId:1};
}
export function canTankMove(g,t,x,y){
  if(x<12||y<12||x>FIELD-12||y>FIELD-12)return false;
  for(let row=Math.floor((y-11)/16);row<=Math.floor((y+11)/16);row++)for(let col=Math.floor((x-11)/16);col<=Math.floor((x+11)/16);col++)if([1,2,3].includes(g.map[row]?.[col]))return false;
  if(Math.abs(x-g.base.x)<25&&Math.abs(y-g.base.y)<24)return false;
  return ![g.player,...g.enemies].some(other=>other!==t&&overlap({x,y},other));
}
export function fireTank(g,t,enemy=false){
  if(t.cool>0||g.status!=='playing')return;
  const [dx,dy]=VECTORS[t.dir];
  g.bullets.push({x:t.x+dx*15,y:t.y+dy*15,dx,dy,enemy,dead:false});t.cool=enemy?.95:.28;
}
function explode(g,x,y){g.effects.push({x,y,life:.4});}
function damagePlayer(g){
  if(g.player.shield>0)return;
  explode(g,g.player.x,g.player.y);g.lives--;
  if(g.lives<=0){g.status='lost';return;}
  g.player={x:144,y:400,dir:'up',cool:0,shield:2.5};
}
export function tickTanks(g,dt,held=new Set()){
  if(g.status!=='playing')return;
  g.time+=dt;g.player.cool=Math.max(0,g.player.cool-dt);g.player.shield=Math.max(0,g.player.shield-dt);
  const direction=['up','down','left','right'].find(d=>held.has(d));
  if(direction){
    if(direction!==g.player.dir){const axis=direction==='up'||direction==='down'?'x':'y';const aligned=Math.round((g.player[axis]-16)/32)*32+16;const target={...g.player,[axis]:aligned};if(Math.abs(aligned-g.player[axis])<=9&&canTankMove(g,g.player,target.x,target.y))g.player[axis]=aligned;}
    g.player.dir=direction;const [dx,dy]=VECTORS[direction];const x=g.player.x+dx*95*dt,y=g.player.y+dy*95*dt;if(canTankMove(g,g.player,x,y)){g.player.x=x;g.player.y=y;}}
  if(held.has('fire'))fireTank(g,g.player);
  g.spawn-=dt;
  if(g.spawn<=0&&g.enemies.length<3&&g.spawned<8){
    const x=[16,208,400][g.spawned%3];
    if(![g.player,...g.enemies].some(t=>Math.abs(t.x-x)<30&&t.y<40)){g.enemies.push({id:g.nextId++,x,y:16,dir:'down',cool:1,turn:1.5,hp:g.stage>1?2:1});g.spawned++;}
    g.spawn=1.8;
  }
  for(const e of g.enemies){
    e.cool-=dt;e.turn-=dt;
    let [dx,dy]=VECTORS[e.dir];const speed=48+g.stage*6;
    const x=e.x+dx*speed*dt,y=e.y+dy*speed*dt;
    if(canTankMove(g,e,x,y)){e.x=x;e.y=y;}else e.turn=0;
    if(e.turn<=0){const options=['down','down','left','right','up'];e.dir=options[Math.floor(g.random()*options.length)];e.turn=.6+g.random()*1.6;}
    if(e.cool<=0)fireTank(g,e,true);
  }
  for(const b of g.bullets){
    // Small substeps prevent tunnelling through brickwork at low frame rates.
    const steps=Math.ceil(dt*270/5);
    for(let i=0;i<steps&&!b.dead;i++){
      b.x+=b.dx*270*dt/steps;b.y+=b.dy*270*dt/steps;
      if(b.x<0||b.y<0||b.x>=FIELD||b.y>=FIELD){b.dead=true;break;}
      const row=Math.floor(b.y/16),col=Math.floor(b.x/16),tile=g.map[row][col];
      if(tile===1||tile===2){if(tile===1)g.map[row][col]=0;b.dead=true;explode(g,b.x,b.y);break;}
      if(Math.abs(b.x-g.base.x)<13&&Math.abs(b.y-g.base.y)<13){b.dead=true;g.status='lost';explode(g,g.base.x,g.base.y);break;}
      if(b.enemy){if(Math.abs(b.x-g.player.x)<12&&Math.abs(b.y-g.player.y)<12){b.dead=true;damagePlayer(g);}}
      else{const target=g.enemies.find(e=>e.hp>0&&Math.abs(b.x-e.x)<12&&Math.abs(b.y-e.y)<12);if(target){b.dead=true;target.hp--;explode(g,target.x,target.y);if(target.hp===0){g.score+=100;g.kills++;}}}
      for(const other of g.bullets)if(other!==b&&!other.dead&&other.enemy!==b.enemy&&Math.abs(other.x-b.x)<6&&Math.abs(other.y-b.y)<6){b.dead=other.dead=true;}
    }
  }
  g.enemies=g.enemies.filter(e=>e.hp>0);g.bullets=g.bullets.filter(b=>!b.dead);g.effects=g.effects.filter(e=>(e.life-=dt)>0);
  if(g.spawned===8&&!g.enemies.length){g.stage++;g.spawned=0;g.spawn=2;g.player.shield=2;}
}
