function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function targetReps(value) {
  const match = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)/i);
  if (match) return Number(match[1]) * Number(match[2]);
  return Number.parseInt(value, 10) || 0;
}

function weightKg(exercise = {}) {
  const direct = Number(exercise.weightKg);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(exercise.weightNote || '').match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)?/i);
  return match ? Number(match[1].replace(',', '.')) || 0 : 0;
}

function units(exercise = {}) {
  return Number(exercise.loadUnits) === 2 ? 2 : 1;
}

export function equipmentCategory(exercises = []) {
  const text = safeArray(exercises).map(item => item?.name || item).join(' ').toLowerCase();
  if (/trap bar|штанг|barbell|deadlift|станов/.test(text)) return 'Штанга / трап-гриф';
  if (/cable|блок|pulley|тяга верхнего|тяга нижнего/.test(text)) return 'Кроссовер';
  if (/dumbbell|гантел|\bdb\b/.test(text)) return 'Гантели';
  if (/kettlebell|гир|\bkb\b/.test(text)) return 'Гири';
  if (/box|тумб|jump|прыж/.test(text)) return 'Прыжковая зона';
  if (/band|резин|mini.?band/.test(text)) return 'Резины';
  if (/bench|скам/.test(text)) return 'Скамья';
  return 'Свободная зона';
}

export function sessionPlanFact(session, actual = null, log = null) {
  const exercises = safeArray(session?.blocks).flatMap(block => safeArray(block.exercises));
  const plannedSets = exercises.reduce((sum, exercise) => sum + safeArray(exercise.targetSets).length, 0);
  const completedSets = Object.values(log?.done || {}).filter(Boolean).length;
  const plannedTonnage = Math.round(exercises.reduce((sum, exercise) => {
    const kg = weightKg(exercise);
    return sum + safeArray(exercise.targetSets).reduce((setSum, set) => setSum + kg * units(exercise) * targetReps(set), 0);
  }, 0));
  const actualTonnage = Number(actual?.actualTonnage) || 0;
  const completionPercent = plannedSets ? Math.round(completedSets / plannedSets * 100) : 0;
  const tonnagePercent = plannedTonnage ? Math.round(actualTonnage / plannedTonnage * 100) : null;
  return {
    plannedSets,
    completedSets,
    completionPercent,
    plannedTonnage,
    actualTonnage,
    tonnagePercent,
    compliance: Number(actual?.compliance) || completionPercent,
    sessionRpe: Number(actual?.sessionRpe) || null,
    note: actual?.note || '',
  };
}

export function buildStationRotation(rows, groupSize = 3) {
  const planned = safeArray(rows).filter(row => row?.status?.hasSession);
  const maxBlocks = Math.max(0, ...planned.map(row => row.status.live?.blockStats?.length || 0));
  if (!planned.length || !maxBlocks) return [];
  const groups = [];
  for (let index = 0; index < planned.length; index += groupSize) {
    const members = planned.slice(index, index + groupSize);
    const offset = groups.length % maxBlocks;
    const reference = members[0]?.status?.live?.blockStats || [];
    const rotation = Array.from({ length: maxBlocks }, (_, round) => {
      const blockIndex = (offset + round) % maxBlocks;
      const block = reference[blockIndex] || {};
      return {
        round: round + 1,
        block: block.label || String.fromCharCode(65 + blockIndex),
        station: block.station || equipmentCategory(block.exercises),
      };
    });
    groups.push({
      id: `group-${groups.length + 1}`,
      label: `Группа ${groups.length + 1}`,
      members: members.map(row => ({ id: row.player.id, name: row.player.name })),
      rotation,
    });
  }
  return groups;
}

export function buildAttentionQueue(rows, readinessPlayers = [], now = new Date().toISOString()) {
  const readiness = new Map(safeArray(readinessPlayers).map(player => [String(player.id), player]));
  const anyPlan = safeArray(rows).some(row => row?.status?.hasSession);
  const items = [];
  for (const row of safeArray(rows)) {
    const player = row.player || {};
    const status = row.status || {};
    const live = status.live || {};
    const ready = readiness.get(String(player.id)) || {};
    const push = (priority, code, title, detail) => items.push({ playerId: player.id, playerName: player.name, priority, code, title, detail });
    if (ready.status === 'red') push(100, 'readiness_red', 'Красная готовность', ready.decision?.label || 'Нагрузка требует адаптации');
    else if (ready.status === 'yellow') push(65, 'readiness_yellow', 'Жёлтая готовность', ready.decision?.label || 'Нужна осторожная дозировка');
    if (Number(ready.dataCompleteness) < 50) push(55, 'data_missing', 'Недостаточно данных', `Полнота ${ready.dataCompleteness || 0}%`);
    if (Number(ready.doms) >= 4) push(85, 'doms', 'Высокая болезненность', `DOMS ${ready.doms}/5`);
    if (Number(status.feedback?.rpe) >= 9) push(90, 'high_rpe', 'Высокий session RPE', `RPE ${status.feedback.rpe}/10`);
    for (const alert of safeArray(live.alerts)) push(alert.includes('синхронизации') ? 88 : 70, 'live_alert', alert, status.trainingLabel || 'LIVE');
    if (live.completed && !status.feedback) push(60, 'feedback_missing', 'Нет итоговой оценки', 'Тренировка завершена, feedback не отправлен');
    if (anyPlan && !status.hasSession) push(35, 'plan_missing', 'Нет программы на сегодня', 'У остальных игроков программа уже назначена');
    for (const command of safeArray(status.pendingCommands)) push(75, 'command_pending', 'Команда тренера не подтверждена', command.message || command.type);
  }
  return items.sort((a, b) => b.priority - a.priority || String(a.playerName).localeCompare(String(b.playerName), 'ru'));
}
