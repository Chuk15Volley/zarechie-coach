// Isolated release smoke: built coach + synthetic ReadySix/Redis/OpenAI only.
// No production athlete writes. Default: no model requests. --live-model explicitly
// uses the configured model key with synthetic inputs. Run after npm run build.
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readySixToday } from '../lib/readySixPlanning.mjs';
import { pathToFileURL } from 'node:url';
const liveModel = process.argv.includes('--live-model');
if (liveModel && !process.env.OPENAI_API_KEY) {
  const { default: { loadEnvConfig } } = await import('@next/env');
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
}
if (liveModel && !process.env.OPENAI_API_KEY) throw new Error('Live model credential is missing');
const directory = await mkdtemp(path.join(tmpdir(), 'gym-flow-'));
const records = new Map();
let scenario = 'normal';
let modelCalls = 0;
const date = '2026-09-16';
const player = { id: 'qa-player', readySixPlayerId: 'qa-player', name: 'Тестовый игрок', position: 'middle' };
const session = { title: 'Тестовая программа', blocks: [{ code: 'E', label: 'Профилактика', rest_note: '60 сек', exercises: [{ code: 'E1', name: 'Dead Bug', targetSets: ['6', '6'], tempo: '2020', weightKg: 0 }] }] };
const readBody = async req => { let body = ''; for await (const part of req) body += part; return body ? JSON.parse(body) : null; };
function command([op, key, ...args]) {
  switch (String(op).toUpperCase()) {
    case 'GET': return records.get(key) ?? null;
    case 'SET': records.set(key, args[0]); return 'OK';
    case 'MGET': return [key, ...args].map(k => records.get(k) ?? null);
    case 'PING': return 'PONG';
    case 'EVAL': return 1;
    case 'ZRANGE': case 'ZREVRANGE': case 'ZREVRANGEBYSCORE': case 'SMEMBERS': case 'HGETALL': return [];
    default: return 0;
  }
}
const backend = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('content-type', 'application/json');
  if (url.pathname === '/model-observed') { modelCalls++; res.end('{}'); return; }
  if (url.pathname === '/responses') {
    modelCalls++;
    res.end(JSON.stringify({ id: 'response-qa', status: 'completed', output: [{ type: 'function_call', name: 'build_session', arguments: JSON.stringify(session) }] })); return;
  }
  if (url.pathname === '/api/integrations/program-generator') {
    const requestedDate = url.searchParams.get('date');
    const selected = url.searchParams.get('playerId');
    const mode = selected ? 'player-context' : url.searchParams.get('view') === 'readiness' ? 'team-readiness' : 'roster';
    const decision = { recommendation: scenario === 'stop' ? 'load_stop' : scenario === 'planning' ? 'insufficient_data' : 'full', capPercent: scenario === 'stop' ? 0 : 100, confidence: 'high', reasons: [], restrictions: [], targets: [] };
    const monitoring = scenario === 'planning' ? { whoop: [], morning: [], evening: [], postMorning: [], postEvening: [] } : { whoop: [{ date: requestedDate, recovery: 5 }], morning: [{ date: requestedDate, readiness: 5 }], evening: [], postMorning: [], postEvening: [] };
    const calendar = { date: requestedDate, events: scenario === 'planning' ? [{ date: requestedDate, type: 'rest' }] : scenario === 'matches' ? [{ date: '2026-09-15', type: 'match' }, { date, type: 'match' }] : scenario === 'rest' ? [{ date: requestedDate, type: 'rest' }] : [{ date: '2026-09-20', type: 'match' }], conflicts: [] };
    res.end(JSON.stringify({ schema: 'readysix.program-generator-context', schemaVersion: 1, mode,
      organizationId: req.headers['x-api-key'] === 'qa-nk' ? 'nk-performance' : 'zarechie-odintsovo',
      date: requestedDate, revision: 'qa-revision', generatedAt: new Date().toISOString(), calendar,
      ...(selected ? { player, monitoring, decision } : { players: mode === 'roster' ? [player] : [{ player, monitoring, decision }] }),
    })); return;
  }
  if (url.pathname === '/pipeline') res.end(JSON.stringify((await readBody(req)).map(c => ({ result: command(c) }))));
  else res.end(JSON.stringify({ result: command(url.pathname.slice(1).split('/').map(decodeURIComponent)) }));
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${backend.address().port}`;
const reservation = http.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
await writeFile(path.join(directory, 'fetch.cjs'), `
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input?.url || input));
  if (url.origin === 'https://api.openai.com') {
    if (${JSON.stringify(liveModel)}) { await original(${JSON.stringify(fixtureUrl + '/model-observed')}); return original(input, options); }
    return original(${JSON.stringify(fixtureUrl + '/responses')}, options);
  }
  if (url.origin === 'https://readysix.test') return original(${JSON.stringify(fixtureUrl)} + url.pathname + url.search, options);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('External network disabled in gym QA');
  return original(input, options);
};`);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(), env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production',
    NODE_OPTIONS: `--require=${path.join(directory, 'fetch.cjs')}`, TRAINER_API_KEY: 'qa-trainer-only',
    OPENAI_API_KEY: liveModel ? process.env.OPENAI_API_KEY : 'qa-model-only', KV_REST_API_URL: fixtureUrl, KV_REST_API_TOKEN: 'qa-redis',
    READYSIX_URL: 'https://readysix.test', READYSIX_ZARECHIE_API_KEY: 'qa-z', READYSIX_NK_API_KEY: 'qa-nk',
    READYSIX_ZARECHIE_MODE: 'primary', READYSIX_NK_MODE: 'primary',
  }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
const request = async (route, body) => {
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': 'qa-trainer-only', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(liveModel ? 150000 : 30000) });
  return { status: response.status, body: await response.json() };
};
try {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Server exited: ${log.slice(-1500)}`);
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const context = await request(`/api/players/decision-data?playerId=qa-player&date=${date}&workspace=zarechie`);
  assert.equal(context.status, 200, JSON.stringify(context.body));
  assert.equal(context.body.decision.level, 'green', 'local WHOOP=5 cannot override ReadySix full');
  assert.equal(context.body.recommendation.key, 'strength');
  const input = { playerId: player.id, date, workspace: 'zarechie', focus: 'inseason_strength', trainingType: 'full_body', autoSave: false };
  for (const forbidden of ['stop', 'rest']) {
    scenario = forbidden;
    for (const route of ['generate', 'generate-async']) {
      const result = await request(`/api/programs/${route}`, input);
      assert.equal(result.status, 409, `${forbidden}: ${JSON.stringify(result.body)}`);
    }
  }
  assert.equal(modelCalls, 0);
  scenario = 'normal';
  const queued = await request('/api/programs/generate-async', input);
  assert.equal(queued.status, 200, JSON.stringify(queued.body));
  assert.equal(JSON.parse(records.get(`coach:batch:${queued.body.batchId}`)).qualityContext.gymRecommendation.revision, 'qa-revision');
  scenario = 'stop';
  const changed = await request(`/api/programs/generate-status?batchId=${queued.body.batchId}`);
  assert.ok(changed.status >= 400 || changed.body.status === 'failed', JSON.stringify(changed.body));
  assert.equal(modelCalls, 0, 'a new stop before polling must prevent the model call');
  scenario = 'matches';
  const matchQueued = await request('/api/programs/generate-async', { ...input, focus: 'inseason_match_day_primer', trainingType: 'activation_power' });
  assert.equal(matchQueued.status, 200);
  const matchContext = JSON.parse(records.get(`coach:batch:${matchQueued.body.batchId}`)).qualityContext;
  assert.equal(matchContext.dosePrescription.matchDayPrimer.seriesDay, 2, 'series comes from ReadySix even with no saved gym history');
  assert.equal(matchContext.dosePrescription.loadedHardSetsMax, undefined, 'match day is not an inferred recovery day');
  console.log('PASS: ReadySix consecutive-match series reaches the actual generator');
  scenario = 'normal';
  const generated = await request('/api/programs/generate', input);
  assert.equal(generated.status, 200, liveModel ? 'Live model request failed; check the local credential or retry in the deployed environment' : JSON.stringify(generated.body));
  assert.ok(generated.body.session.blocks.length);
  assert.equal(generated.body.quality.dose.prescription.readySix.revision, 'qa-revision');
  if (liveModel) {
    console.log(JSON.stringify({ liveModel: true, calls: modelCalls, score: generated.body.quality.score, blocking: generated.body.quality.blocking, failedChecks: generated.body.quality.checks.filter(check => !check.ok).map(check => check.id) }));
    assert.equal(generated.body.quality.blocking, false, 'Live generated program exceeded a deterministic safety/dose ceiling');
  }
  // Explicit manual save in the isolated store, then reopen through the real API.
  const saved = await request('/api/programs/save', { ...input, ...generated.body, playerId: player.id, workspace: 'zarechie' });
  assert.equal(saved.status, 200, 'Synthetic program save failed');
  const reopened = await request(`/api/programs/get?playerId=${player.id}&date=${date}&workspace=zarechie`);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.record.date, date);
  assert.equal(reopened.body.record.quality.dose.prescription.readySix.revision, 'qa-revision');
  assert.deepEqual(reopened.body.record.session.blocks.flatMap(block => block.exercises.map(ex => ex.name)),
    generated.body.session.blocks.flatMap(block => block.exercises.map(ex => ex.name)));
  const otherWorkspace = await request(`/api/programs/get?playerId=${player.id}&date=${date}&workspace=nkperf`);
  assert.equal(otherWorkspace.body.record, null, 'A program must not cross workspace boundaries');
  console.log('PASS: save, reopen, ReadySix revision and workspace isolation in local storage');
  if (!liveModel) {
    scenario = 'planning';
    const futureDate = new Date(Date.parse(readySixToday() + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const futureInput = { ...input, date: futureDate, focus: 'camp_iso_anterior', trainingType: 'anterior_chain' };
    const decision = await request(`/api/players/decision-data?playerId=${player.id}&date=${futureDate}&workspace=zarechie`);
    assert.equal(decision.status, 200);
    assert.equal(decision.body.recommendation.planning.assessmentDate, readySixToday());
    assert.equal(decision.body.recommendation.key, 'planning_only');
    const futureQueue = await request('/api/programs/generate-async', futureInput);
    assert.equal(futureQueue.status, 200, 'Missing future questionnaires must not block async queue');
    const future = await request('/api/programs/generate', futureInput);
    assert.equal(future.status, 200, 'Missing future questionnaires must not block sync generation');
    assert.equal(future.body.quality.dose.prescription.readySix.planning.preliminary, true);
    const savedFuture = await request('/api/programs/save', { ...futureInput, ...future.body, playerId: player.id, workspace: 'zarechie' });
    assert.equal(savedFuture.status, 200);
    const reopenedFuture = await request(`/api/programs/get?playerId=${player.id}&date=${futureDate}&workspace=zarechie`);
    assert.equal(reopenedFuture.body.record.date, futureDate);
    assert.equal(reopenedFuture.body.record.quality.dose.prescription.readySix.planning.assessmentDate, readySixToday());
    scenario = 'stop';
    const stoppedFuture = await request(`/api/programs/generate-status?batchId=${futureQueue.body.batchId}`);
    assert.equal(stoppedFuture.status, 409, 'A newly reported real stop must still block future draft processing');
    scenario = 'normal';
    console.log('PASS: evening planning without questionnaires, both generation routes, saved future date/provenance and new-stop refresh');
  }
  if (process.env.QA_BROWSER_MODULE) {
    const { chromium } = await import(pathToFileURL(process.env.QA_BROWSER_MODULE));
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.request.post(base + '/api/auth/login', { data: { trainerKey: 'qa-trainer-only' } });
      const page = await context.newPage();
      await page.goto(base);
      await page.getByText('Тестовый игрок', { exact: true }).first().click();
      await page.getByText('ReadySix · состояние и расписание', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Применить вариант для зала' }).click();
      await page.screenshot({ path: process.env.QA_SCREENSHOT || '/tmp/readysix-gym-flow.png', fullPage: true });
      console.log('PASS: real browser source card and apply action');
      if (!liveModel) {
        scenario = 'planning';
        await page.reload();
        await page.getByText('Тестовый игрок', { exact: true }).first().click();
        const selectedDate = readySixToday();
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const [year, month, day] = selectedDate.split('-').map(Number);
        await page.getByRole('button', { name: `${day} ${monthNames[month - 1]} ${year}`, exact: true }).first().click();
        const tomorrowDate = new Date(Date.parse(selectedDate + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
        await page.getByRole('button', { name: tomorrowDate, exact: true }).click();
        await page.getByText(`Предварительный план на ${tomorrowDate}`, { exact: true }).waitFor();
        await page.getByText('Анкеты на дату тренировки не обязательны для подготовки программы.', { exact: false }).waitFor();
        await page.screenshot({ path: '/tmp/readysix-evening-planning.png', fullPage: true });
        console.log('PASS: preliminary planning notice in real browser');
      }
    } finally { await browser.close(); }
  }
  console.log(`PASS: real HTTP readiness, sync/async safety, poll-time refresh, generation context; ${liveModel ? 'live model with synthetic player and local storage' : 'synthetic services only'}`);
} finally {
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode == null) child.kill('SIGKILL');
  backend.closeAllConnections();
  await new Promise(resolve => backend.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
