import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getReadySixPlayerContext,
  getReadySixRoster,
  getReadySixTeamReadiness,
  readySixIntegrationMode,
  ReadySixIntegrationError,
  usesReadySix,
} from '../lib/readySixClient.js';
import {
  normalizeReadySixPlayerSnapshot,
  normalizeReadySixRoster,
  normalizeReadySixTeamReadiness,
} from '../lib/readySixSnapshotAdapter.js';

const environment = {
  READYSIX_URL: 'https://readysix.example',
  READYSIX_ZARECHIE_API_KEY: 'z-secret',
  READYSIX_NK_API_KEY: 'nk-secret',
  READYSIX_INTEGRATION_MODE: 'primary',
};

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('ReadySix stays legacy until primary mode is explicitly enabled', () => {
  assert.equal(readySixIntegrationMode('zarechie', {}), 'legacy');
  assert.equal(usesReadySix('zarechie', {}), false);
  assert.equal(usesReadySix('zarechie', environment), true);
  assert.equal(readySixIntegrationMode('nkperf', { ...environment, READYSIX_NK_MODE: 'legacy' }), 'legacy');
});

test('unknown workspaces never select another team or make a request', async () => {
  for (const workspace of [undefined, null, '', 'NK', 'other-team', '__proto__', 'constructor', {}, ['nkperf']]) {
    assert.throws(() => readySixIntegrationMode(workspace, environment), error => error.code === 'READYSIX_WORKSPACE_INVALID');
    let calls = 0;
    await assert.rejects(getReadySixRoster(workspace, '2026-09-07', {
      environment, fetchImpl: async () => { calls++; },
    }), error => error.code === 'READYSIX_WORKSPACE_INVALID');
    assert.equal(calls, 0);
  }
});

test('mistyped explicit modes cannot silently fall back to legacy data', () => {
  for (const mode of ['', 'primray', 'disabled', false]) {
    assert.throws(() => readySixIntegrationMode('nkperf', {...environment, READYSIX_NK_MODE: mode}), error => error.code === 'READYSIX_MODE_INVALID');
    assert.throws(() => readySixIntegrationMode('zarechie', {READYSIX_INTEGRATION_MODE: mode}), error => error.code === 'READYSIX_MODE_INVALID');
  }
  assert.equal(readySixIntegrationMode('nkperf', {...environment, READYSIX_NK_MODE: ' PRIMARY '}), 'primary');
  assert.equal(readySixIntegrationMode('nkperf', {READYSIX_NK_MODE:'legacy', READYSIX_INTEGRATION_MODE:'bad'}), 'legacy');
});

test('credential-bearing and ambiguous URLs fail before network access', async () => {
  for (const READYSIX_URL of ['https://user:secret@readysix.example', 'https://readysix.example?key=secret', 'https://readysix.example#secret', 'file:///tmp/example']) {
    let calls = 0;
    await assert.rejects(getReadySixRoster('nkperf', '2026-09-07', {
      environment: {...environment, READYSIX_URL}, fetchImpl: async () => { calls++; },
    }), error => error.code === 'READYSIX_URL_INVALID' && !error.message.includes('secret'));
    assert.equal(calls, 0);
  }
});

test('transport forbids redirects and never includes upstream secrets in its errors', async () => {
  let calls = 0;
  await assert.rejects(getReadySixRoster('nkperf', '2026-09-07', {
    environment,
    fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['x-api-key'], 'nk-secret');
      throw new TypeError('redirect failed: nk-secret');
    },
  }), error => error.code === 'READYSIX_UNAVAILABLE' && !error.message.includes('nk-secret'));
  assert.equal(calls, 1, 'failed transport must not retry with another team credential');
});

test('workspace credentials are selected server-side and organization mismatch fails closed', async () => {
  let observedKey = null;
  await getReadySixRoster('nkperf', '2026-08-27', {
    environment,
    fetchImpl: async (_url, options) => {
      observedKey = options.headers['x-api-key'];
      return response({
        schema: 'readysix.program-generator-context', schemaVersion: 1, mode: 'roster',
        organizationId: 'nk-performance', players: [],
      });
    },
  });
  assert.equal(observedKey, 'nk-secret');

  await assert.rejects(
    getReadySixRoster('zarechie', '2026-08-27', {
      environment,
      fetchImpl: async () => response({
        schema: 'readysix.program-generator-context', schemaVersion: 1, mode: 'roster',
        organizationId: 'nk-performance', players: [],
      }),
    }),
    error => error instanceof ReadySixIntegrationError && error.code === 'READYSIX_CONTRACT_MISMATCH',
  );
});

test('ReadySix player context is normalized to the generator snapshot contract', async () => {
  const payload = {
    schema: 'readysix.program-generator-context', schemaVersion: 1, mode: 'player-context',
    organizationId: 'zarechie-odintsovo', revision: 'a'.repeat(64), date: '2026-08-27',
    player: {
      id: '101', readySixPlayerId: 'player-z', name: 'Player Z', position: 'middle',
      identities: { whoopUserId: '101' },
    },
    monitoring: {
      whoop: [{ date: '2026-08-26', recovery: 68 }, { date: '2026-08-27', recovery: 72 }],
      morning: [{ date: '2026-08-27', readiness: 4 }],
      evening: [{ date: '2026-08-26', fatigue: 3, submittedAt: '2026-08-26T20:00:00.000Z' }],
      postEvening: [{ date: '2026-08-26', fatigue: 2, submittedAt: '2026-08-26T21:00:00.000Z' }],
      postMorning: [{ date: '2026-08-27', srpe: 5, totalLoad: 250 }],
      manual: { '2026-08-27': { duration: 50 } },
      neuro: { hist: { cmj: [{ date: '2026-08-27', value: 40 }] } },
      injuryLog: [], annotations: { training: 'monitor shoulder' }, dataQuality: { complete: true },
    },
    decision: {
      engineVersion: '3.0.1', recommendation: 'modified', capPercent: 80,
      confidence: 'high', hardStopSignal: false,
      targets: [{ target: 'strength_upper', capPercent: 80 }],
    },
  };
  const snapshot = normalizeReadySixPlayerSnapshot(payload, { days: 7, chronicDays: 28, targetDate: '2026-08-27' });
  assert.equal(snapshot.player.readySixPlayerId, 'player-z');
  assert.equal(snapshot.surveys.length, 1);
  assert.equal(snapshot.surveys[0].fatigue, 2, 'newer post-evening record wins over legacy evening');
  assert.equal(snapshot.latestPostMorning.totalLoad, 250);
  assert.equal(snapshot.neuro.latest.hist.cmj[0].value, 40);
  assert.equal(snapshot.readySixDecision.capPercent, 80);
  assert.equal(snapshot.readySixMeta.organizationId, 'zarechie-odintsovo');

  const roster = normalizeReadySixRoster({ players: [payload.player] });
  assert.deepEqual(roster.map(player => player.id), ['101']);

  let requestedUrl = '';
  await getReadySixPlayerContext('zarechie', '101', '2026-08-27', 28, {
    environment,
    fetchImpl: async url => { requestedUrl = String(url); return response(payload); },
  });
  assert.match(requestedUrl, /playerId=101/);
  assert.match(requestedUrl, /historyDays=28/);
});

test('team readiness uses one ReadySix request and normalizes all players', async () => {
  let calls = 0;
  const payload = {
    schema: 'readysix.program-generator-context', schemaVersion: 1, mode: 'team-readiness',
    organizationId: 'zarechie-odintsovo', revision: 'b'.repeat(64), date: '2026-08-27',
    players: [{
      player: { id: '101', readySixPlayerId: 'player-z', name: 'Player Z', position: 'middle', identities: { whoopUserId: '101' } },
      monitoring: { whoop: [{ date: '2026-08-27', recovery: 72 }], morning: [{ date: '2026-08-27', readiness: 4 }], neuro: null },
      decision: { capPercent: 100, confidence: 'high', targets: [] },
    }],
  };
  const received = await getReadySixTeamReadiness('zarechie', '2026-08-27', {
    environment,
    fetchImpl: async () => { calls += 1; return response(payload); },
  });
  const normalized = normalizeReadySixTeamReadiness(received);
  assert.equal(calls, 1);
  assert.equal(normalized.roster[0].id, '101');
  assert.equal(normalized.snapshots[0].whoop[0].recovery, 72);
});
