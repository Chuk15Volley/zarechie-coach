const READY_SIX_SCHEMA = 'readysix.program-generator-context';
const READY_SIX_SCHEMA_VERSION = 1;

const WORKSPACES = Object.freeze({
  zarechie: Object.freeze({
    organizationId: 'zarechie-odintsovo',
    keyEnv: 'READYSIX_ZARECHIE_API_KEY',
    modeEnv: 'READYSIX_ZARECHIE_MODE',
  }),
  nkperf: Object.freeze({
    organizationId: 'nk-performance',
    keyEnv: 'READYSIX_NK_API_KEY',
    modeEnv: 'READYSIX_NK_MODE',
  }),
});

export class ReadySixIntegrationError extends Error {
  constructor(message, code, status = 502) {
    super(message);
    this.name = 'ReadySixIntegrationError';
    this.code = code;
    this.status = status;
  }
}

function workspaceConfig(workspace) {
  const normalized = workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  return { workspace: normalized, ...WORKSPACES[normalized] };
}

export function readySixIntegrationMode(workspace, environment = process.env) {
  const config = workspaceConfig(workspace);
  const mode = String(environment[config.modeEnv] || environment.READYSIX_INTEGRATION_MODE || 'legacy').trim().toLowerCase();
  return ['legacy', 'primary'].includes(mode) ? mode : 'legacy';
}

export function usesReadySix(workspace, environment = process.env) {
  return readySixIntegrationMode(workspace, environment) === 'primary';
}

function integrationConfig(workspace, environment = process.env) {
  const config = workspaceConfig(workspace);
  const baseUrl = String(environment.READYSIX_URL || '').trim().replace(/\/$/, '');
  const apiKey = String(environment[config.keyEnv] || '').trim();
  if (!baseUrl || !apiKey) {
    throw new ReadySixIntegrationError(
      `ReadySix primary mode is not configured for ${config.workspace}`,
      'READYSIX_CONFIGURATION_MISSING',
      503,
    );
  }
  let parsed;
  try { parsed = new URL(baseUrl); } catch {
    throw new ReadySixIntegrationError('READYSIX_URL is invalid', 'READYSIX_URL_INVALID', 503);
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new ReadySixIntegrationError('READYSIX_URL protocol is invalid', 'READYSIX_URL_INVALID', 503);
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new ReadySixIntegrationError('ReadySix requires HTTPS in production', 'READYSIX_HTTPS_REQUIRED', 503);
  }
  return { ...config, baseUrl: parsed.origin + parsed.pathname.replace(/\/$/, ''), apiKey };
}

function validatePayload(payload, config, expectedMode) {
  if (
    !payload
    || payload.schema !== READY_SIX_SCHEMA
    || payload.schemaVersion !== READY_SIX_SCHEMA_VERSION
    || payload.organizationId !== config.organizationId
    || payload.mode !== expectedMode
  ) {
    throw new ReadySixIntegrationError('ReadySix returned an incompatible or cross-organization payload', 'READYSIX_CONTRACT_MISMATCH');
  }
  return payload;
}

async function readySixFetch(workspace, params, expectedMode, options = {}) {
  const config = integrationConfig(workspace, options.environment);
  const url = new URL('/api/integrations/program-generator', config.baseUrl);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 15000);
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: 'GET',
      headers: { 'x-api-key': config.apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ReadySixIntegrationError(
        response.status === 404 ? 'ReadySix player was not found' : 'ReadySix request failed',
        response.status === 404 ? 'READYSIX_PLAYER_NOT_FOUND' : 'READYSIX_REQUEST_FAILED',
        response.status,
      );
    }
    return validatePayload(payload, config, expectedMode);
  } catch (error) {
    if (error instanceof ReadySixIntegrationError) throw error;
    const code = error?.name === 'AbortError' ? 'READYSIX_TIMEOUT' : 'READYSIX_UNAVAILABLE';
    throw new ReadySixIntegrationError('ReadySix is unavailable', code, 503);
  } finally {
    clearTimeout(timeout);
  }
}

export function getReadySixRoster(workspace, date, options = {}) {
  return readySixFetch(workspace, { date }, 'roster', options);
}

export function getReadySixPlayerContext(workspace, playerId, date, historyDays = 28, options = {}) {
  return readySixFetch(workspace, { playerId, date, historyDays }, 'player-context', options);
}

export function getReadySixTeamReadiness(workspace, date, options = {}) {
  return readySixFetch(workspace, { date, view: 'readiness' }, 'team-readiness', options);
}
