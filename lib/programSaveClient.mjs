// Retrying the same request id is safe even if the first response was lost.
export function programSaveError(data, status) {
  const details = [
    ...(data?.banned || []).map(name => `Запрещено: ${name}`),
    ...(data?.repeated || []).map(ex => `${ex.code ? ex.code + ' · ' : ''}${ex.name} — уже было ${ex.dates?.join(', ') || 'в недавней программе'}`),
  ];
  return [data?.error || `Не удалось сохранить программу (${status})`, ...details].join('\n');
}

export async function saveProgramRequest(payload, apiKey, {fetchImpl = globalThis.fetch, requestId = globalThis.crypto.randomUUID(), timeoutMs = 20000} = {}) {
  const body = JSON.stringify({...payload, saveRequestId:requestId});
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl('/api/programs/save', {
        method:'POST', headers:{'Content-Type':'application/json','x-api-key':apiKey}, body, signal:controller.signal,
      });
      let data;
      try { data = await res.json(); } catch {
        if (attempt === 0 && res.status >= 500) continue;
        throw new Error('Сервер не подтвердил сохранение. Правки остаются на экране; повторите сохранение.');
      }
      if (attempt === 0 && [502,503,504].includes(res.status)) continue;
      if (!res.ok && res.status !== 401) throw Object.assign(new Error(programSaveError(data,res.status)), {status:res.status});
      if (res.ok && (data?.status !== 'ok' || !data.session)) throw Object.assign(new Error('Сервер не подтвердил сохранение. Правки остаются на экране.'), {status:res.status});
      return {res,data};
    } catch (error) {
      if (attempt === 0 && !error.status && (error.name === 'AbortError' || error instanceof TypeError)) continue;
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Нет подтверждения от сервера. Проверьте соединение и повторите сохранение — правки остаются на экране.');
      throw error;
    } finally { clearTimeout(timer); }
  }
}
