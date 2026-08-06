function shiftDate(date, amount) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function readinessNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function latestOnOrBefore(records, date) {
  return [...(records || [])]
    .filter(record => record?.date && record.date <= date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

export function readinessZones(survey) {
  const zones = Object.entries(survey?.zoneDetails || {})
    .map(([area, detail]) => ({
      area,
      type: detail?.type === 'pain' ? 'pain' : 'soreness',
      level: readinessNumber(detail?.level),
    }))
    .filter(zone => zone.area && zone.level != null && zone.level > 0);
  if (zones.length) return zones;
  return (survey?.painAreas || []).map(area => ({ area, type: 'pain', level: null }));
}

export function readinessDecisionLevel({ evening, eveningFresh, morning, whoop, neuro, activeInjuries, testsExpected = true }) {
  const zones = readinessZones(evening);
  const strongestPain = Math.max(0, ...zones.filter(zone => zone.type === 'pain').map(zone => zone.level || 0));
  const unscoredPain = zones.some(zone => zone.type === 'pain' && zone.level == null);
  if (activeInjuries.length || (eveningFresh && evening?.hasInjury) || (eveningFresh && strongestPain >= 3)) {
    return { level: 'red', label: 'Нужна адаптация', detail: 'Есть свежая травма или выраженная боль.' };
  }
  if (evening?.hasInjury || strongestPain >= 3) {
    return { level: 'yellow', label: 'Требует проверки', detail: 'В последней, но не свежей анкете есть боль или травма: проверь актуальность перед стартом.' };
  }
  if (eveningFresh && unscoredPain) {
    return { level: 'yellow', label: 'Требует проверки', detail: 'В свежей анкете отмечена боль без уровня: уточни её перед стартом и не форсируй нагрузку на эту зону.' };
  }
  if (readinessNumber(whoop?.recovery) != null && readinessNumber(whoop.recovery) < 34) {
    return { level: 'red', label: 'Только качество', detail: 'Recovery ниже 34%: снизить объём и риск.' };
  }
  if (readinessNumber(morning?.readiness) != null && readinessNumber(morning.readiness) <= 2) {
    return { level: 'red', label: 'Только качество', detail: 'Игрок отметил низкую утреннюю готовность.' };
  }
  if (readinessNumber(evening?.tomorrowReadiness) != null && readinessNumber(evening.tomorrowReadiness) <= 2) {
    return { level: 'yellow', label: 'Объём снижен', detail: 'Низкая готовность к следующему дню по вечерней анкете.' };
  }
  if (readinessNumber(evening?.soreness) >= 4 || readinessNumber(evening?.legFatigue) >= 4 || readinessNumber(evening?.shoulderLoad) >= 4) {
    return { level: 'yellow', label: 'Нужна коррекция', detail: 'Высокая локальная усталость или крепатура.' };
  }
  const availableDomains = [
    readinessNumber(whoop?.recovery) != null || readinessNumber(whoop?.hrv) != null,
    !!morning || !!evening,
    testsExpected ? !!neuro?.fresh : null,
  ].filter(Boolean).length;
  if (availableDomains < 2) {
    return {
      level: 'yellow',
      label: 'Данных пока мало',
      detail: testsExpected
        ? 'Есть данные только одного домена. До опроса и нейротеста не считать отсутствие показателей зелёным сигналом.'
        : 'Для NK Performance нужны WHOOP и/или опрос. Тесты CMJ, RSI и 10 м не ожидаются.',
    };
  }
  return { level: 'green', label: 'Данные без красных флагов', detail: 'Тренерский статус и выбранная тема остаются решающими.' };
}

export function readinessDecisionFromSnapshot(snapshot, targetDate, { testsExpected = true, neuroFresh = false } = {}) {
  const evening = latestOnOrBefore(snapshot?.surveys, targetDate);
  const exactMorning = (snapshot?.morning || []).find(record => record.date === targetDate) || null;
  const morning = exactMorning
    || (snapshot?.latestMorning?.date <= targetDate ? snapshot.latestMorning : null)
    || latestOnOrBefore(snapshot?.morning, targetDate);
  const whoop = (snapshot?.whoop || []).find(record => record.date === targetDate) || null;
  const eveningFresh = !!evening && evening.date === shiftDate(targetDate, -1);
  const activeInjuries = (snapshot?.injuryLog || [])
    .filter(record => record?.status === 'active' || record?.status === 'monitoring')
    .map(record => ({
      bodyPart: record.bodyPart || 'Не указано',
      severity: readinessNumber(record.severity),
      painLevel: readinessNumber(record.painLevel),
    }));
  const decision = readinessDecisionLevel({
    evening,
    eveningFresh,
    morning,
    whoop,
    neuro: { fresh: neuroFresh },
    activeInjuries,
    testsExpected,
  });
  return { evening, exactMorning, morning, whoop, eveningFresh, activeInjuries, decision };
}

export function strictestRecoveryStatus(coachStatus = 'green', automaticStatus = 'green') {
  const rank = { green: 0, yellow: 1, red: 2 };
  return (rank[automaticStatus] || 0) > (rank[coachStatus] || 0) ? automaticStatus : coachStatus;
}
