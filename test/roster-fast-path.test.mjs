import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hydratePlayerPhotos, playerPhotoPath } from '../lib/playerPhotos.js';
import {
  getCachedReadySixRoster,
  READY_SIX_ROSTER_CACHE_FRESH_MS,
  READY_SIX_ROSTER_CACHE_STALE_MS,
} from '../lib/readySixRosterCache.js';

const now = Date.parse('2026-08-28T12:00:00.000Z');
const payload = { schema: 'readysix.program-generator-context', roster: [{ id: '42' }] };

function record(ageMs, value = payload) {
  return JSON.stringify({
    workspace: 'zarechie',
    date: '2026-08-28',
    cachedAt: new Date(now - ageMs).toISOString(),
    payload: value,
  });
}

test('fresh ReadySix roster cache avoids the upstream request', async () => {
  let upstreamCalls = 0;
  const result = await getCachedReadySixRoster('zarechie', '2026-08-28', {
    now,
    redisGet: async () => record(READY_SIX_ROSTER_CACHE_FRESH_MS - 1),
    redisSet: async () => null,
    getRoster: async () => { upstreamCalls += 1; return { roster: [] }; },
  });
  assert.equal(result.cache, 'hit');
  assert.equal(upstreamCalls, 0);
  assert.deepEqual(result.payload, payload);
});

test('stale ReadySix roster keeps the coach app available during an outage', async () => {
  const result = await getCachedReadySixRoster('zarechie', '2026-08-28', {
    now,
    redisGet: async () => record(READY_SIX_ROSTER_CACHE_FRESH_MS + 1),
    redisSet: async () => null,
    getRoster: async () => { throw new Error('upstream unavailable'); },
  });
  assert.equal(result.cache, 'stale');
  assert.deepEqual(result.payload, payload);
});

test('expired ReadySix cache never masks a prolonged outage', async () => {
  await assert.rejects(() => getCachedReadySixRoster('zarechie', '2026-08-28', {
    now,
    redisGet: async () => record(READY_SIX_ROSTER_CACHE_STALE_MS + 1),
    redisSet: async () => null,
    getRoster: async () => { throw new Error('upstream unavailable'); },
  }), /upstream unavailable/);
});

test('photo hydration returns a short versioned proxy instead of embedded image data', async () => {
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
  const commands = [];
  const hydrated = await hydratePlayerPhotos([{ id: '42', name: 'Player', photo: jpeg }], 'zarechie', {
    redisPipelineImpl: async batch => {
      commands.push(batch);
      return commands.length === 1 ? [null, null, null, null] : batch.map(() => 'OK');
    },
  });
  assert.equal(hydrated[0].hasPhoto, true);
  assert.match(hydrated[0].photo, /^\/api\/players\/photo\?playerId=42&workspace=zarechie&v=[a-f0-9]{12}$/);
  assert.equal(hydrated[0].photo.includes('base64'), false);
  assert.equal(commands.length, 2);
});

test('photo proxy URL changes when image content changes', () => {
  assert.notEqual(playerPhotoPath('zarechie', '42', 'first'), playerPhotoPath('zarechie', '42', 'second'));
});

test('roster endpoint uses the resilient cache and photo endpoint supports private GET delivery', () => {
  const rosterApi = readFileSync(new URL('../pages/api/players/list.js', import.meta.url), 'utf8');
  const photoApi = readFileSync(new URL('../pages/api/players/photo.js', import.meta.url), 'utf8');
  const readinessApi = readFileSync(new URL('../pages/api/team/readiness.js', import.meta.url), 'utf8');
  assert.match(rosterApi, /getCachedReadySixRoster/);
  assert.match(photoApi, /req\.method === 'GET'/);
  assert.match(photoApi, /immutable/);
  assert.match(photoApi, /redisPipeline/);
  assert.match(readinessApi, /hydratePlayerPhotos/);
});
