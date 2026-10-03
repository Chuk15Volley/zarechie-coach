import { ProxyAgent, fetch as gatewayFetch } from 'undici';
const hosts = new Set(['api.openai.com', 'api.telegram.org']);
function failure() { return Object.assign(new Error('GYM_PROVIDER_UNAVAILABLE'), { code: 'GYM_PROVIDER_UNAVAILABLE', status: 503 }); }
export function createGymProviderFetch({ env = process.env, directFetch = (...args) => globalThis.fetch(...args), proxyFetch = gatewayFetch,
  createAgent = uri => new ProxyAgent({ uri, requestTls: { rejectUnauthorized: true }, connectTimeout: 10000, headersTimeout: 300000, bodyTimeout: 300000 }) } = {}) {
  let agent;
  return async function fetchProvider(input, init = {}) {
    if (!env.GYM_DEPLOYMENT_ENV && !env.GYM_PROVIDER_EGRESS_MODE && !env.GYM_PROVIDER_EGRESS_PROXY) return directFetch(input, init);
    if (env.GYM_DEPLOYMENT_ENV !== 'ru-self-hosted' || env.GYM_DEPLOYMENT_REGION !== 'ru'
      || env.GYM_STORAGE_BOUNDARY !== 'readysix-gym-ru-production'
      || env.GYM_PROVIDER_EGRESS_MODE !== 'restricted-gateway'
      || env.GYM_PROVIDER_EGRESS_PROXY !== 'http://provider-egress:3128') throw failure();
    let url;try { url = new URL(input); } catch { throw failure(); }
    if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password || url.hash || init.dispatcher || init.agent) throw failure();
    const headers = new Headers(init.headers);
    if (['host','proxy-authorization','connection','upgrade'].some(name => headers.has(name))) throw failure();
    agent ||= createAgent(env.GYM_PROVIDER_EGRESS_PROXY);
    try { return await proxyFetch(url, { ...init, headers, dispatcher: agent, redirect: 'error' }); }
    catch { const error = failure();if (init.signal?.aborted) error.name = init.signal.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError';throw error; }
  };
}
export const gymProviderFetch = createGymProviderFetch();
