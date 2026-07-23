// Read-only adapter for the storage used by the main Zarechie dashboard.
// The coach app keeps its own programs and exercise library in its existing KV;
// monitoring data must come from the dashboard's current source of truth.

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const token = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && token ? { url, token } : null;
}

async function rpc(functionName, payload) {
  const settings = config();
  if (!settings) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${settings.url}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: settings.token,
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Dashboard storage ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function hasZarechieDashboardStore() {
  return !!config();
}

export async function dashboardRedis(command, ...args) {
  return rpc('app_kv_command', {
    p_command: String(command || '').toUpperCase(),
    p_args: args,
  });
}

export async function dashboardRedisPipeline(commands) {
  const list = (commands || []).filter(command => Array.isArray(command) && command.length);
  if (!list.length) return [];
  return rpc('app_kv_pipeline', {
    p_commands: list.map(command => [String(command[0]).toUpperCase(), ...command.slice(1)]),
  });
}
