export const COURSE_ID = 'low-back-resilience';
// These are coach-editable application defaults, not prescriptions from the PDF.
export const DEFAULT_RESTS = Object.freeze({ A: 20, B: 60, C: 15, roundA: 30, roundB: 90, roundC: 30, block: 60, side: 15 });
export const PREVENTION_WARNING = 'Курс назначает тренер с учётом жалоб и ограничений ReadySix. Врачебные противопоказания обязательны. Болезненные движения не выполняйте; обратитесь к тренеру. Автор рекомендует медицинский допуск перед началом курса.';
export function preventionError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function validateScope(workspace, playerId) {
  if (!['zarechie', 'nkperf'].includes(workspace)) throw preventionError('Некорректное пространство.');
  if (typeof playerId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(playerId)) throw preventionError('Некорректный игрок.');
}
export function validateId(id) { if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw preventionError('Некорректный идентификатор.'); return id; }
const text = (value, max, label, allowEmpty = true) => {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\u0000-\u0008]/.test(value)) throw preventionError(`Некорректное поле: ${label}.`);
  return value.trim();
};
export function safeVideo(value) {
  if (value === '') return '';
  const raw = text(value, 600, 'видео');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || !['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com', 'vimeo.com', 'www.vimeo.com'].includes(url.hostname)) throw new Error();
    return url.href;
  } catch { throw preventionError('Для видео укажите HTTPS-ссылку YouTube или Vimeo.'); }
}
export function normalizeRests(input = DEFAULT_RESTS) {
  return Object.fromEntries(Object.keys(DEFAULT_RESTS).map(key => {
    const value = input[key];
    if (!Number.isInteger(value) || value < 0 || value > 300) throw preventionError('Паузы должны быть от 0 до 300 секунд.');
    return [key, value];
  }));
}
export function normalizeExercisePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw preventionError('Некорректная правка упражнения.');
  const patch = {};
  if (Object.hasOwn(input, 'name')) patch.name = text(input.name, 180, 'название', false);
  if (Object.hasOwn(input, 'video')) patch.video = safeVideo(input.video);
  if (Object.hasOwn(input, 'note')) patch.note = text(input.note, 1600, 'подсказка');
  return patch;
}
export function buildCourse(source, catalogue = { revision: 0, exercises: {}, rests: DEFAULT_RESTS }) {
  return { id: COURSE_ID, title: 'Low Back Resilience', region: 'Поясница', author: 'E3 Rehab', sourceTitle: 'Low Back Resilience.pdf', sourceRevision: 1,
    revision: catalogue.revision || 0, warning: PREVENTION_WARNING, rests: normalizeRests(catalogue.rests || DEFAULT_RESTS),
    sessions: source.map((session, index) => ({ index, phase: session.phase, phaseSession: (session.week - 1) * 3 + session.day, sourcePage: session.page, sourceWeek: session.week, sourceDay: session.day,
      exercises: session.exercises.map(ex => ({ ...ex, originalName: ex.name, ...(catalogue.exercises?.[ex.sourceId] || {}) })) })),
  };
}
export function assignmentOptions(input) {
  if (!['course', 'phase'].includes(input.scope)) throw preventionError('Выберите курс или фазу.');
  const phase = input.scope === 'course' ? null : input.phase;
  if (input.scope === 'phase' && (!Number.isInteger(phase) || phase < 1 || phase > 4)) throw preventionError('Выберите фазу от 1 до 4.');
  if (typeof input.stretch !== 'boolean') throw preventionError('Укажите наличие растяжки.');
  if (!Number.isInteger(input.mainSets) || input.mainSets < 2 || input.mainSets > 4) throw preventionError('Основной блок: от 2 до 4 подходов.');
  if (!Number.isInteger(input.stretchSets) || input.stretchSets < 2 || input.stretchSets > 3) throw preventionError('Растяжка: от 2 до 3 подходов.');
  if (input.reviewed !== true) throw preventionError('Проверьте курс и ограничения игрока перед назначением.');
  return { scope: input.scope, phase, stretch: input.stretch, mainSets: input.mainSets, stretchSets: input.stretchSets, note: text(input.note || '', 1600, 'комментарий'), rests: normalizeRests(input.rests) };
}
export function createAssignment(course, input, { id, now = new Date().toISOString(), actor = null } = {}) {
  validateId(id); const options = assignmentOptions(input);
  const sessions = course.sessions.filter(s => options.scope === 'course' || s.phase === options.phase).map(s => ({ ...structuredClone(s),
    exercises: s.exercises.filter(e => options.stretch || e.code[0] !== 'C').map(e => ({ ...e, setCount: e.code[0] === 'A' ? 2 : e.code[0] === 'B' ? options.mainSets : options.stretchSets })),
  }));
  return { id, courseId: course.id, title: course.title, warning: course.warning, catalogueRevision: course.revision, options, sessions, cursor: 0, progress: {}, history: [], receipts: [], status: 'active', revision: 1, createdAt: now, updatedAt: now, actor };
}
export const currentSession = assignment => assignment?.status === 'active' ? assignment.sessions[assignment.cursor] || null : null;
export function orderedSets(session) {
  return ['A', 'B', 'C'].flatMap(block => {
    const es = (session?.exercises || []).filter(e => e.code[0] === block), rounds = Math.max(0, ...es.map(e => e.setCount));
    return Array.from({ length: rounds }, (_, round) => es.filter(e => round < e.setCount).map(e => ({ key: `${e.code}:${round}`, round, block, exercise: e }))).flat();
  });
}
export function nextRest(assignment, completedKey) {
  const session = currentSession(assignment), order = orderedSets(session), index = order.findIndex(row => row.key === completedKey), from = order[index], to = order[index + 1];
  if (!from || !to) return null;
  const rests = assignment.options.rests;
  if (to.block !== from.block) return { seconds: rests.block, kind: 'Между блоками', next: to.exercise.name };
  if (to.round !== from.round) return { seconds: rests['round' + from.block], kind: 'Между кругами', next: to.exercise.name };
  return { seconds: rests[from.block], kind: 'Между упражнениями', next: to.exercise.name };
}
export function progressCounts(assignment) {
  const order = orderedSets(currentSession(assignment));
  return { total: order.length, done: order.filter(row => assignment.progress[row.key] === true).length };
}
export function applyAssignmentCommand(previous, command, { now = new Date().toISOString() } = {}) {
  validateId(command.requestId);
  const signature = JSON.stringify({ action: command.action, sessionIndex: command.sessionIndex, key: command.key, done: command.done });
  const receipt = previous.receipts?.find(row => row.id === command.requestId);
  if (receipt) { if (receipt.signature !== signature) throw preventionError('Этот запрос уже использован для другой операции.', 409); return { assignment: previous, replay: true }; }
  if (command.expectedRevision !== previous.revision) throw preventionError('Прогресс изменился на другом устройстве. Обновите раздел.', 409);
  const next = structuredClone(previous), session = currentSession(next);
  if (!session || command.sessionIndex !== next.cursor) throw preventionError('Это занятие уже закрыто или больше не активно.', 409);
  if (command.action === 'mark') {
    if (!orderedSets(session).some(row => row.key === command.key) || typeof command.done !== 'boolean') throw preventionError('Некорректный подход.');
    next.progress[command.key] = command.done;
  } else if (command.action === 'complete') {
    const count = progressCounts(next);
    if (!count.total || count.done !== count.total) throw preventionError('Сначала отметьте все подходы. Частичное выполнение не продвигает курс.', 409);
    next.history.push({ index: next.cursor, completedAt: now, progress: next.progress }); next.cursor += 1; next.progress = {};
    if (next.cursor === next.sessions.length) { next.status = 'completed'; next.completedAt = now; }
  } else throw preventionError('Неизвестная операция.');
  next.revision += 1; next.updatedAt = now;
  next.receipts = [...(next.receipts || []), { id: command.requestId, signature }].slice(-64);
  return { assignment: next, replay: false };
}
export function refreshFutureSessions(assignment, course) {
  const fresh = createAssignment(course, { ...assignment.options, reviewed: true }, { id: assignment.id });
  const next = structuredClone(assignment);
  // The current partially executed session and every completed session keep their edition.
  const start = assignment.cursor + (progressCounts(assignment).done ? 1 : 0);
  for (let i = start; i < next.sessions.length; i += 1) next.sessions[i] = fresh.sessions[i];
  next.catalogueRevision = course.revision; next.revision += 1; next.updatedAt = new Date().toISOString();
  return next;
}
export function assignmentSummary(a) { return { id: a.id, title: a.title, status: a.status, cursor: a.cursor, total: a.sessions.length, revision: a.revision, createdAt: a.createdAt, completedAt: a.completedAt || null, catalogueRevision: a.catalogueRevision, options: a.options }; }
