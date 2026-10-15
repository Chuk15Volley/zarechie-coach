import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function handlerFor({card,legacy=null,fail=false,valid=true}={}) {
 const source=readFileSync(new URL('../pages/api/exercises/player-media.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export const config','const config').replace('export default async function handler','async function handler');
 return new Function('redis','normalize','getCard','resolveShareToken','streamImageDataUrl',source+';return handler;')(
 async(command,key)=>{if(fail)throw Error('storage down');return key.startsWith('exercise:yt-manual:')?legacy:null;},()=>({normName:'exact movement',canonicalId:'exact-movement'}),async()=>{if(fail)throw Error('storage down');return card;},async()=>valid?{playerId:'fictional'}:null,()=>false);
}
async function request(options){let status=200,body;const res={status(n){status=n;return this;},json(value){body=value;return this;},end(){return this;}};await handlerFor(options)({method:'GET',query:{token:'fake',name:'Exact Movement'}},res);return {status,body};}
test('player media reads the exact saved trainer video without mutation',async()=>{const r=await request({card:{video:'https://youtu.be/IGt0IfvtN0M'}});assert.equal(r.status,200);assert.equal(r.body.video,'https://youtu.be/IGt0IfvtN0M');});
test('player media distinguishes missing video, unavailable storage and invalid access',async()=>{
 assert.equal((await request({})).body.video,null);assert.equal((await request({fail:true})).status,503);assert.equal((await request({valid:false})).status,401);
});
