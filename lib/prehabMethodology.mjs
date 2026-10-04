import { varietyExerciseKey } from './exerciseVariety.mjs';
import { PREHAB_FAMILIES, PREHAB_POSITION_TASKS } from './prehabCatalogue.mjs';
import { worseningPrehabZones } from './prehabReaction.mjs';
export const PREHAB_VERSION = 'prehab-md2-v3-2026-10';
const STOP = 'Новая или усиливающаяся боль, онемение, слабость либо изменение техники — остановить упражнение и сообщить тренеру. Не преодолевать симптом нагрузкой.';
const NEXT = 'Оценить пять областей до занятия, после и следующим утром. Ухудшение — пересмотреть упражнение и дозу со специалистом, не прогрессировать автоматически.';
const finite = value => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const ZONE_PATTERNS = { ankle: /голеностоп|ankle/i, achilles: /ахилл|achilles/i, knee: /колен|knee/i, back: /поясниц|позвоноч|lumbar|low.?back|spine/i, shoulder: /плеч|shoulder/i };
const SOURCES = ['https://pubmed.ncbi.nlm.nih.gov/30317835/', 'https://pubmed.ncbi.nlm.nih.gov/41460726/', 'https://pubmed.ncbi.nlm.nih.gov/15310562/', 'https://doi.org/10.2519/jospt.2025.13182'];
function regionalCap(state, target) {
  const items = (state.targets || []).filter(item => item.target === target);
  if (items.length !== 1 || items[0].hardStopSignal === true) return 0;
  const item = items[0];
  const cap = finite(item.healthCapPercent) ?? (item.planApplicability !== 'not_planned' ? finite(item.capPercent) : null);
  return cap != null && cap > 20 ? Math.min(100, cap) : 0;
}
export function prehabPosition(position = '') {
  const value = String(position).toLowerCase();
  if (/либеро|libero|^l$/.test(value)) return 'libero';
  if (/связ|setter|^s$/.test(value)) return 'setter';
  if (/центр|middle|^mb$/.test(value)) return 'middle';
  if (/диагон|opposite|^opp$/.test(value)) return 'opposite';
  if (/доигр|outside|^oh$/.test(value)) return 'outside';
  return 'general';
}
export function prehabSymptoms(snapshot, state, date, reactions = []) {
  const zones = new Set();
  const evidence = [];
  const rows = [snapshot.latestMorning, snapshot.latestSurvey, snapshot.latestPostMorning,
    ...(snapshot.morning || []), ...(snapshot.surveys || []), ...(snapshot.postMorningSurveys || [])]
    .filter(row => row && row.date && row.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
  // Use the latest available questionnaire of each kind, including a planning
  // snapshot. Do not reinterpret soreness/DOMS as a diagnosis or local pain.
  const selected = [...new Map(rows.map(row => [`${row.date}:${row.submittedAt || ''}`, row])).values()].slice(0, 3);
  for (const row of selected) for (const [area, detail] of Object.entries(row.zoneDetails || {})) {
    if (detail?.type !== 'pain') continue;
    const level = finite(detail.level10 ?? detail.level);
    if (level === 0) continue;
    for (const [zone, pattern] of Object.entries(ZONE_PATTERNS)) if (pattern.test(area)) {
      zones.add(zone); evidence.push({ zone, date: row.date, source: 'ReadySix', level });
    }
  }
  for (const row of selected) for (const area of row.painAreas || []) {
    const name = typeof area === 'string' ? area : area?.area || area?.name || '';
    for (const [zone, pattern] of Object.entries(ZONE_PATTERNS)) if (pattern.test(name)) {
      zones.add(zone); evidence.push({ zone, date: row.date, source:'ReadySix', level:null });
    }
  }
  const text = `${state.detail || ''} ${(snapshot.injuryLog || []).filter(row => row.status !== 'resolved' && (!row.date || row.date <= date)).map(row => `${row.area || row.zone || ''} ${row.note || ''}`).join(' ')}`;
  for (const [zone, pattern] of Object.entries(ZONE_PATTERNS)) if (pattern.test(text) && /боль|pain|травм|injur|огранич/i.test(text)) zones.add(zone);
  const previous = reactions.filter(row => row?.date < date).sort((a,b) => b.date.localeCompare(a.date))[0];
  for (const zone of worseningPrehabZones(previous)) zones.add(zone);
  for (const stage of ['before', 'after', 'nextMorning']) for (const [zone, value] of Object.entries(previous?.[stage]?.pain || {})) {
    if (value > 0 && ZONE_PATTERNS[zone]) zones.add(zone);
  }
  return { zones: [...zones], evidence, previousReactionDate: previous?.date || null,
    worsenedZones: worseningPrehabZones(previous),
    urgentReview: /нарастающ.*онем|прогрессирующ.*невр|потеря чувствительност|нарушен.*мочеиспуск|подозрен.*перелом/i.test(text) };
}

export function buildPrehabResult({ snapshot, recommendation, date, dayGoal = '', playerRestrictions = [], coachRecovery = 'green', recentSessions = [], historyAvailable = true, matchLoad = null, matchDate = null, reactions = [] }) {
  if (!recommendation?.state || !Array.isArray(playerRestrictions) || !historyAvailable) return null;
  if (playerRestrictions.some(id => !['JUMP','AXIAL','KNEE_HIGH','SHOULDER','WRIST','ANKLE'].includes(id))) return null;
  const state = recommendation.state;
  const symptoms = prehabSymptoms(snapshot, state, date, reactions);
  if (symptoms.urgentReview) return null;
  const caps = { upper: regionalCap(state, 'strength_upper'), lower: regionalCap(state, 'strength_lower') };
  if (playerRestrictions.some(id => ['SHOULDER','WRIST'].includes(id))) caps.upper = 0;
  if (!caps.upper && !caps.lower) return null;
  const regional = !caps.upper || !caps.lower;
  const history = recentSessions.filter(row => row?.date < date && row?.session?.blocks?.length).slice().sort((a,b) => b.date.localeCompare(a.date));
  const previousKeys = new Set((history[0]?.session.blocks || []).flatMap(b => b.exercises || []).map(ex => varietyExerciseKey(ex.name)));
  const frequency = new Map();
  for (const row of history.slice(0, 4)) for (const ex of row.session.blocks.flatMap(b => b.exercises || [])) {
    const key = varietyExerciseKey(ex.name); frequency.set(key, (frequency.get(key) || 0) + 1);
  }
  const calendar = recommendation.calendar || {};
  const closeToGame = calendar.todayEvent?.type === 'game' || calendar.daysToGame === 1 || calendar.congested === true;
  // These conservative factors are product defaults, not clinical thresholds.
  const participation = ['high','medium','low','none','inactive'].includes(matchLoad?.status) ? matchLoad.status : 'unknown';
  const stateFactor = Math.min(coachRecovery === 'red' || state.level === 'red' ? 0.6 : coachRecovery === 'yellow' || state.level === 'yellow' ? 0.75 : 1,
    participation === 'high' ? 0.75 : participation === 'unknown' || matchLoad?.pain ? 0.75 : 1,
    finite(matchLoad?.rpe) >= 8 ? 0.75 : 1, closeToGame ? 0.65 : 1,
    symptoms.worsenedZones.length ? 0.6 : 1);
  const position = prehabPosition(snapshot.player?.position);
  const task = PREHAB_POSITION_TASKS[position];
  const used = new Set(); const omitted = []; const retained = [];
  const gentleFamilies = new Set(['ankleMobility','hipMobility','shoulderMobility','foot']);
  const choose = family => {
    const options = (PREHAB_FAMILIES[family] || []).filter(ex => caps[ex.region] > 0 && !ex.tags.some(tag => playerRestrictions.includes(tag))
      && !used.has(varietyExerciseKey(ex.name))
      && (gentleFamilies.has(family) || !ex.zones.some(zone => symptoms.zones.includes(zone))))
      .sort((a,b) => {
        // Keep a previously learned control/balance exercise; rotate the rest.
        const retainedA = a.anchor && previousKeys.has(varietyExerciseKey(a.name));
        const retainedB = b.anchor && previousKeys.has(varietyExerciseKey(b.name));
        return Number(retainedB) - Number(retainedA) || Number(previousKeys.has(varietyExerciseKey(a.name))) - Number(previousKeys.has(varietyExerciseKey(b.name)))
          || (frequency.get(varietyExerciseKey(a.name)) || 0) - (frequency.get(varietyExerciseKey(b.name)) || 0);
      });
    const ex = options.find(candidate => candidate.anchor || !previousKeys.has(varietyExerciseKey(candidate.name)));
    if (!ex) { omitted.push(family); return null; }
    const key = varietyExerciseKey(ex.name); used.add(key);
    if (ex.anchor && previousKeys.has(key)) retained.push(ex.name);
    const factor = Math.min(caps[ex.region] / 100, stateFactor);
    const symptomAdapted = ex.zones.some(zone => symptoms.zones.includes(zone));
    // Pain-area options are unloaded, comfortable movement trials, never a
    // tendon-loading protocol inferred from a questionnaire.
    const sets = factor < 0.7 || symptomAdapted ? 1 : 2;
    return { ...ex, sets, symptomAdapted };
  };
  const definitions = [
    { title:'Мобильность и контроль комфортной амплитуды', minutes:10, families:['ankleMobility','hipMobility','shoulderMobility'] },
    { title:'Лёгкая работа на всё тело', minutes:15, families:['row','hip','knee'] },
    { title:'Баланс и стабилизация', minutes:10, families:['balance','trunk','scapula'] },
    { title:`Индивидуальный блок — ${task.label}`, minutes:15, families:task.families },
  ];
  const blocks = definitions.flatMap(def => {
    const selected = def.families.map(choose).filter(Boolean);
    if (!selected.length) return [];
    const label = String.fromCharCode(65 + definitions.indexOf(def));
    const minutes = regional || symptoms.zones.length || stateFactor < 0.7 ? Math.round(def.minutes * Math.max(0.5, stateFactor)) : def.minutes;
    return [{ label, title:def.title, plannedMinutes:minutes,
      rest_note:`Бюджет блока ${minutes} мин, включая паузы и контроль техники; 60–90 сек между подходами. Не добавлять подходы ради заполнения времени.`,
      exercises:selected.map((ex,i) => ({ code:`${label}${i+1}`,name:ex.name,
        targetSets:Array(ex.sets).fill(ex.reps),loadUnits:ex.name.includes('гантел') ? 2 : 1,
        tempo:'контролируемый',cue:ex.cue,
        weightNote:ex.symptomAdapted ? 'Без отягощения. Только комфортная амплитуда после проверки тренером.' : 'Без веса или лёгкое сопротивление; RPE 2–4, минимум 4 повтора в запасе. Без отказа.',
        autoReg:STOP,alternatives:[],prehabRegion:ex.region,
        prehabRole:ex.anchor?'control_anchor':'rotating',symptomAdapted:ex.symptomAdapted,
      })) }];
  });
  // Apply the regional and participation ceilings to actual sets, not just
  // labels. Spread first sets before second sets; never inflate a small cap.
  for (const region of ['upper', 'lower']) {
    const items = blocks.flatMap(b => b.exercises).filter(ex => ex.prehabRegion === region);
    let budget = Math.floor(items.length * 2 * caps[region] / 100 * stateFactor);
    const limits = items.map(ex => ex.targetSets.length);
    const allocations = items.map(() => 0);
    for (let round = 0; round < 2; round++) items.forEach((ex, i) => {
      if (budget > 0 && allocations[i] < limits[i]) { allocations[i]++; budget--; }
    });
    items.forEach((ex, i) => { ex.targetSets = ex.targetSets.slice(0, allocations[i]); });
  }
  blocks.forEach(block => { block.exercises = block.exercises.filter(ex => ex.targetSets.length); });
  for (let i = blocks.length - 1; i >= 0; i--) if (!blocks[i].exercises.length) blocks.splice(i, 1);
  if (!blocks.length) return null;
  const preliminary = !!snapshot.readySixPlanning?.preliminary;
  const restrictedTime = blocks.reduce((sum,b) => sum + b.plannedMinutes, 0);
  const localNote = symptoms.zones.length ? `Жалобы: ${symptoms.zones.join(', ')}. Это сведения о симптомах, не диагноз. Нагружающие болезненную область варианты исключены; возможны только комфортные движения без веса после проверки тренером. Лечебного назначения нет.` : 'Жалоб по доступным данным не выявлено; это не подтверждение отсутствия боли перед занятием.';
  const warning = [state.detail, localNote, STOP, NEXT,
    participation === 'unknown' ? 'Игровая нагрузка неизвестна: применена консервативная доза, уточнить участие.' : '',
    closeToGame ? 'Ближайший матч или плотный календарь: объём дополнительно ограничен.' : '',
    restrictedTime < 50 ? `Из-за ограничений бюджет сокращён до ${restrictedTime} мин. Не восполнять пропущенную нагрузку.` : '',
    preliminary ? `Предварительная программа на ${date}: перед выполнением обновить анкеты и допуск.` : '',
    state.hardStop || ['no_gym','calendar_conflict'].includes(recommendation.key) ? 'Сохраняется ограничение ReadySix/календаря. Это черновик для согласования, не допуск к нагрузке.' : '',
  ].filter(Boolean).join(' ');
  const methodology = { version:PREHAB_VERSION, mode:regional?'regional':symptoms.zones.length?'symptom_adapted':'general', targetDate:date,
    assessmentDate:snapshot.readySixPlanning?.assessmentDate || date, preliminary,
    timing:{ targetMainMinutes:50, plannedMainMinutes:restrictedTime, warmupIncluded:false, cooldownIncluded:false, postMatchDay:2 },
    position,positionPriorities:task.priorities,matchDate:matchDate || calendar.previousGame || null,
    matchParticipation:participation,volumeModifier:stateFactor,permittedHealthCaps:caps,
    symptoms,localTherapyPrescribed:false,sources:SOURCES,
    variety:{ previousDate:history[0]?.date || null,historyDates:history.slice(0,4).map(r=>r.date),policy:'retain_control_rotate_accessories',retainedAnchors:retained.filter(name => blocks.some(block => block.exercises.some(ex => ex.name === name))),omittedTasks:omitted },
    dose:{targetMinutes:'50 основной работы',exerciseRPE:'2–4',restSeconds:'60–90',failureAllowed:false,jumpContacts:0},
    progression:'Удерживать знакомые упражнения на баланс/контроль. Усложнять один параметр только после устойчивой переносимости и решения тренера; не повышать автоматически вес или объём.',
    reactionStages:['before','after','nextMorning'],
  };
  const session = { kind:'prehab_training_draft',blocks,methodology,
    assessment:`MD+2: восстановление и профилактика на всё тело. ${task.label}: ${task.priorities}. Участие в матче: ${participation}. ${localNote}`,
    periodization_note:`50 минут основной работы, разминка и завершение отдельно. Бюджет этой программы — ${restrictedTime} мин с паузами и контролем реакции. Мобильность → лёгкая работа на всё тело → баланс → индивидуальные задачи. Ноль прыжков, тяжёлой эксцентрики и работы до отказа. ${methodology.progression}`,
    warnings:warning,triggers:[STOP,NEXT],
  };
  return {session,player:snapshot.player,date,dayGoal,dataSummary:warning,focus:'inseason_prophylaxis',trainingType:'recovery_prehab',autoSaved:false,
    saveWarning:'Программа MD+2 готова для проверки тренером; сохраните после проверки ограничений и реакции игрока.',
    quality:{valid:true,errors:[],warnings:[warning],medicalReviewRequired:regional || preliminary || symptoms.zones.length > 0,
      medicalReviewReason:localNote,readySixState:state,prehabVersion:PREHAB_VERSION},
  };
}
