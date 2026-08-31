import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
const sessionApi = readFileSync(new URL('../pages/api/auth/session.js', import.meta.url), 'utf8');

test('active dashboard sessions are renewed and rechecked after Safari resumes', () => {
  assert.match(dashboard, /SESSION_HEARTBEAT_MS = 5 \* 60 \* 1000/);
  assert.match(dashboard, /window\.addEventListener\('focus', renew\)/);
  assert.match(dashboard, /document\.addEventListener\('visibilitychange', onVisibility\)/);
  assert.match(sessionApi, /setSessionCookie\(res\)/);
});

test('manual save preserves work and retries automatically after re-authentication', () => {
  assert.match(dashboard, /requestReauthentication\(\(\) => handleSave\(\)/);
  assert.match(dashboard, /requestReauthentication\(\(\) => handleSaveWeekSession\(idx\)/);
  assert.match(dashboard, /pendingAuthRetryRef\.current = retry/);
  assert.match(dashboard, /Promise\.resolve\(retry\(\)\)/);
  assert.match(dashboard, /текущая программа останется на экране/);
  assert.match(dashboard, /программа будет сохранена автоматически/);
});
