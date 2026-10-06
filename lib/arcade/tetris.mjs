export const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]], S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]], J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]],
};
export const COLORS = { I:'#69e0ef', O:'#ffd56c', T:'#bc94ff', S:'#8ae6a4', Z:'#ff7d91', J:'#6ba9ff', L:'#ffb374' };
function refill(g) {
  const bag = Object.keys(SHAPES);
  for (let i=bag.length-1;i>0;i--) { const j=Math.floor(g.random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
  g.queue.push(...bag);
}
export function spawnPiece(g, type) {
  if (g.queue.length < 7) refill(g);
  const name = type || g.queue.shift();
  g.piece = { type:name, matrix:SHAPES[name].map(row=>[...row]), x:name==='O'?4:3, y:-1 };
  g.fall=0; g.lock=0; g.resets=0;
  if (!fits(g,g.piece)) g.status='lost';
}
export function newTetris(random=Math.random) {
  const g={ board:Array.from({length:20},()=>Array(10).fill(null)), queue:[], hold:null, held:false, piece:null, score:0, lines:0, level:1, status:'playing', fall:0, lock:0, resets:0, flash:0, cleared:[], repeat:0, lastMove:null, random };
  spawnPiece(g); return g;
}
export function fits(g,p) {
  return p.matrix.every((row,y)=>row.every((v,x)=>!v || (p.x+x>=0 && p.x+x<10 && p.y+y<20 && (p.y+y<0 || !g.board[p.y+y][p.x+x]))));
}
export function ghostY(g) {
  let y=g.piece.y; while(fits(g,{...g.piece,y:y+1})) y++; return y;
}
function move(g,dx,dy) {
  const p={...g.piece,x:g.piece.x+dx,y:g.piece.y+dy};
  if(!fits(g,p))return false;
  g.piece=p; if(dx && g.resets<15){g.lock=0;g.resets++;} return true;
}
export function lockPiece(g) {
  let topped=false;
  g.piece.matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v){const py=g.piece.y+y;if(py<0)topped=true;else g.board[py][g.piece.x+x]=g.piece.type;}}));
  if(topped){g.status='lost';return;}
  g.cleared=g.board.flatMap((r,i)=>r.every(Boolean)?[i]:[]);
  const count=g.cleared.length;
  if(count){g.board=g.board.filter(r=>!r.every(Boolean));while(g.board.length<20)g.board.unshift(Array(10).fill(null));g.score+=[0,100,300,500,800][count]*g.level;g.lines+=count;g.level=1+Math.floor(g.lines/10);g.flash=.3;}
  g.held=false;spawnPiece(g);
}
export function tetrisAction(g,action) {
  if(g.status!=='playing')return;
  if(action==='left'||action==='right')move(g,action==='left'?-1:1,0);
  if(action==='down' && move(g,0,1))g.score++;
  if(action==='drop'){const y=ghostY(g);g.score+=(y-g.piece.y)*2;g.piece.y=y;lockPiece(g);}
  if(action==='hold'&&!g.held){const old=g.hold;g.hold=g.piece.type;spawnPiece(g,old);g.held=true;}
  if(action==='rotate'){
    const n=g.piece.matrix.length;
    const matrix=Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>g.piece.matrix[n-1-x][y]));
    for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,-2]]){
      const p={...g.piece,matrix,x:g.piece.x+dx,y:g.piece.y+dy};
      if(fits(g,p)){g.piece=p;if(g.resets<15){g.lock=0;g.resets++;}break;}
    }
  }
}
export function tickTetris(g,dt,held=new Set()) {
  if(g.status!=='playing')return;
  g.flash=Math.max(0,g.flash-dt);
  const direction=held.has('left')?'left':held.has('right')?'right':null;
  if(direction!==g.lastMove){g.lastMove=direction;g.repeat=.18;}else if(direction){g.repeat-=dt;if(g.repeat<=0){tetrisAction(g,direction);g.repeat=.065;}}
  g.fall+=dt;
  const speed=held.has('down')?.045:Math.max(.08,.75*Math.pow(.8,g.level-1));
  if(g.fall>=speed){g.fall=0;if(move(g,0,1)&&held.has('down'))g.score++;}
  if(!fits(g,{...g.piece,y:g.piece.y+1})){g.lock+=dt;if(g.lock>=.45)lockPiece(g);}else g.lock=0;
}
