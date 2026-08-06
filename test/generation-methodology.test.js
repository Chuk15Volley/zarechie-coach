const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = readFileSync(require.resolve('../pages/api/programs/generate.js'), 'utf8');

test('isometric generation uses a four-session RPE wave', () => {
  assert.match(source, /ВОЛНА ИЗОМЕТРИЧЕСКОГО МИКРОЦИКЛА/);
  assert.match(source, /СЕССИЯ \$\{slot\}\/4/);
  assert.match(source, /RPE ≥9 или боль → регрессировать/);
  assert.match(source, /объём основных блоков -25-30%/);
});

test('jump load uses personal observations instead of invented position thresholds', () => {
  assert.match(source, /Персональный .* baseline пока не сформирован/);
  assert.match(source, /медиана \$\{Math\.round\(median\)\} прыжков/);
  assert.doesNotMatch(source, /Центральный: норма|Диагональный: норма|Доигровщик:\s+норма/);
  assert.doesNotMatch(source, /RSI < 1\.5/);
});

