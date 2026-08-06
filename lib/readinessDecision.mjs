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
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0] || null;
}

export function readinessZones(survey) {
  const zones = Object.entries(survey?.zoneDetails || {})
    .map(([area, detail]) => {
      const rawLevel = readinessNumber(detail?.level10 ?? detail?.level);
      const scaleMax = readinessNumber(detail?.scaleMax) || (detail?.level10 != null ? 10 : 5);
      return {
        area,
        type: detail?.type === 'pain' ? 'pain' : 'soreness',
        // Safety thresholds use one consistent 1-5 scale even though the new
        // morning questionnaire records pain on a 1-10 scale.
        level: rawLevel == null ? null : scaleMax === 10 ? rawLevel / 2 : rawLevel,
      };
    })
    .filter(zone => zone.area && zone.level != null && zone.level > 0);
  if (zones.length) return zones;
  return (survey?.painAreas || []).map(area => ({ area, type: 'pain', level: null }));
}

export function readinessDecisionLevel({ evening, eveningFresh, postMorning, postMorningFresh, morning, morningFresh, whoop, neuro, activeInjuries, testsExpected = true }) {
  const sessionSurveys = [
    { record: evening, fresh: eveningFresh },
    { record: postMorning, fresh: postMorningFresh },
    { record: morning, fresh: morningFresh },
  ].filter(item => item.record);
  const surveyZones = sessionSurveys.flatMap(item => readinessZones(item.record).map(zone => ({ ...zone, fresh: item.fresh })));
  const strongestPain = Math.max(0, ...surveyZones.filter(zone => zone.type === 'pain').map(zone => zone.level || 0));
  const freshStrongestPain = Math.max(0, ...surveyZones.filter(zone => zone.fresh && zone.type === 'pain').map(zone => zone.level || 0));
  const unscoredFreshPain = surveyZones.some(zone => zone.fresh && zone.type === 'pain' && zone.level == null);
  const freshLoadConcern = sessionSurveys.some(item => item.fresh && (item.record.hasInjury || item.record.hasLoadConcern));
  const anyLoadConcern = sessionSurveys.some(item => item.record.hasInjury || item.record.hasLoadConcern);
  if (activeInjuries.length || freshLoadConcern || freshStrongestPain >= 3) {
    return { level: 'red', label: 'Нужна адаптация', detail: 'Есть свежая травма или выраженная боль.' };
  }
  if (anyLoadConcern || strongestPain >= 3) {
    return { level: 'yellow', label: 'Требует проверки', detail: 'В последней, но не свежей анкете есть боль или травма: проверь актуальность перед стартом.' };
  }
  if (unscoredFreshPain) {
    return { level: 'yellow', label: 'Требует проверки', detail: 'В свежей анкете отмечена боль без уровня: уточни её перед стартом и не форсируй нагрузку на эту зону.' };
  }
  if (readinessNumber(whoop?.recovery) != null && readinessNumber(whoop.recovery) < 34) {
    return { level: 'red', label: 'Только качество', detail: 'Recovery ниже 34%: снизить объём и риск.' };
  }
  if (readinessNumber(morning?.readiness) != null && readinessNumber(morning.readiness) <= 2) {
    return { level: 'red', label: 'Только качество', detail: 'Игрок отметил низкую утреннюю готовность.' };
  }
  if (sessionSurveys.some(item => readinessNumber(item.record?.tomorrowReadiness) != null && readinessNumber(item.record.tomorrowReadiness) <= 2)) {
    return { level: 'yellow', label: 'Объём снижен', detail: 'Низкая готовность по последней анкете после нагрузки.' };
  }
  if (sessionSurveys.some(item => readinessNumber(item.record?.soreness) >= 4 || readinessNumber(item.record?.fatigue) >= 4 || readinessNumber(item.record?.legFatigue) >= 4 || readinessNumber(item.record?.shoulderLoad) >= 4)) {
    return { level: 'yellow', label: 'Нужна коррекция', detail: 'Высокая локальная усталость или крепатура.' };
  }
  const availableDomains = [
    readinessNumber(whoop?.recovery) != null || readinessNumber(whoop?.hrv) != null,
    !!morning || !!evening || !!postMorning,
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
  const postMorning = (snapshot?.latestPostMorning?.date <= targetDate ? snapshot.latestPostMorning : null)
    || latestOnOrBefore(snapshot?.postMorningSurveys, targetDate);
  const exactMorning = (snapshot?.morning || []).find(record => record.date === targetDate) || null;
  const morning = exactMorning
    || (snapshot?.latestMorning?.date <= targetDate ? snapshot.latestMorning : null)
    || latestOnOrBefore(snapshot?.morning, targetDate);
  const whoop = (snapshot?.whoop || []).find(record => record.date === targetDate) || null;
  const previousDate = shiftDate(targetDate, -1);
  const eveningFresh = !!evening && (evening.date === targetDate || evening.date === previousDate);
  const postMorningFresh = !!postMorning && (postMorning.date === targetDate || postMorning.date === previousDate);
  const morningFresh = !!morning && (morning.date === targetDate || morning.date === previousDate);
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
    postMorning,
    postMorningFresh,
    morning,
    morningFresh,
    whoop,
    neuro: { fresh: neuroFresh },
    activeInjuries,
    testsExpected,
  });
  return { evening, postMorning, exactMorning, morning, whoop, eveningFresh, postMorningFresh, morningFresh, activeInjuries, decision };
}

export function strictestRecoveryStatus(coachStatus = 'green', automaticStatus = 'green') {
  const rank = { green: 0, yellow: 1, red: 2 };
  return (rank[automaticStatus] || 0) > (rank[coachStatus] || 0) ? automaticStatus : coachStatus;
}
