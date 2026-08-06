// Output tokens in the Responses API include reasoning tokens. Structured
// sessions with 9-13 exercises need enough headroom for both reasoning and the
// complete build_session arguments.
export const SESSION_OUTPUT_TOKENS = 12000;
export const SESSION_RETRY_OUTPUT_TOKENS = 18000;

export function isOutputTokenLimit(response) {
  return response?.status === 'incomplete'
    && response?.incomplete_details?.reason === 'max_output_tokens';
}

export function sessionResponseFailureMessage(response) {
  if (isOutputTokenLimit(response)) {
    return 'Модель не успела завершить структуру тренировки. Система автоматически увеличила лимит, но ответ снова оказался неполным. Повторите генерацию.';
  }
  return response?.error?.message
    || response?.last_error?.message
    || 'Сервис генерации завершил запрос без готовой тренировки. Повторите попытку.';
}
