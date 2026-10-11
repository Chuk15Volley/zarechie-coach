import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { needsLoadEntry, repetitionInput, setCompletionIssue, validActualWeight, weightChangeSummary } from '../lib/playerGym.mjs';
import { blockIsComplete, nextIncompleteBlock, nextWorkoutSet, restAfterWorkoutSet } from '../lib/playerWorkout.mjs';

const ex = { name: 'DB Row', code: 'A1', weightKg: 16, targetSets: ['12', '12'] };
const session = { blocks: [{ label: 'A', exercises: [ex] }, { label: 'B', exercises: [{ name: 'Breathing', targetSets: ['5'] }] }] };
const source = readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('  function toggleSet('), source.indexOf('  function undoLastSet('));
function runCompletion(weight, { unmark = false, overrides = {} } = {}) {
 const done = { '0-0-0': true, ...(unmark ? { '0-0-1': true } : {}) }, calls = [];
 const noop = () => {};
 const bindings = { done, weights: { '0-0-1': weight }, repetitions: {}, setCompletionIssue, repetitionInput,
   setResultIssue: value => calls.push(['issue', value]), setResultSet: noop,
   holdTimer: { hold: null, cancel: noop }, completedAt: null,
   setCelebration: value => calls.push(['celebration', value]), setCompletedAt: noop, setFinishReason: noop, changeReps: noop,
   setDone: fn => calls.push(['done', fn(done)]), setSetUpdatedAt: noop, setLastActionAt: noop,
   setProgressRevision: noop, setRestTimer: value => calls.push(['rest', value]), setRestUntil: value => calls.push(['deadline', value]), setUndoSet: noop,
   setActiveBlock: value => calls.push(['block', value]), navigator: {},
   undoTimer: { current: null }, clearTimeout: noop, setTimeout: noop,
   totalSets: 3, restAfterWorkoutSet, nextWorkoutSet, session, skipped: {},
   blockIsComplete, nextIncompleteBlock, blockRefs: { current: [] }, ...overrides,
 };
 const toggle = new Function(...Object.keys(bindings), `${body}; return toggleSet;`)(...Object.values(bindings));
 const result = toggle('0-0-1', { bi: 0, ei: 0, si: 1, ex, block: bindings.session.blocks[0] });
 return { calls, result };
}
test('last set of a block cannot complete or navigate on a missing, empty, or invalid actual weight', () => {
 for (const weight of [undefined, '', ' ', 'NaN', '-1', '1000', '1e2']) {
  const { calls, result } = runCompletion(weight);
  assert.equal(result, false);
  assert.equal(calls.some(([type]) => type === 'done' || type === 'block'), false);
  assert.match(calls[0][1], /фактический вес/);
 }
});
test('explicit actual weight commits the last set before moving to the next block', () => {
 for (const weight of ['16', '14,5', '0']) {
  const { calls } = runCompletion(weight);
  assert.equal(calls.find(([type]) => type === 'done')[1]['0-0-1'], true);
  assert.equal(calls.find(([type]) => type === 'block')[1], 1);
  assert.ok(calls.findIndex(([type]) => type === 'done') < calls.findIndex(([type]) => type === 'block'));
 }
});
test('undo remains possible even for legacy results without weight', () => {
 const { calls } = runCompletion(undefined, { unmark: true });
 assert.equal(calls.find(([type]) => type === 'done')[1]['0-0-1'], false);
 assert.equal(calls.find(([type]) => type === 'block')[1], 0);
});
test('bodyweight and timed sets are validated without inventing load', () => {
 assert.equal(setCompletionIssue({ name: 'Plank', weightNote: 'Без дополнительного веса' }, '30 sec', undefined), '');
 assert.notEqual(setCompletionIssue(ex, '12', '16', ''), '');
 assert.equal(validActualWeight('2,5'), 2.5);
});
test('current set respects selected block and circuit order', () => {
 assert.equal(nextWorkoutSet(session, {}, {}, 1).bi, 1);
 const circuit = { blocks: [{ rest_note: 'между упражнениями', exercises: [ex, ex] }] };
 assert.equal(nextWorkoutSet(circuit, { '0-0-0': true }, {}, 0).ei, 1);
});
test('completion summary includes only completed changed weights, including zero', () => {
 const result = weightChangeSummary(session, { '0-0-0': true }, { '0-0-0': '0', '0-0-1': '10' });
 assert.deepEqual(result[0].actual, [0]); assert.equal(result[0].count, 1);
 assert.deepEqual(weightChangeSummary(session, { '0-0-0': true }, { '0-0-0': '16' }), []);
});

test('full live completion celebrates once, while partial or skipped completion does not', () => {
 const full = runCompletion('16', {overrides:{session:{blocks:[session.blocks[0]]},totalSets:2}});
 assert.equal(full.calls.filter(([type])=>type==='celebration').length,1);
 assert.ok(full.calls.find(([type])=>type==='celebration')[1]);
 assert.equal(runCompletion('16').calls.some(([type])=>type==='celebration'),false);
 const skipped = runCompletion('16', {overrides:{skipped:{'1-0':'Нет оборудования'}}});
 assert.equal(skipped.calls.some(([type])=>type==='celebration'),false);
 assert.equal(skipped.calls.find(([type])=>type==='rest')[1],null);
 assert.equal(skipped.calls.find(([type])=>type==='deadline')[1],null);
});
test('zero-second transitions move to the next block without opening a timer', () => {
 const block={...session.blocks[0],transitionRestSeconds:0};
 const result=runCompletion('16',{overrides:{session:{blocks:[block,session.blocks[1]]}}});
 assert.equal(result.calls.find(([type])=>type==='rest')[1],null);
 assert.equal(result.calls.find(([type])=>type==='deadline')[1],null);
 assert.equal(result.calls.find(([type])=>type==='block')[1],1);
});

test('manually recording a later block keeps the next-set label aligned with its timer',()=>{
 const later={label:'B',exerciseOrder:'circuit',rest_note:'15 сек между упражнениями; 120 сек после круга',exercises:[{...ex,code:'B1',targetSets:['12','12','12']},{name:'Push-Up',code:'B2',targetSets:['5','5','5']}]};
 const {calls}=runCompletion('16',{overrides:{session:{blocks:[session.blocks[0],later]},totalSets:8,restAfterWorkoutSet:(s,d,k,c)=>restAfterWorkoutSet(s,{'1-0-0':true,'1-0-1':true},{},{...c,block:later,bi:1,ei:0,si:1,ex:later.exercises[0]})}});
 assert.equal(calls.find(([type])=>type==='block')[1],1);
 assert.equal(calls.find(([type])=>type==='rest')[1].kind,'exercise');
});
