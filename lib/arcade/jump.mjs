export function newJump(random=Math.random) {
  const g={ x:180,y:397,vx:0,vy:-390,camera:0,score:0,status:'playing',platforms:[{x:146,y:450,w:70,type:'normal'}],highest:450,time:0,random,particles:[],monsters:[],shots:[],cool:0 };
  extend(g);return g;
}
function extend(g){
  while(g.highest>g.camera-100){
    const prev=g.platforms[g.platforms.length-1];
    g.highest-=48+g.random()*20;
    const x=Math.max(8,Math.min(288,prev.x+(g.random()-.5)*220));
    const difficulty=Math.min(.7,g.score/2000);
    const r=g.random();
    const type=r<.13+difficulty*.2?'moving':'normal';
    // Fragile platforms are optional detours, never the only reachable step.
    if(r>.92&&g.score>200)g.platforms.push({x:x<150?270:20,y:g.highest+22,w:55,type:'break',broken:false});
    if(g.score>350&&g.random()<.1)g.monsters.push({x:x<150?270:65,y:g.highest-22,phase:g.random()*6});
    g.platforms.push({x,y:g.highest,w:64,type,dir:g.random()<.5?-1:1,spring:type==='normal'&&g.random()<.13,broken:false});
  }
}
export function fireJump(g){if(g.status==='playing'&&g.cool<=0){g.shots.push({x:g.x,y:g.y-20});g.cool=.25;}}
export function tickJump(g,dt,held=new Set()) {
  if(g.status!=='playing')return;
  g.time+=dt;g.cool=Math.max(0,g.cool-dt);
  if(held.has('fire'))fireJump(g);
  const axis=(held.has('right')?1:0)-(held.has('left')?1:0);
  g.vx+=(axis*240-g.vx)*Math.min(1,dt*14);
  const oldY=g.y;g.x=(g.x+g.vx*dt+360)%360;g.vy+=900*dt;g.y+=g.vy*dt;
  for(const p of g.platforms){
    if(p.type==='moving'){p.x+=p.dir*55*dt;if(p.x<4||p.x+p.w>356){p.x=Math.max(4,Math.min(356-p.w,p.x));p.dir*=-1;}}
    if(g.vy>0&&!p.broken&&oldY+18<=p.y&&g.y+18>=p.y&&g.x+13>p.x&&g.x-13<p.x+p.w){
      if(p.type==='break'){p.broken=true;g.particles.push({x:p.x,y:p.y,life:.5});continue;}
      g.y=p.y-18;g.vy=p.spring?-650:-390;p.bounce=.16;
    }
    p.bounce=Math.max(0,(p.bounce||0)-dt);
  }
  if(g.y-g.camera<190){g.camera=g.y-190;g.score=Math.max(g.score,Math.floor(-g.camera));}
  for(const shot of g.shots){shot.y-=600*dt;const monster=g.monsters.find(m=>!m.dead&&Math.abs(shot.x-m.x)<23&&Math.abs(shot.y-m.y)<20);if(monster){monster.dead=true;shot.dead=true;}}
  for(const monster of g.monsters){if(monster.dead)continue;if(Math.abs(g.x-monster.x)<27&&Math.abs(g.y-monster.y)<28){if(g.vy>0&&oldY+10<monster.y){monster.dead=true;g.vy=-390;}else g.status='lost';}}
  g.monsters=g.monsters.filter(m=>!m.dead&&m.y<g.camera+530);
  g.shots=g.shots.filter(s=>!s.dead&&s.y>g.camera-30);
  g.particles=g.particles.filter(p=>(p.life-=dt)>0);
  g.platforms=g.platforms.filter(p=>p.y<g.camera+530);
  extend(g);
  if(g.y-g.camera>520)g.status='lost';
}
