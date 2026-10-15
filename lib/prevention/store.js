import crypto from 'node:crypto';
import { courseDefinition, registeredCourse } from './catalogue.mjs';
import { redis, redisPipeline } from '../redis';
import { pfx } from '../workspacePrefix';
import { workspaceRoster, gymIdentityAliases } from '../workspaceRoster';
import { getPlayerSnapshot } from '../playerData';
import { readySixGymState } from '../readySixGym.mjs';
import { medicalHoldReason } from '../medicalHold.mjs';
import { hasRestriction, isCoachBannedExercise } from '../exerciseRestrictions';
import { COURSE_ID, createAssignment, assignmentSummary, validateScope, validateId, normalizeExercisePatch, normalizeRests, preventionError, applyAssignmentCommand, refreshFutureSessions, currentSession } from './model.mjs';

const parse = raw => { if (raw === null || raw === undefined) return null; try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw preventionError('Запись профилактики повреждена. Обратитесь к администратору.', 503); } };
const catalogueKey = (workspace, courseId = COURSE_ID) => `${pfx(workspace)}:prevention:catalogue:v1${courseId === COURSE_ID ? '' : ':' + courseId}`;
const assignmentKey = (workspace, playerId, id) => `${pfx(workspace)}:prevention:player:${playerId}:assignment:${id}`;
const summaryKey = (workspace, playerId, id) => `${assignmentKey(workspace, playerId, id)}:summary`;
const indexKey = (workspace, playerId) => `${pfx(workspace)}:prevention:player:${playerId}:assignments`;
const CAS = `if (redis.call('GET',KEYS[1]) or '') ~= ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2]) return 1`;
const ASSIGNMENT_CAS = `
if (redis.call('GET',KEYS[1]) or '') ~= ARGV[1] then return 0 end
if ARGV[1] == '' and redis.call('ZCARD',KEYS[3]) >= 100 then return -1 end
redis.call('SET',KEYS[1],ARGV[2]); redis.call('SET',KEYS[2],ARGV[3]);
redis.call('ZADD',KEYS[3],ARGV[4],ARGV[5]); return 1`;
export async function preventionIdentity(workspace, id, { rosterCheck = true } = {}) {
  validateScope(workspace, String(id || ''));
  let originalId = id;
  if (rosterCheck) {
    const { players } = await workspaceRoster(workspace);
    const member = players.find(p => [p.id, p.readySixPlayerId, p.whoopUserId].filter(v => v != null).flatMap(v => gymIdentityAliases(String(v))).includes(id));
    if (!member) throw preventionError('Игрок не найден в этом пространстве.', 404);
    originalId = String(member.id);
  }
  return { workspace, originalId, playerId: String(originalId).replace(/^whoop_(?=\d+$)/, '') };
}
export async function loadCourse(workspace, courseId = COURSE_ID) {
  if (!['zarechie', 'nkperf'].includes(workspace)) throw preventionError('Некорректное пространство.');
  courseDefinition(courseId);
  const raw = await redis('get', catalogueKey(workspace, courseId)), catalogue = parse(raw) || { revision: 0, exercises: {} };
  return { raw, catalogue, course: registeredCourse(courseId, catalogue) };
}
export async function saveCourse(workspace, input, actor) {
  const { raw, catalogue, course } = await loadCourse(workspace, input.courseId);
  if (input.expectedRevision !== course.revision) throw preventionError('Библиотека изменена в другом окне. Обновите раздел.', 409);
  const next = { ...catalogue, exercises: { ...catalogue.exercises }, revision: course.revision + 1, updatedAt: new Date().toISOString(), actor };
  if (input.sourceId) {
    if (!course.sessions.some(s => s.exercises.some(e => e.sourceId === input.sourceId))) throw preventionError('Упражнение не найдено.', 404);
    const patch = normalizeExercisePatch(input.patch);
    if (patch.name && isCoachBannedExercise(patch.name)) throw preventionError('Это упражнение запрещено тренером.');
    next.exercises[input.sourceId] = { ...(next.exercises[input.sourceId] || {}), ...patch };
  } else if (input.rests) next.rests = normalizeRests(input.rests, course.defaultRests);
  else throw preventionError('Нет правок для сохранения.');
  const [saved] = await redisPipeline([['EVAL', CAS, 1, catalogueKey(workspace, course.id), raw || '', JSON.stringify(next)]]);
  if (Number(saved) !== 1) throw preventionError('Библиотека изменилась. Обновите раздел.', 409);
  return registeredCourse(course.id, next);
}
export async function listAssignments(identity) {
  const { workspace, playerId } = identity;
  const ids = await redis('zrevrange', indexKey(workspace, playerId), 0, 99);
  if (!ids?.length) return [];
  const values = await redisPipeline(ids.map(id => ['GET', summaryKey(workspace, playerId, id)]));
  return values.map(parse).filter(Boolean).map(a => ({ ...a, courseId: a.courseId || COURSE_ID, regionId: a.regionId || courseDefinition(a.courseId).metadata.regionId, region: a.region || courseDefinition(a.courseId).metadata.region }));
}
export async function loadAssignment(identity, id) {
  validateId(id); const raw = await redis('get', assignmentKey(identity.workspace, identity.playerId, id)), assignment = parse(raw);
  if (!assignment) throw preventionError('Назначение не найдено.', 404);
  return { raw, assignment };
}
async function persist(identity, previousRaw, assignment) {
  const { workspace, playerId } = identity;
  const [saved] = await redisPipeline([['EVAL', ASSIGNMENT_CAS, 3, assignmentKey(workspace, playerId, assignment.id), summaryKey(workspace, playerId, assignment.id), indexKey(workspace, playerId), previousRaw || '', JSON.stringify(assignment), JSON.stringify(assignmentSummary(assignment)), Date.parse(assignment.createdAt), assignment.id]]);
  const result = Number(saved);
  if (result === -1) throw preventionError('Достигнут предел назначений для игрока. Обратитесь к администратору.', 409);
  if (result !== 1) throw preventionError('Прогресс изменился на другом устройстве. Обновите раздел.', 409);
  return assignment;
}
export async function preventionSafety(identity) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const aliases = [...new Set([...gymIdentityAliases(identity.playerId), identity.originalId])];
  const savedRestrictions = await redisPipeline(aliases.map(id => ['GET', `${pfx(identity.workspace)}:restrictions:${id}`]));
  const restrictions = [...new Set(savedRestrictions.map(parse).flatMap(saved => Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : []))];
  try {
    const snapshot = await getPlayerSnapshot(identity.originalId, 7, date, 7, identity.workspace);
    if (!snapshot) throw new Error('Snapshot unavailable');
    const state = readySixGymState(snapshot.readySixDecision);
    return { source: 'ReadySix', available: true, date, hold: medicalHoldReason(snapshot, state, date), detail: state.detail || state.label, restrictions };
  } catch {
    return { source: 'ReadySix', available: false, date, hold: '', detail: 'Свежие данные ReadySix недоступны. Перед выполнением уточните ограничения у тренера.', restrictions };
  }
}
function checkExercises(sessions, restrictions) {
  const blocked = [...new Set(sessions.flatMap(s => s.exercises).filter(e => hasRestriction(e.name, restrictions) || hasRestriction(e.originalName, restrictions)).map(e => e.name))];
  if (blocked.length) throw preventionError(`Ограничения игрока или запреты тренера: ${blocked.join(', ')}. Сначала согласуйте адаптацию.`, 409);
}
export async function assignCourse(identity, input, actor) {
  validateId(input.requestId);
  const { course } = await loadCourse(identity.workspace, input.courseId);
  const assignment = createAssignment(course, input, { id: input.requestId, actor });
  const signature = crypto.createHash('sha256').update(JSON.stringify(course.id === COURSE_ID ? assignment.options : { courseId: course.id, options: assignment.options })).digest('hex');
  const existing = await redis('get', assignmentKey(identity.workspace, identity.playerId, assignment.id));
  if (existing) { const saved = parse(existing); if ((saved.courseId || COURSE_ID) !== course.id || saved.assignmentSignature !== signature) throw preventionError('Запрос уже использован для другого назначения.', 409); return saved; }
  if (input.expectedCatalogueRevision !== course.revision) throw preventionError('Курс изменился. Обновите его перед назначением.', 409);
  const safety = await preventionSafety(identity);
  if (safety.hold) throw preventionError(safety.hold, 409);
  checkExercises(assignment.sessions, safety.restrictions);
  assignment.assignmentSignature = signature; assignment.review = { at: new Date().toISOString(), sourceAvailable: safety.available, sourceDate: safety.date, actor };
  return persist(identity, null, assignment);
}
export async function updateAssignment(identity, input, { coach = false } = {}) {
  const { raw, assignment } = await loadAssignment(identity, input.assignmentId);
  if (coach && ['archive', 'refresh'].includes(input.action)) {
    if (input.expectedRevision !== assignment.revision) throw preventionError('Назначение изменилось. Обновите раздел.', 409);
    if (assignment.status !== 'active') throw preventionError('Назначение уже закрыто.', 409);
    let next;
    if (input.action === 'archive') next = { ...assignment, status: 'archived', revision: assignment.revision + 1, updatedAt: new Date().toISOString() };
    else {
      const { course } = await loadCourse(identity.workspace, assignment.courseId || COURSE_ID);
      next = refreshFutureSessions(assignment, course);
      const safety = await preventionSafety(identity);
      if (safety.hold) throw preventionError(safety.hold, 409);
      checkExercises(next.sessions.slice(next.cursor), safety.restrictions);
    }
    return persist(identity, raw, next);
  }
  const result = applyAssignmentCommand(assignment, input);
  if (result.replay) return assignment;
  if (input.action === 'complete' || input.action === 'mark' && input.done) {
    const safety = await preventionSafety(identity);
    if (safety.hold) throw preventionError(safety.hold, 409);
    checkExercises([currentSession(assignment)], safety.restrictions);
  }
  return persist(identity, raw, result.assignment);
}
export function publicAssignment(assignment) { const { receipts, actor, assignmentSignature, review, ...safe } = assignment; return { ...safe, region: safe.region || courseDefinition(safe.courseId).metadata.region }; }
