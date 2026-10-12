import {validCopyRepeatException,sessionPlayerAliases} from '../lib/manualCopyRepeat.mjs';
import {coachBannedSessionExercises} from '../lib/exerciseRestrictions.js';
import { reconcileReplacementDescriptions } from '../lib/exerciseReplacement.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExerciseVarietyContext, auditExerciseVariety, preferVarietyCorrection } from '../lib/exerciseVariety.mjs';
import { advisorySessionQuality } from '../lib/sessionQualityPolicy.mjs';

const date = '2026-09-30';
const makeSession = name => ({ blocks: [{ label: 'A', exercises: [{ code: 'A1', name, targetSets: ['5'] }] }] });
const past = [{ date: '2026-09-29', focus: 'strength', session: makeSession('DB Row') }];
const varietyContext = buildExerciseVarietyContext(past, { targetDate: date, focus: 'strength' });
const assessSessionQuality = (session, context) => ({ valid: true, score: 95, checks: [], variety: auditExerciseVariety(session, context.varietyContext) });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const identity = value => value;
function apiKey(t) {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  t.after(() => original === undefined ? delete process.env.OPENAI_API_KEY : process.env.OPENAI_API_KEY = original);
}
const common = {
  isAuthorized: () => true, enforceRateLimit: async () => true,
  normalizeExerciseLanguage: identity, sanitizeUnavailableEquipmentExercises: identity,
  normalizeSessionTempoDescriptions: identity, ensureSessionExerciseIds: identity,
  assessSessionQuality, advisorySessionQuality, preferVarietyCorrection, buildExerciseVarietyContext,
  qualityCorrectionPrompt: () => 'repair repetitions',
};

test('synchronous generation repairs a repeated main exercise and retains a reviewable draft if repair fails', async t => {
  apiKey(t);
  const source = readFileSync(new URL('../pages/api/programs/generate.js', import.meta.url), 'utf8');
  const handlerSource = source.slice(source.indexOf('export default async function handler'), source.indexOf('// ── Extracted prompt assembly')).replace('export default ', '');
  for (const fresh of [true, false]) {
    let calls = 0;
    const deps = { ...common, validCopyRepeatException,sessionPlayerAliases,getPlayerTimeZone:async()=>'Europe/Moscow', coachBannedSessionExercises,
      getRecentSessionRecords: async () => past,
      buildGenerationInputs: async () => ({ snapshot: { player: { id: 'p1' } }, targetDate: date, effectiveFocus: 'strength', qualityContext: { varietyContext } }),
      callOpenAIForSession: async () => ++calls === 1 ? { session: makeSession('DB Row') } : fresh ? { session: makeSession('Inverted Row') } : { error: 'repair unavailable' },
    };
    const handler = new Function(...Object.keys(deps), `${handlerSource}; return handler;`)(...Object.values(deps));
    const res = response();
    await handler({ method: 'POST', body: { playerId: 'p1' } }, res);
    assert.equal(res.code, 200);
    assert.equal(calls, 2);
    assert.equal(res.body.quality.variety.ok, fresh);
    assert.equal(res.body.quality.blocking, !fresh);
  }
});

test('queued generation rechecks current history and does not auto-save unresolved repeats', async t => {
  apiKey(t);
  const source = readFileSync(new URL('../pages/api/programs/generate-status.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace('export const config', 'const config').replace('export default ', '');
  for (const historyFails of [false, true]) {
    const writes = [];
    let refreshes = 0;
    const deps = { ...common, validCopyRepeatException,sessionPlayerAliases,getPlayerTimeZone:async()=>'Europe/Moscow', coachBannedSessionExercises,
      crypto: { randomUUID: () => 'lock' }, SYSTEM_PROMPT: 'system',
      getRecentSessionRecords: async (player, count, workspace, target, options) => {
        refreshes++;
        assert.deepEqual([player, workspace, target, options.strict], ['p1', 'nkperf', date, true]);
        if (historyFails) throw new Error('History unavailable');
        return past;
      },
      redis: async (command, key, value) => {
        if (command === 'get') return JSON.stringify({
          status: 'submitted', playerId: 'p1', workspace: 'nkperf', date, focus: 'strength',
          userPrompt: 'generate', sessionTool: {}, openaiResponseId: 'existing', autoSave: true,
          correctionAttempted: true, candidateSession: makeSession('DB Row'), candidateQuality: { valid: true, score: 100 },
          qualityContext: { varietyContext: buildExerciseVarietyContext([], { targetDate: date }) },
        });
        if (command === 'set') { writes.push([key, value]); return 'OK'; }
      },
      redisPipeline: async commands => {
        assert.ok(commands.every(command => command[0] === 'EVAL'), 'Only lock release is permitted, no session writes');
        return [1];
      },
      gymProviderFetch: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'function_call', name: 'build_session', arguments: JSON.stringify(makeSession('DB Row')) }] }) }),
      getPlayerSnapshot: async () => ({ player: { id: 'p1' } }), recordPlatformEvent: async () => {},
    };
    const handler = new Function(...Object.keys(deps), `${source}; return handler;`)(...Object.values(deps));
    const res = response();
    await handler({ method: 'GET', query: { batchId: 'openai-gen-00000000-0000-0000-0000-000000000001' } }, res);
    assert.equal(refreshes, 1);
    if (historyFails) {
      assert.equal(res.code, 500);
      assert.ok(!writes.some(([, value]) => String(value).includes('"status":"done"')));
    } else {
      assert.equal(res.code, 200);
      assert.equal(res.body.autoSaved, false);
      assert.equal(res.body.quality.variety.needsCorrection, true);
      assert.match(res.body.saveWarning, /повторы/);
    }
  }
});

test('manual save recomputes history and records the coach override; an outage prevents writes', async () => {
  const source = readFileSync(new URL('../pages/api/programs/save.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '').replace('export default ', '');
  for (const historyFails of [false, true]) {
    let commands = [];
    const deps = { ...common, validCopyRepeatException,sessionPlayerAliases,getPlayerTimeZone:async()=>'Europe/Moscow', coachBannedSessionExercises,
      getRecentSessionRecords: async () => { if (historyFails) throw new Error('offline'); return past; },
      approveProgramSession: identity, approvedProgramLabel: identity,
      redis: async () => null, reconcileReplacementDescriptions,
      buildDosePrescription: () => ({}), weightKgFromExercise: () => 0,
      loadUnitsForExercise: () => 1, sessionKey: () => 'session:p1', sessionsKey: () => 'sessions:p1',
      redisPipeline: async value => { commands = value; },
    };
    const handler = new Function(...Object.keys(deps), `${source}; return handler;`)(...Object.values(deps));
    const res = response();
    await handler({ method: 'POST', body: { playerId: 'p1', date, focus: 'strength', session: makeSession('DB Row'), quality: { variety: { ok: true } } } }, res);
    if (historyFails) {
      assert.equal(res.code, 503);
      assert.equal(commands.length, 0);
    } else {
      assert.equal(res.code, 200);
      const saved = JSON.parse(commands.find(command => command[0] === 'SET')[2]);
      assert.equal(saved.quality.variety.needsCorrection, true);
      assert.equal(saved.quality.coachOverrideApplied, true);
      assert.ok(saved.quality.coachOverrideAt);
    }
  }
});
