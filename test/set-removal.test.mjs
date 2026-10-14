import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

test('coach can remove an individual set while every exercise keeps at least one set', async () => {
  const source = await readFile(new URL('pages/index.js', ROOT), 'utf8');
  const editor = await readFile(new URL('components/PlannedLoadEditor.js', ROOT), 'utf8');

  assert.match(editor, /aria-label=\{`Удалить подход \$\{index\+1\}`\}/);
  assert.match(editor, /sets\.length>1 &&/);
  assert.match(source, /if\(sets\.length>1\)updateExercise/);
  assert.match(source, /targetSets:sets\.filter\(\(_,i\)=>i!==si\)/);
  assert.match(source, /onRemoveSet=\{si => removeSetRow\(bi, ei, si\)\}/);
});
