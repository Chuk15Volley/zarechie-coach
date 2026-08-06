import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPerformanceKpisForPrompt, performanceKpis } from '../lib/performanceKpis.mjs';

test('selects the latest available result independently for every KPI', () => {
  const neuro = {
    history: [
      { date: '2026-07-20', cmj: 40, sprint: 1.9 },
      { date: '2026-07-27', cmj: 42, sprint: 1.85 },
      { date: '2026-08-03', cmj: 38, sprint: 1.95 },
      { date: '2026-08-05', rsi: 2.1 },
      { date: '2026-08-06', rsi: 2.2 },
    ],
  };

  const result = performanceKpis(neuro, '2026-08-06');
  assert.deepEqual(
    {
      rsi: [result.rsi.value, result.rsi.date],
      cmj: [result.cmj.value, result.cmj.date],
      sprint10m: [result.sprint10m.value, result.sprint10m.date],
    },
    {
      rsi: [2.2, '2026-08-06'],
      cmj: [38, '2026-08-03'],
      sprint10m: [1.95, '2026-08-03'],
    },
  );
  assert.equal(result.cmj.performanceDeltaPercent, -6.4);
  assert.equal(result.sprint10m.performanceDeltaPercent, -3.4);
});

test('reads nested dashboard history for the approved KPIs', () => {
  const neuro = {
    latest: {
      hist: {
        rsi: [{ date: '2026-08-05', value: '1.91' }],
        cmj: [{ date: '2026-08-01', height: 41.2 }],
        sprint: [{ date: '2026-08-04', time: 1.88 }],
      },
    },
  };

  const result = performanceKpis(neuro, '2026-08-06');
  assert.equal(result.rsi.value, 1.91);
  assert.equal(result.cmj.value, 41.2);
  assert.equal(result.sprint10m.value, 1.88);
});

test('excludes future tests and reports freshness by prescribed cadence', () => {
  const neuro = {
    history: [
      { date: '2026-07-27', cmj: 40 },
      { date: '2026-08-01', rsi: 2.0 },
      { date: '2026-08-07', rsi: 2.4, cmj: 44 },
    ],
  };

  const result = performanceKpis(neuro, '2026-08-06');
  assert.equal(result.rsi.value, 2.0);
  assert.equal(result.rsi.stale, true);
  assert.equal(result.cmj.value, 40);
  assert.equal(result.cmj.stale, true);
});

test('does not present an undated legacy scalar as fresh', () => {
  const result = performanceKpis({ latest: { rsi: 2.3, cmj: 43 } }, '2026-08-06');
  assert.equal(result.rsi.value, 2.3);
  assert.equal(result.rsi.date, null);
  assert.equal(result.rsi.stale, true);
});

test('does not leak a generic legacy CMJ history into the other KPIs', () => {
  const result = performanceKpis({ history: [
    { date: '2026-08-01', value: 40 },
    { date: '2026-08-05', value: 42 },
  ] }, '2026-08-06');

  assert.equal(result.cmj.value, 42);
  assert.equal(result.rsi.value, null);
  assert.equal(result.sprint10m.value, null);
});

test('prompt exposes dates, baselines and missing KPI data', () => {
  const { text } = formatPerformanceKpisForPrompt({ history: [
    { date: '2026-08-05', rsi: 2.1 },
  ] }, '2026-08-06');

  assert.match(text, /RSI: 2.1/);
  assert.match(text, /повторные вертикальные прыжки/);
  assert.match(text, /OVR JUMP.*после разминки/);
  assert.match(text, /с работой рук, 3 валидные попытки/);
  assert.match(text, /электронные ворота, одна валидная попытка/);
  assert.match(text, /последнее доступное значение каждого теста/);
  assert.doesNotMatch(text, /атакующ|attack jump/i);
});
