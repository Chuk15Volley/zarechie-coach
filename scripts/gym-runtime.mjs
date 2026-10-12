import {spawn} from 'node:child_process';
// The existing container owns both processes; losing either triggers its existing restart policy.
const children=[spawn(process.execPath,['server.js'],{stdio:'inherit'})];
if(process.env.GYM_TEAM_WORKER_ENABLED!=='0')children.push(spawn(process.execPath,['scripts/gym-team-worker.mjs'],{stdio:'inherit'}));
let ending=false;
function stop(code=0){if(ending)return;ending=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>{for(const child of children)child.kill('SIGKILL');process.exit(code);},5000).unref();Promise.all(children.map(child=>new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve)))).then(()=>process.exit(code));}
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>{if(!ending)stop(code || 1);});}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
