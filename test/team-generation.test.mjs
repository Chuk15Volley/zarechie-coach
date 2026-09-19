import test from 'node:test';
import assert from 'node:assert/strict';
import { pollTeamGeneration } from '../lib/teamGeneration.mjs';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const draft = { status: 'done', autoSaved: false, session: { title: 'Праймер', blocks: [] } };

test('team accepts completed unsaved manual-review programs', async () => {
  const result = await pollTeamGeneration('job', { wait: async () => {}, fetchStatus: async () => reply(200, draft) });
  assert.equal(result, draft);
});

test('transient HTTP, network and malformed responses resume the same job', async () => {
  const responses = [new Error('offline'), reply(502, {}), { json: async () => { throw new Error('HTML'); } }, reply(429, {}), reply(200, { status: 'pending' }), reply(200, draft)];
  const ids = [];
  const result = await pollTeamGeneration('original', {
    wait: async () => {}, fetchStatus: async id => {
      ids.push(id);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  });
  assert.equal(result, draft);
  assert.deepEqual(ids, Array(6).fill('original'));
});

test('expired and failed jobs can restart; authorization errors retain the job', async () => {
  for (const [status, body, restart] of [[404, {}, true], [422, { status: 'failed' }, true], [401, {}, false]]) {
    await assert.rejects(pollTeamGeneration('job', {
      wait: async () => {}, fetchStatus: async () => reply(status, body),
    }), error => error.restartRequired === restart);
  }
});

test('timeout retains a running job for retry instead of generating a duplicate', async () => {
  await assert.rejects(pollTeamGeneration('job', {
    attempts: 2, wait: async () => {}, fetchStatus: async () => reply(200, { status: 'pending' }),
  }), error => !error.restartRequired && /продолжить ожидание/.test(error.message));
});

import { readFileSync } from 'node:fs';
const ui = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
function clientFunction(name, nextName, deps) {
  const start = ui.indexOf(`  async function ${name}(`);
  const end = ui.indexOf(`  async function ${nextName}(`, start);
  return new Function(...Object.keys(deps), `${ui.slice(start, end)}; return ${name};`)(...Object.values(deps));
}

test('team submission requests drafts and retry resumes the original job', async () => {
  let rows = [{ playerId: 'p' }];
  let submissions = 0;
  const deps = {
    setBatchResults: update => { rows = update(rows); },
    date: '2026-09-19', dayGoal: '', days: 7, focus: 'inseason_match_day_primer',
    trainingType: 'activation_power', powerMode: 'auto', strengthMode: 'auto',
    notes: '', recoveryStatus: 'green', workspace: 'zarechie', apiKey: 'test',
    fetch: async (url, options) => {
      submissions++;
      assert.equal(JSON.parse(options.body).autoSave, false);
      return reply(200, { batchId: 'job' });
    },
    pollTeamGeneration: async id => { assert.equal(id, 'job'); return draft; },
  };
  const generate = clientFunction('generatePlayerAsync', 'runBatchGeneration', deps);
  assert.equal(await generate({ id: 'p' }), draft);
  assert.equal(rows[0].request.date, '2026-09-19');
  assert.equal(await generate({ id: 'p' }, rows[0]), draft);
  assert.equal(submissions, 1);
});

test('opening team result loads its player, original date and editable session', async () => {
  const state = {};
  const deps = { workspace: 'zarechie', players: [{ id: 'p', name: 'Player' }],
    period: 'inseason', focus: 'inseason_strength', date: '2026-09-20',
    getFocusLabel: () => 'Силовая',
    selectPlayer: player => { state.player = player; },
    pollBatchResult: () => { throw new Error('Completed draft must not be polled again'); },
  };
  for (const key of ['MainSection', 'SessionType', 'PendingSaved', 'Date', 'Session', 'Meta', 'AutoSaved', 'StrengthMode', 'Error']) {
    deps[`set${key}`] = value => { state[key] = value; };
  }
  const open = clientFunction('openBatchDraft', 'handleGenerate', deps);
  await open({ playerId: 'p', request: { workspace: 'zarechie' }, result: { ...draft, date: '2026-09-19' } });
  assert.equal(state.player.id, 'p');
  assert.equal(state.Date, '2026-09-19');
  assert.equal(state.Session, draft.session);
  assert.equal(state.AutoSaved, false);
  assert.equal(state.MainSection, 'workouts');
});

test('async submission returns JSON when input collection or draft storage fails', async t => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  t.after(() => { if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original; });
  const source = readFileSync(new URL('../pages/api/programs/generate-async.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '').replace('export const config', 'const config').replace('export default async function', 'async function');
  for (const failInputs of [true, false]) {
    const deps = { isAuthorized: () => true, enforceRateLimit: async () => true,
      crypto: { randomUUID: () => 'id' },
      buildGenerationInputs: async () => { if (failInputs) throw new Error('upstream'); return { readyResult: draft }; },
      redis: async () => { throw new Error('storage'); },
    };
    const handler = new Function(...Object.keys(deps), `${source}; return handler;`)(...Object.values(deps));
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await handler({ method: 'POST', body: { playerId: 'p' } }, res);
    assert.equal(res.code, 503);
    assert.match(res.data.error, /очередь/);
  }
});

test('team pool prepares every selected player, isolates failures and allows match-day drafts', async () => {
  let rows = [];
  let running;
  let active = 0, peak = 0;
  const players = Array.from({ length: 8 }, (_, id) => ({ id, name: `P${id}` }));
  const run = clientFunction('runBatchGeneration', 'openBatchDraft', {
    batchRunning: false, apiKey: 'test', players,
    batchSelectedIds: new Set(players.map(p => p.id)),
    matchDayManualReview: true,
    setBatchResults: update => { rows = typeof update === 'function' ? update(rows) : update; },
    setBatchRunning: value => { running = value; },
    generatePlayerAsync: async player => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      if (player.id === 2) throw new Error('upstream');
      return draft;
    },
  });
  await run();
  assert.equal(running, false);
  assert.equal(peak, 5);
  assert.equal(rows.filter(row => row.status === 'done' && row.draft && row.result === draft).length, 7);
  assert.equal(rows[2].error, 'upstream');
});
