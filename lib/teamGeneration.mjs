// Resume a queued job after transient failures; never submit it a second time.
export async function pollTeamGeneration(batchId, {
  fetchStatus,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 80,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await wait(6000);
    let response, data;
    try {
      response = await fetchStatus(batchId);
      data = await response.json();
    } catch (_) {
      continue;
    }
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) continue;
      const error = new Error(data.error || 'Ошибка проверки статуса');
      error.restartRequired = response.status === 404 || data.status === 'failed';
      throw error;
    }
    if (data.status === 'failed') {
      const error = new Error(data.error || 'Не удалось создать программу');
      error.restartRequired = true;
      throw error;
    }
    // Manual-review and preliminary sessions are successful drafts too.
    if (data.status === 'done' && data.session) return data;
  }
  throw new Error('Генерация ещё не завершена. Нажмите «Повторить ошибки», чтобы продолжить ожидание.');
}
