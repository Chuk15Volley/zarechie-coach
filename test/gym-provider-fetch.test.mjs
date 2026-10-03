import test from 'node:test';import assert from 'node:assert/strict';
import { createGymProviderFetch } from '../lib/gymProviderFetch.mjs';
const env = { GYM_DEPLOYMENT_ENV: 'ru-self-hosted', GYM_DEPLOYMENT_REGION: 'ru', GYM_STORAGE_BOUNDARY: 'readysix-gym-ru-production',
  GYM_PROVIDER_EGRESS_MODE: 'restricted-gateway', GYM_PROVIDER_EGRESS_PROXY: 'http://provider-egress:3128' };
test('Russian provider calls use only the fixed HTTPS CONNECT gateway without redirects', async () => {
  const agent = {}, calls = [];let direct = 0;
  const fetch = createGymProviderFetch({ env, directFetch: () => { direct++; }, createAgent: () => agent, proxyFetch: async (url, options) => { calls.push({url,options});return {status:401}; } });
  assert.equal((await fetch('https://api.openai.com/v1/responses')).status,401);
  assert.equal((await fetch('https://api.telegram.org/botsynthetic/getMe')).status,401);
  assert.equal(direct,0);assert.ok(calls.every(call=>call.options.dispatcher===agent&&call.options.redirect==='error'));
});
test('foreign destinations and malformed Russian configuration fail before any request', async () => {
  let calls = 0;const proxyFetch = () => { calls++; }, createAgent = () => ({});
  const fetch = createGymProviderFetch({env,proxyFetch,createAgent});
  for (const url of ['http://api.openai.com/x','https://example.com/x','https://127.0.0.1/x','https://api.openai.com:444/x','https://user@api.openai.com/x']) await assert.rejects(fetch(url),/GYM_PROVIDER_UNAVAILABLE/);
  await assert.rejects(fetch('https://api.openai.com/x',{headers:{'proxy-authorization':'synthetic'}}),/GYM_PROVIDER_UNAVAILABLE/);
  await assert.rejects(createGymProviderFetch({env:{...env,GYM_PROVIDER_EGRESS_MODE:''},proxyFetch,createAgent})('https://api.openai.com/x'),/GYM_PROVIDER_UNAVAILABLE/);
  assert.equal(calls,0);
});
test('gateway failures do not retry directly or expose credential-bearing errors', async () => {
  let direct = 0;const fetch = createGymProviderFetch({env,createAgent:()=>({}),directFetch:()=>{direct++;},proxyFetch:()=>{throw new Error('synthetic-private-token');}});
  await assert.rejects(fetch('https://api.telegram.org/botsynthetic/getMe'),error=>error.message==='GYM_PROVIDER_UNAVAILABLE'&&!error.cause);
  assert.equal(direct,0);
});
