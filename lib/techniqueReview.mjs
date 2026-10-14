import {createHash} from 'node:crypto';
import {variantTechnique} from './coachAuditPresentation.mjs';
import {replacementTechnique} from './exerciseReplacement.mjs';
export function reviewMaterial(card){return {canonicalId:card.canonicalId,title:card.title,description:variantTechnique(card) || card.description || replacementTechnique(card.title),video:card.video || card.autoVideo || ''};}
export const materialVersion=card=>createHash('sha256').update(JSON.stringify(reviewMaterial(card))).digest('hex');
export const reviewKey=id=>'gym:technique-review:v2:'+createHash('sha256').update(id).digest('hex');
export function reviewView(events,version){
 const checks={};for(const event of events)if(event.version===version && !checks[event.type])checks[event.type]=event;
 return {checks,events,version,revision:events[0]?.revision || 0};
}
// Journal-only CAS: one explicit action appends one event, never changes catalogue or programs.
export const APPEND_TECHNIQUE_REVIEW=`local raw=redis.call('lindex',KEYS[1],0) local revision=0 if raw then revision=cjson.decode(raw).revision end if revision~=tonumber(ARGV[1]) then return 0 end redis.call('lpush',KEYS[1],ARGV[2]) return 1`;
