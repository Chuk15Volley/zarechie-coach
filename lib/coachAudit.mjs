import {randomUUID} from 'node:crypto';
import {queuePrefix} from './teamQueue.mjs';
export const coachAuditKey=workspace=>queuePrefix(workspace)+':coach-audit';
// Bounded metadata/coach decisions only. No questionnaire answers or credentials.
export function coachAuditCommands(workspace,event){
  const value={...event,id:randomUUID(),at:event.at || new Date().toISOString(),sourceRevision:process.env.SOURCE_REVISION || process.env.NEXT_PUBLIC_SOURCE_REVISION || 'local'};
  return [['ZADD',coachAuditKey(workspace),Date.parse(value.at),JSON.stringify(value)],['ZREMRANGEBYRANK',coachAuditKey(workspace),0,-2001]];
}
export const EXECUTE_AUDIT_COMMANDS=`local cmds=cjson.decode(ARGV[1]); for _,cmd in ipairs(cmds) do redis.call(unpack(cmd)) end; return 1`;
