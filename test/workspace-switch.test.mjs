import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

test('workspace switch keeps team schedule disabled without removed state', async () => {
  const source = await readFile(new URL('pages/index.js', ROOT), 'utf8');

  assert.doesNotMatch(
    source,
    /setAutoFocusNote\s*\(/,
    'The removed auto-focus setter crashes the client when NK Performance is selected',
  );
  assert.match(
    source,
    /if \(!usesSeasonCalendar\(workspace\)\) \{\s*setScheduleEvents\(\[\]\);\s*setShowSchedule\(false\);\s*return \(\) => \{ cancelled = true; \};/,
    'NK Performance must clear any stale team calendar state',
  );
  assert.match(source, /fetch\(`\/api\/schedule\?workspace=\$\{workspace\}`/);
});

test('workspace requests ignore stale responses after a team switch', async () => {
  const source = await readFile(new URL('pages/index.js', ROOT), 'utf8');

  assert.match(source, /loadNKPlayers\(false, \(\) => !cancelled\)/);
  assert.match(source, /if \(cancelled\) return;\s*setPlayers\(list\);/);
  assert.match(source, /if \(!cancelled && Array\.isArray\(data\.events\)\) setScheduleEvents/);
});
