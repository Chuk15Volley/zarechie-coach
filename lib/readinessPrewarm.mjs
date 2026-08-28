function productionBaseUrl(env = process.env) {
  const host = String(env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || '').trim();
  if (!host) return null;
  try {
    const url = new URL(host.startsWith('http') ? host : `https://${host}`);
    return url.protocol === 'https:' ? url.origin : null;
  } catch (_) {
    return null;
  }
}

export async function prewarmTeamReadiness(workspace, options = {}) {
  const normalizedWorkspace = workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const date = options.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const baseUrl = options.baseUrl || productionBaseUrl(options.env);
  const trainerKey = String(options.trainerKey || options.env?.TRAINER_API_KEY || process.env.TRAINER_API_KEY || '');
  if (!baseUrl || !trainerKey) return { workspace: normalizedWorkspace, ok: false, reason: 'prewarm_not_configured' };
  const started = Date.now();
  const response = await (options.fetchImpl || fetch)(`${baseUrl}/api/team/readiness?date=${date}&workspace=${normalizedWorkspace}`, {
    headers: { 'x-api-key': trainerKey, 'x-readiness-prewarm': '1' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Readiness prewarm failed with status ${response.status}`);
  const payload = await response.json();
  return {
    workspace: normalizedWorkspace,
    ok: true,
    cache: payload.cache || response.headers.get('x-readiness-cache') || 'unknown',
    players: Array.isArray(payload.players) ? payload.players.length : 0,
    durationMs: Date.now() - started,
  };
}

export function readinessPrewarmBaseUrl(env = process.env) {
  return productionBaseUrl(env);
}
