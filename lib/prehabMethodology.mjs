import { conciseTechnique } from './tempoDescription.mjs';
import { medicalHoldReason } from './medicalHold.mjs';
import { prehabPrescription } from './prehabDose.mjs';
import { prehabEnglishName } from './prehabNames.mjs';
import { varietyExerciseKey } from './exerciseVariety.mjs';
import { PREHAB_FAMILIES, PREHAB_POSITION_TASKS } from './prehabCatalogue.mjs';
import { worseningPrehabZones } from './prehabReaction.mjs';
export const PREHAB_VERSION = 'prehab-md2-v4-2026-10';
const STOP = 'Новая или усиливающаяся боль, онемение, слабость либо изменение техники — остановить упражнение и сообщить тренеру. Не преодолевать симптом нагрузкой.';
const NEXT = 'Оценить пять областей до занятия, после и следующим утром. Ухудшение — пересмотреть упражнение и дозу со специалистом, не прогрессировать автоматически.';
const finite = value => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const ZONE_PATTERNS = { ankle: /голеностоп|голен[ьи]|стоп[аыуе]|foot|shin|ankle/i, achilles: /ахилл|achilles/i, knee: /колен|knee/i, back: /поясниц|позвоноч|шея|шее|шейн|neck|lumbar|low.?back|spine/i, shoulder: /плеч|shoulder/i };
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

export function buildPrehabResult({ snapshot, recommendation, date, dayGoal = '', playerRestrictions = [], coachRecovery = 'green', recentSessions = [], historyAvailable = true, matchLoad = null, matchDate = null, reactions = [], rotateAll = false }) {
  if (!recommendation?.state || !Array.isArray(playerRestrictions) || !historyAvailable) return null;
  if (playerRestrictions.some(id => !['JUMP','AXIAL','KNEE_HIGH','SHOULDER','WRIST','ANKLE'].includes(id))) return null;
  const state = recommendation.state;
  const symptoms = prehabSymptoms(snapshot, state, date, reactions);
  if (symptoms.urgentReview || medicalHoldReason(snapshot, state, date)) return null;
  const sourceCaps = { upper: regionalCap(state, 'strength_upper'), lower: regionalCap(state, 'strength_lower') };
  if (['strength_upper','strength_lower'].some(target => (state.targets || []).filter(item=>item.target===target).length!==1)) return null;
  // Coach-requested prophylaxis policy: source limits remain visible, but do not
  // suppress the review draft. A blocked region receives unloaded movement only.
  const caps = { upper: 100, lower: 100 };
  if (playerRestrictions.some(id => ['SHOULDER','WRIST'].includes(id))) sourceCaps.upper = 0;
  const regional = !sourceCaps.upper || !sourceCaps.lower;
  const history = recentSessions.filter(row => row?.date < date && row?.session?.blocks?.length).slice().sort((a,b) => b.date.localeCompare(a.date));
  const rotationRows = rotateAll ? history.filter(row => (Date.parse(date) - Date.parse(row.date)) / 86400000 <= 7) : history.slice(0,1);
  const previousKeys = new Set(rotationRows.flatMap(row => row.session.blocks || []).flatMap(b => b.exercises || []).map(ex => varietyExerciseKey(prehabEnglishName(ex.name))));
  const frequency = new Map();
  for (const row of history.slice(0, 4)) for (const ex of row.session.blocks.flatMap(b => b.exercises || [])) {
    const key = varietyExerciseKey(prehabEnglishName(ex.name)); frequency.set(key, (frequency.get(key) || 0) + 1);
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
  const gentleFamilies = new Set(['ankleMobility','hipMobility','shoulderMobility','foot','supportedControl']);
  const symptomTags = new Set(symptoms.zones.flatMap(zone => zone === 'back' ? ['AXIAL'] : zone === 'knee' ? ['KNEE_HIGH'] : ['ankle','achilles'].includes(zone) ? ['ANKLE','JUMP'] : zone === 'shoulder' ? ['SHOULDER'] : []));
  const choose = family => {
    const options = (PREHAB_FAMILIES[family] || []).filter(ex => caps[ex.region] > 0 && !ex.tags.some(tag => playerRestrictions.includes(tag))
      && !used.has(varietyExerciseKey(prehabEnglishName(ex.name)))
      && (gentleFamilies.has(family) || (!ex.zones.some(zone => symptoms.zones.includes(zone)) && !ex.tags.some(tag => symptomTags.has(tag)))))
      .sort((a,b) => {
        // Keep a previously learned control/balance exercise; rotate the rest.
        const retainedA = !rotateAll && a.anchor && previousKeys.has(varietyExerciseKey(a.name));
        const retainedB = !rotateAll && b.anchor && previousKeys.has(varietyExerciseKey(b.name));
        return Number(gentleFamilies.has(family) && b.zones.some(zone=>symptoms.zones.includes(zone))) - Number(gentleFamilies.has(family) && a.zones.some(zone=>symptoms.zones.includes(zone))) || Number(retainedB) - Number(retainedA) || Number(previousKeys.has(varietyExerciseKey(a.name))) - Number(previousKeys.has(varietyExerciseKey(b.name)))
          || (frequency.get(varietyExerciseKey(a.name)) || 0) - (frequency.get(varietyExerciseKey(b.name)) || 0);
      });
    const ex = options.find(candidate => (!rotateAll && candidate.anchor) || !previousKeys.has(varietyExerciseKey(candidate.name)));
    if (!ex) { omitted.push(family); return null; }
    const key = varietyExerciseKey(prehabEnglishName(ex.name)); used.add(key);
    if (ex.anchor && previousKeys.has(key)) retained.push(ex.name);
    const factor = stateFactor;
    const symptomAdapted = ex.zones.some(zone => symptoms.zones.includes(zone));
    // Pain-area options are unloaded, comfortable movement trials, never a
    // tendon-loading protocol inferred from a questionnaire.
    const sets = 2;
    return { ...ex, sets, symptomAdapted, factor };
  };
  const definitions = [
    { title:'Мобильность и контроль комфортной амплитуды', minutes:10, families:['ankleMobility','hipMobility','shoulderMobility'] },
    { title:'Лёгкая работа на всё тело', minutes:15, families:['row','hip','knee'] },
    { title:'Баланс и стабилизация', minutes:10, families:['balance','trunk','scapula'] },
    { title:`Индивидуальный блок — ${task.label}`, minutes:15, families: symptoms.zones.length ? [...new Set([...symptoms.zones.flatMap(zone => ({ankle:['foot','ankleMobility'],achilles:['ankleMobility','foot'],knee:['hipMobility','trunk'],back:['hipMobility','trunk'],shoulder:['shoulderMobility','supportedControl']}[zone] || [])), ...task.families])].slice(0,3) : task.families },
  ];
  const blocks = definitions.flatMap(def => {
    const selected = def.families.map(choose).filter(Boolean);
    // Substitute permitted variants rather than dropping the whole session.
    const replacements = [...gentleFamilies, 'trunk', 'scapula', 'hip', 'rotator', 'row', 'calf', 'balance', 'hipControl'];
    while (selected.length < 3) {
      let replacement = null;
      for (const family of replacements) { replacement = choose(family); if (replacement) break; }
      if (!replacement) break;
      selected.push(replacement);
    }
    if (!selected.length) return [];
    const label = String.fromCharCode(65 + definitions.indexOf(def));
    const minutes = def.minutes;
    return [{ label, title:def.title, plannedMinutes:minutes, exerciseOrder:'sequential', restSeconds:90, transitionRestSeconds:60, roundRestSeconds:90,
      rest_note:`Бюджет блока ${minutes} мин, включая паузы и контроль техники; 60–90 сек между подходами; 60 сек на переход между упражнениями. Каждому упражнению отвести время станции: настройка, подходы по указанной дозировке, паузы и контроль техники/симптомов. Не добавлять подходы ради заполнения времени.`,
      exercises:selected.map((ex,i) => ({ code:`${label}${i+1}`,name:ex.name,
        targetSets:Array(ex.sets).fill(prehabPrescription(ex, ex.factor, ex.symptomAdapted).target),
        activeSecondsPerSet:prehabPrescription(ex, ex.factor, ex.symptomAdapted).secondsPerSet,
        stationMinutes:minutes / selected.length,
        loadUnits:ex.name.includes('DB') ? 2 : 1,
        compactDescription:conciseTechnique(ex.cue),tempo:'контролируемый',cue:`${ex.cue}${ex.reps.includes('/ст.') ? ' Выполнить указанное число повторений или время удержания на каждую сторону.' : ''}`,
        weightNote:ex.symptomAdapted ? 'Без отягощения. Только комфортная амплитуда после проверки тренером.' : 'Без веса или лёгкое сопротивление; RPE 2–4, минимум 4 повтора в запасе. Без отказа. Выполнять указанное число повторений или время удержания; не добавлять повторения в паузах.',
        autoReg:STOP,alternatives:[],prehabRegion:ex.region,
        prehabRole:ex.anchor?'control_anchor':'rotating',symptomAdapted:ex.symptomAdapted,
      })) }];
  });
  // Regional ceilings reduce active time and sets; station count stays stable.
  // A station includes setup, technique feedback, rest and symptom recheck.
  const exerciseCount = blocks.reduce((n,b) => n + b.exercises.length,0);
  if (exerciseCount < 10) return null;
  const preliminary = !!snapshot.readySixPlanning?.preliminary;
  const restrictedTime = blocks.reduce((sum,b) => sum + b.plannedMinutes, 0);
  const localNote = symptoms.zones.length ? `Жалобы: ${symptoms.zones.join(', ')}. Это сведения о симптомах, не диагноз. Нагружающие болезненную область варианты исключены; возможны только комфортные движения без веса после проверки тренером. Лечебного назначения нет.` : 'Жалоб по доступным данным не выявлено; это не подтверждение отсутствия боли перед занятием.';
  const warning = [state.detail, localNote, STOP, NEXT,
    participation === 'unknown' ? 'Игровая нагрузка неизвестна: применена консервативная доза, уточнить участие.' : '',
    closeToGame ? 'Ближайший матч или плотный календарь: объём дополнительно ограничен.' : '',
    restrictedTime < 50 ? `Из-за ограничений бюджет сокращён до ${restrictedTime} мин. Не восполнять пропущенную нагрузку.` : '',
    preliminary ? `Предварительная программа на ${date}: перед выполнением обновить анкеты и допуск.` : '',
    state.hardStop || ['no_gym','calendar_conflict'].includes(recommendation.key) ? 'Лимиты ReadySix не блокируют черновик профилактики по настройке тренера. Предупреждения источника сохраняются: очная проверка обязательна до выполнения; это не медицинский допуск.' : '',
  ].filter(Boolean).join(' ');
  const methodology = { version:PREHAB_VERSION, mode:regional?'regional':symptoms.zones.length?'symptom_adapted':'general', targetDate:date,
    assessmentDate:snapshot.readySixPlanning?.assessmentDate || date, preliminary,
    timing:{ targetMainMinutes:50, plannedMainMinutes:restrictedTime, warmupIncluded:false, cooldownIncluded:false, postMatchDay:2 },
    position,positionPriorities:task.priorities,matchDate:matchDate || calendar.previousGame || null,
    matchParticipation:participation,volumeModifier:stateFactor,permittedHealthCaps:sourceCaps,coachProphylaxisOverride:true,activeDoseScale:caps,
    timePolicy:'50-minute coached session; active dose reduced separately',
    activeSeconds:blocks.flatMap(b=>b.exercises).reduce((n,ex)=>n+ex.activeSecondsPerSet*ex.targetSets.length,0),
    symptoms,localTherapyPrescribed:false,sources:SOURCES,
    variety:{ previousDate:history[0]?.date || null,historyDates:history.slice(0,4).map(r=>r.date),policy:rotateAll?'all_exercises_weekly':'retain_control_rotate_accessories',retainedAnchors:retained.filter(name => blocks.some(block => block.exercises.some(ex => ex.name === name))),omittedTasks:omitted },
    dose:{targetMinutes:'50 основной работы',exerciseRPE:'2–4',restSeconds:'60–90',failureAllowed:false,jumpContacts:0},
    progression:'Удерживать знакомые упражнения на баланс/контроль. Усложнять один параметр только после устойчивой переносимости и решения тренера; не повышать автоматически вес или объём.',
    reactionStages:['before','after','nextMorning'],
  };
  const session = { kind:'prehab_training_draft',blocks,methodology,
    assessment:`MD+2: восстановление и профилактика на всё тело. ${task.label}: ${task.priorities}. Участие в матче: ${participation}. ${localNote}`,
    periodization_note:`50 минут основной работы, разминка и завершение отдельно. Бюджет этой программы — ${restrictedTime} мин с паузами и контролем реакции. Время занятия включает паузы, настройку и контроль техники; это не 50 минут непрерывной нагрузки. Общие лимиты ReadySix не обнуляют профилактику. Выбор упражнений определяется жалобами; сопротивление подбирает тренер по реакции. Мобильность → лёгкая работа → контроль → индивидуальные задачи. Ноль прыжков, тяжёлой эксцентрики и работы до отказа. ${methodology.progression}`,
    warnings:warning,triggers:[STOP,NEXT],
  };
  return {session,player:snapshot.player,date,dayGoal,dataSummary:warning,focus:'inseason_prophylaxis',trainingType:'recovery_prehab',autoSaved:false,
    saveWarning:'Программа MD+2 готова для проверки тренером; сохраните после проверки ограничений и реакции игрока.',
    quality:{valid:true,errors:[],warnings:[warning],medicalReviewRequired:regional || preliminary || symptoms.zones.length > 0 || !!state.hardStop,
      medicalReviewReason:localNote,readySixState:state,prehabVersion:PREHAB_VERSION},
  };
}
