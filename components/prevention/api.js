export async function preventionCall(path, { body, apiKey, signal } = {}) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: signal || AbortSignal.timeout(25000), headers: { ...(apiKey ? { 'x-api-key': apiKey } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Не удалось выполнить запрос. Повторите попытку.'), { status: response.status });
  return data;
}
export const newRequestId = () => crypto.randomUUID();
