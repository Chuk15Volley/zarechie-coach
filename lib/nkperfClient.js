// lib/nkperfClient.js
// Thin client for the NK Performance API (nk-performance.vercel.app).
// Credentials come from env vars — never hardcoded.

function base() { return process.env.NK_PERF_URL || 'https://nk-performance.vercel.app'; }
function key()  { return process.env.NK_PERF_API_KEY || ''; }

async function nkFetch(path) {
  try {
    const r = await fetch(`${base()}${path}`, {
      headers: { 'x-api-key': key() },
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function getNKRoster() {
  const d = await nkFetch('/api/players/roster');
  return Array.isArray(d?.players) ? d.players : [];
}

export async function getNKWhoopHistory(whoopId, days = 28) {
  const d = await nkFetch(`/api/whoop/history?whoopId=${whoopId}&days=${days}`);
  return Array.isArray(d?.data) ? d.data : [];
}

export async function getNKNeuroData() {
  const d = await nkFetch('/api/neuro/data');
  return d?.data && typeof d.data === 'object' ? d.data : {};
}

export async function getNKMorningSurvey(whoopId, date) {
  const d = await nkFetch(`/api/survey/morning-get?playerId=${whoopId}&date=${date}`);
  return d?.survey || d || null;
}

export async function getNKSurveyHistory(whoopId) {
  const d = await nkFetch(`/api/survey/history?whoopId=${whoopId}`);
  return Array.isArray(d?.data) ? d.data : [];
}
