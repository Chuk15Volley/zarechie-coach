import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

test('coach can remove an individual set while every exercise keeps at least one set', async () => {
  const source = await readFile(new URL('pages/index.js', ROOT), 'utf8');

  assert.match(source, /aria-label=\{`Удалить подход \$\{i \+ 1\}`\}/);
  assert.match(source, /targetSets\.length > 1 && onRemoveSet/);
  assert.match(source, /if \(targetSets\.length <= 1\) return ex/);
  assert.match(source, /targetSets: targetSets\.filter\(\(_, si\) => si !== setIdx\)/);
  assert.match(source, /onRemoveSet=\{si => removeSetRow\(bi, ei, si\)\}/);
});
