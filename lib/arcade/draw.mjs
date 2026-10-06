import { COLORS, SHAPES, ghostY } from './tetris.mjs';
export const SIZES={snake:[384,384],tetris:[360,440],jump:[360,480],tanks:[416,416]};
function text(c,value,x,y,size=12,color='#b6c8d5',align='left'){c.fillStyle=color;c.font=`600 ${size}px ui-monospace, monospace`;c.textAlign=align;c.fillText(value,x,y);}
function rounded(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
function tile(c,x,y,size,color,ghost=false){
  if(ghost){rounded(c,x+1,y+1,size-2,size-2,3,null,color+'88');return;}
  rounded(c,x+1,y+1,size-2,size-2,3,color);
  c.fillStyle='#ffffff40';c.fillRect(x+3,y+3,size-6,2);c.fillStyle='#00000022';c.fillRect(x+3,y+size-5,size-6,2);
}
export function drawSnake(c,g){
  c.fillStyle='#091c19';c.fillRect(0,0,384,384);
  const gradient=c.createRadialGradient(192,160,10,192,192,270);gradient.addColorStop(0,'#18433455');gradient.addColorStop(1,'#00000000');c.fillStyle=gradient;c.fillRect(0,0,384,384);
  c.strokeStyle='#a5e8c10c';c.lineWidth=1;
  for(let i=0;i<=16;i++){c.beginPath();c.moveTo(i*24,0);c.lineTo(i*24,384);c.moveTo(0,i*24);c.lineTo(384,i*24);c.stroke();}
  if(g.food){const [x,y]=g.food;c.shadowColor='#ffb974';c.shadowBlur=16;tile(c,x*24+4,y*24+4,16,'#ffc17d');c.shadowBlur=0;}
  g.snake.forEach(([x,y],i)=>{tile(c,x*24,y*24,24,i===0?'#d8ffe9':i%2?'#7cdaa9':'#68c99b');});
  const [x,y]=g.snake[0],dir=g.direction;
  c.fillStyle='#194230';
  const eyes=dir==='up'?[[7,6],[16,6]]:dir==='down'?[[7,17],[16,17]]:dir==='left'?[[5,7],[5,16]]:[[17,7],[17,16]];
  eyes.forEach(([ex,ey])=>c.fillRect(x*24+ex,y*24+ey,3,3));
}
function piecePreview(c,type,x,y,size=12){if(!type)return;SHAPES[type].forEach((row,dy)=>row.forEach((v,dx)=>{if(v)tile(c,x+dx*size,y+dy*size,size,COLORS[type]);}));}
export function drawTetris(c,g){
  c.fillStyle='#101322';c.fillRect(0,0,360,440);
  const x=14,y=12,size=20;
  rounded(c,x-2,y-2,204,404,5,'#080d19','#303957');
  for(let row=0;row<20;row++)for(let col=0;col<10;col++){
    c.fillStyle=(col+row)%2?'#ffffff03':'#ffffff06';c.fillRect(x+col*size,y+row*size,19,19);
    if(g.board[row][col])tile(c,x+col*size,y+row*size,size,COLORS[g.board[row][col]]);
  }
  const paint=(p,gy,ghost)=>p.matrix.forEach((r,dy)=>r.forEach((v,dx)=>{if(v&&gy+dy>=0)tile(c,x+(p.x+dx)*size,y+(gy+dy)*size,size,COLORS[p.type],ghost);}));
  paint(g.piece,ghostY(g),true);paint(g.piece,g.piece.y,false);
  if(g.flash>0){c.fillStyle=`rgba(210,227,255,${g.flash})`;g.cleared.forEach(row=>c.fillRect(x,y+row*size,200,size));}
  rounded(c,232,12,114,82,10,'#1a2137');text(c,'ЗАПАС',244,34,10,'#8995b5');piecePreview(c,g.hold,249,48,15);
  rounded(c,232,104,114,175,10,'#1a2137');text(c,'ДАЛЕЕ',244,127,10,'#8995b5');g.queue.slice(0,3).forEach((type,i)=>piecePreview(c,type,247,140+i*43,14));
  text(c,'УРОВЕНЬ',240,308,10,'#8995b5');text(c,String(g.level).padStart(2,'0'),240,336,26,'#e3d4ff');
  text(c,'ЛИНИИ',240,366,10,'#8995b5');text(c,String(g.lines).padStart(2,'0'),240,394,26,'#e3d4ff');
  text(c,'10 × 20',114,431,9,'#68758e','center');
}
function jumper(c,x,y,vx,vy,time){
  c.save();c.translate(x,y);if(vx<0)c.scale(-1,1);
  c.strokeStyle='#344844';c.lineWidth=2.2;c.lineJoin='round';
  // A hand-drawn little explorer with a backpack and two springy feet.
  rounded(c,-19,-5,9,19,3,'#eea858','#4f5a45');
  c.fillStyle='#b0d65c';c.beginPath();c.moveTo(-13,12);c.quadraticCurveTo(-20,-19,-4,-22);c.quadraticCurveTo(17,-25,17,5);c.lineTo(12,14);c.closePath();c.fill();c.stroke();
  c.fillStyle='#d6eb91';c.beginPath();c.ellipse(1,3,10,10,0,0,Math.PI*2);c.fill();
  for(const ex of [-5,7]){rounded(c,ex,-17,8,10,3,'#fffde9','#344844');c.fillStyle='#344844';c.fillRect(ex+4,-13,2,4);}
  c.beginPath();c.moveTo(15,-2);c.lineTo(24,0);c.lineTo(24,6);c.lineTo(15,5);c.fillStyle='#b0d65c';c.fill();c.stroke();
  c.beginPath();c.moveTo(-8,12);c.lineTo(-10,vy<0?17:20);c.lineTo(-16,vy<0?17:20);c.moveTo(8,12);c.lineTo(11,18);c.lineTo(17,18);c.stroke();
  c.beginPath();c.moveTo(-5,-22);c.lineTo(-8,-29);c.stroke();c.fillStyle='#eea858';c.beginPath();c.arc(-8,-30,3,0,Math.PI*2);c.fill();c.restore();
}
export function drawJump(c,g){
  c.fillStyle='#f7f3df';c.fillRect(0,0,360,480);
  c.strokeStyle='#97bdb52b';c.lineWidth=1;
  for(let x=0;x<360;x+=24){c.beginPath();c.moveTo(x,0);c.lineTo(x,480);c.stroke();}
  for(let y=(((-g.camera)%24)+24)%24;y<480;y+=24){c.beginPath();c.moveTo(0,y);c.lineTo(360,y);c.stroke();}
  c.strokeStyle='#d8a8a64a';c.beginPath();c.moveTo(31,0);c.lineTo(31,480);c.stroke();
  // Marginal pencil stars stay behind the platforms as the page scrolls.
  for(let i=0;i<7;i++){const x=47+(i*71)%280,y=((i*113-g.camera*.3)%510+510)%510;c.strokeStyle='#a1b79860';c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.moveTo(x,y-4);c.lineTo(x,y+4);c.stroke();}
  for(const p of g.platforms){if(p.broken)continue;const y=p.y-g.camera+(p.bounce?2:0);if(y< -25||y>500)continue;
    const color=p.type==='moving'?'#81bdd7':p.type==='break'?'#c49b75':'#9cc65a';
    rounded(c,p.x,y,p.w,10,4,color,'#53664b');c.fillStyle='#ffffff60';c.fillRect(p.x+5,y+2,p.w-10,2);
    if(p.type==='moving'){text(c,'↔',p.x+p.w/2,y+8,10,'#34596e','center');}
    if(p.type==='break'){c.beginPath();c.moveTo(p.x+25,y);c.lineTo(p.x+33,y+4);c.lineTo(p.x+27,y+10);c.strokeStyle='#705942';c.stroke();}
    if(p.spring){c.beginPath();c.moveTo(p.x+23,y);for(let j=0;j<5;j++)c.lineTo(p.x+23+(j%2?10:0),y-j*3-2);c.strokeStyle='#7c7f83';c.lineWidth=2;c.stroke();rounded(c,p.x+19,y-17,18,4,2,'#dfae63','#686749');}
  }
  for(const p of g.particles){c.fillStyle='#b68d64';const d=(.5-p.life)*40;for(let i=0;i<3;i++)c.fillRect(p.x+i*20,yScreen(p.y,g)+d,14,7);}
  for(const m of g.monsters){const y=m.y-g.camera;rounded(c,m.x-20,y-15,40,30,13,'#b0a3c2','#655577');c.fillStyle='#fffbea';c.beginPath();c.ellipse(m.x,y-2,10,10,0,0,Math.PI*2);c.fill();c.fillStyle='#655577';c.beginPath();c.arc(m.x+2,y-1,4,0,Math.PI*2);c.fill();c.strokeStyle='#655577';c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.moveTo(m.x-12+i*12,y+13);c.lineTo(m.x-16+i*12,y+20+Math.sin(g.time*8+i)*3);c.stroke();}}
  g.shots.forEach(s=>{c.fillStyle='#d3a65c';c.beginPath();c.arc(s.x,s.y-g.camera,4,0,Math.PI*2);c.fill();});
  jumper(c,g.x,g.y-g.camera,g.vx,g.vy,g.time);
  if(g.x<22)jumper(c,g.x+360,g.y-g.camera,g.vx,g.vy,g.time);
  if(g.x>338)jumper(c,g.x-360,g.y-g.camera,g.vx,g.vy,g.time);
  text(c,'ВЫСОТА',344,24,9,'#839278','right');text(c,`${g.score} м`,344,46,20,'#4c6240','right');
}
function yScreen(y,g){return y-g.camera;}
function tank(c,t,enemy,time){
  c.save();c.translate(t.x,t.y);c.rotate(({up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2})[t.dir]);
  c.fillStyle='#0008';c.fillRect(-12,-10,26,26);
  const track=enemy?'#9e8e78':'#b6a975',body=enemy?'#df9d7b':'#f2d67a';
  c.fillStyle=track;c.fillRect(-12,-12,6,24);c.fillRect(6,-12,6,24);
  c.fillStyle='#283036';for(let i=0;i<6;i++){const y=-11+i*4+(Math.floor(time*12)%2);c.fillRect(-12,y,6,1);c.fillRect(6,y,6,1);}
  c.fillStyle=body;c.fillRect(-7,-10,14,20);c.fillStyle=enemy?'#b57668':'#bd9c47';c.fillRect(-5,-6,10,13);
  c.fillStyle=body;c.fillRect(-4,-4,8,8);c.fillRect(-2,-18,4,16);c.fillStyle='#fff5';c.fillRect(-6,-10,2,15);
  if(t.hp>1){c.fillStyle='#d9e4ef';c.fillRect(-4,5,8,3);}c.restore();
  if(t.shield>0){c.strokeStyle=Math.floor(time*12)%2?'#b9e6ff':'#ffffff55';c.lineWidth=2;c.strokeRect(t.x-16,t.y-16,32,32);}
}
export function drawTanks(c,g){
  c.fillStyle='#172024';c.fillRect(0,0,416,416);
  for(let row=0;row<26;row++)for(let col=0;col<26;col++){
    const type=g.map[row][col],x=col*16,y=row*16;
    if(type===1){c.fillStyle='#a96f51';c.fillRect(x,y,16,16);c.fillStyle='#d89c70';c.fillRect(x+1,y+1,14,2);c.fillRect(x+1,y+9,14,2);c.fillStyle='#513e35';c.fillRect(x,y+7,16,1);c.fillRect(x+7,y,1,7);c.fillRect(x+3,y+8,1,8);}
    if(type===2){c.fillStyle='#a9b9bf';c.fillRect(x,y,16,16);c.fillStyle='#e2e9e9';c.fillRect(x+1,y+1,14,2);c.fillRect(x+1,y+1,2,14);c.fillStyle='#66777c';c.fillRect(x+13,y+3,2,12);c.fillRect(x+3,y+13,12,2);}
    if(type===3){c.fillStyle='#305c77';c.fillRect(x,y,16,16);c.fillStyle='#81bdcc88';const offset=Math.floor(g.time*5)%8;c.fillRect(x+offset,y+4,7,2);c.fillRect(x+((offset+4)%8),y+11,7,2);}
    if(!type){c.fillStyle='#d5cfa409';c.fillRect(x+7,y+7,2,2);}
  }
  // The player's base uses an original winged shield emblem.
  const bx=g.base.x,by=g.base.y;rounded(c,bx-13,by-13,26,26,3,'#17222b','#c7b273');
  c.fillStyle=g.status==='lost'?'#9a6c5b':'#dfc57d';c.beginPath();c.moveTo(bx,by-8);c.lineTo(bx+6,by-3);c.lineTo(bx+11,by-8);c.lineTo(bx+9,by+2);c.lineTo(bx+4,by+4);c.lineTo(bx,by+10);c.lineTo(bx-4,by+4);c.lineTo(bx-9,by+2);c.lineTo(bx-11,by-8);c.lineTo(bx-6,by-3);c.closePath();c.fill();
  tank(c,g.player,false,g.time);g.enemies.forEach(e=>tank(c,e,true,g.time));
  g.bullets.forEach(b=>{c.fillStyle=b.enemy?'#ffbca0':'#fff2b3';c.fillRect(b.x-2,b.y-2,4,4);});
  for(let row=0;row<26;row++)for(let col=0;col<26;col++)if(g.map[row][col]===4){const x=col*16,y=row*16;c.fillStyle='#427352dd';c.fillRect(x,y,16,16);c.fillStyle='#75a56f';c.fillRect(x+2,y+2,5,5);c.fillRect(x+9,y+8,5,5);c.fillStyle='#203d2d';c.fillRect(x+5,y+9,3,4);}
  g.effects.forEach(e=>{const r=(.4-e.life)*40+3;c.fillStyle=e.life>.22?'#ffe2a6':'#e88e5277';c.beginPath();for(let i=0;i<12;i++){const a=i*Math.PI/6,rr=i%2?r*.45:r;c.lineTo(e.x+Math.cos(a)*rr,e.y+Math.sin(a)*rr);}c.closePath();c.fill();});
}
export function drawGame(c,type,g){c.save();({snake:drawSnake,tetris:drawTetris,jump:drawJump,tanks:drawTanks})[type](c,g);c.restore();}
