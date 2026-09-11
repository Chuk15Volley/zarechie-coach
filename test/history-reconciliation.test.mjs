import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileHistoryValue } from '../lib/historyReconciliation.mjs';
const entry = (value, key = 'coach:exweight:1:test', type = 'hash') => ({ key, type, value });
test('dated weight metadata advances from July but never overwrites newer coach data', () => {
  const latest = entry({ date: '2026-09-04', kg: '50' });
  assert.deepEqual(reconcileHistoryValue(latest, null, entry({ date: '2026-07-17', kg: '20' })), latest.value);
  assert.equal(reconcileHistoryValue(latest, null, entry({ date: '2026-09-10', kg: '60' })), null);
});
test('same-day corrections require an exact match to the earlier archive', () => {
  const earlier = entry({ date: '2026-09-04', kg: '20' });
  const latest = entry({ date: '2026-09-04', kg: '25' });
  assert.deepEqual(reconcileHistoryValue(latest, earlier, earlier), latest.value);
  assert.equal(reconcileHistoryValue(latest, earlier, entry({ date: '2026-09-04', kg: '30' })), null);
});
test('three-way historical hash corrections preserve live edits and newer dates', () => {
  const key = 'coach:exhist:1:test';
  assert.deepEqual(reconcileHistoryValue(entry({ '2026-09-04': '25', '2026-09-03': '15' }, key), entry({ '2026-09-04': '20' }, key), entry({ '2026-09-04': '20', '2026-09-10': '40' }, key)), { '2026-09-04': '25', '2026-09-03': '15', '2026-09-10': '40' });
});
