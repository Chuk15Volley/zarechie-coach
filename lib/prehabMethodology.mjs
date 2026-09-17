// Evidence-informed coaching defaults, not a diagnostic or rehabilitation protocol.
// Sources and limits: docs/prehab-methodology.md.
export const PREHAB_VERSION = 'prehab-v1-2026-09';
const finite = value => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const STOP = 'Новая или усиливающаяся боль, онемение, слабость либо изменение техники — остановить упражнение; не преодолевать симптом нагрузкой.';
const NEXT = 'Записать самочувствие до занятия, сразу после и утром следующего дня. При ухудшении не прогрессировать; пересмотреть объём и обратиться к специалисту.';
const SOURCE_LINKS = ['https://doi.org/10.1136/bjsports-2017-097884', 'https://www.nice.org.uk/guidance/ng59/chapter/Recommendations', 'https://doi.org/10.2519/jospt.2025.13182', 'https://doi.org/10.2519/jospt.2021.0302'];

function regionalCap(state, target) {
  const items = (state.targets || []).filter(item => item.target === target);
  if (items.length !== 1 || items[0].hardStopSignal === true) return 0;
  const item = items[0];
  const health = finite(item.healthCapPercent);
  // A calendar zero is not a health zero; never infer permission from absent data.
  const cap = health ?? (item.planApplicability !== 'not_planned' ? finite(item.capPercent) : null);
  return cap != null && cap > 20 ? Math.min(100, cap) : 0;
}

const CATALOGUE = {
  upper: [
    { name:'Seated Scapular Retraction (Back Supported)', reps:'10', role:'Подготовка лопатки', sets:1, units:1, cue:'Сидя с опорой спины; небольшое комфортное движение лопаток без подъёма плеч и разгибания поясницы.' },
    { name:'Chest-Supported DB Row', reps:'8', role:'Поддержание силы разрешённой зоны', sets:2, units:2, cue:'Грудь с опорой на скамью; тяга без рывка, помощи ногами и движения поясницей.' },
    { name:'Seated Band External Rotation (Back Supported)', reps:'10', role:'Контроль плеча', sets:2, units:1, cue:'Спина с опорой, локти около корпуса; комфортная амплитуда без движения корпусом.' },
    { name:'Chest-Supported Reverse Fly', reps:'10', role:'Выносливость плечевого пояса', sets:2, units:2, cue:'Грудь с опорой; лёгкое сопротивление, без прогиба и работы через боль.' },
    { name:'Seated DB Curl (Back Supported)', reps:'10', role:'Поддержание силы рук', sets:2, units:2, cue:'Спина с опорой, без раскачивания и задержки дыхания.' },
  ],
  lower: [
    { name:'Seated Ankle Dorsiflexion', reps:'10/side', role:'Подготовка голеностопа', sets:1, units:1, tags:['ANKLE'], cue:'Сидя, мягко поднимать носок в комфортной амплитуде; не тянуть через боль.' },
    { name:'Supported Split Squat', reps:'8/side', role:'Контроль нижней конечности', sets:2, units:1, tags:['AXIAL','KNEE_HIGH'], cue:'Держаться за опору; вес тела, неглубокая комфортная амплитуда, колено по направлению стопы.' },
    { name:'Seated Calf Raise', reps:'12', role:'Выносливость голени', sets:2, units:1, tags:['ANKLE'], cue:'Сидя, плавный подъём и опускание пяток; без дополнительного веса и без боли.' },
    { name:'Supported Single-Leg Balance', reps:'20 сек/side', role:'Равновесие', sets:2, units:1, tags:['ANKLE'], cue:'Рядом устойчивая опора; без прыжка и нестабильной платформы.' },
    { name:'Short Foot Exercise (Seated)', reps:'8/side', role:'Контроль стопы', sets:2, units:1, tags:['ANKLE'], cue:'Сидя, мягко собрать свод без сгибания пальцев и без провокации симптомов.' },
  ],
};

export function buildPrehabResult({ snapshot, recommendation, date, dayGoal = '', playerRestrictions = [], coachRecovery = 'green' }) {
  if (!recommendation?.state || !Array.isArray(playerRestrictions)) return null;
  if (playerRestrictions.some(id => !['JUMP','AXIAL','KNEE_HIGH','SHOULDER','WRIST','ANKLE'].includes(id))) return null;
  const state = recommendation.state;
  let upper = regionalCap(state, 'strength_upper');
  let lower = regionalCap(state, 'strength_lower');
  if (playerRestrictions.some(id => ['SHOULDER','WRIST'].includes(id))) upper = 0;
  // Preserve explicit body-region restrictions; no exercises guessed for an undiagnosed painful zone.
  const symptoms = `${state.detail || ''} ${(snapshot.injuryLog || []).filter(row => row.status !== 'resolved').map(row => row.area || row.zone || '').join(' ')}`;
  if (/поясниц|позвоноч|low.?back|lumbar|spine/i.test(symptoms)) lower = 0;
  if (/боль.{0,25}(?:плеч|запяст|локт)|(?:shoulder|wrist|elbow).{0,25}pain/i.test(symptoms)) upper = 0;
  if (/боль.{0,25}(?:колен|голеностоп|ахилл)|(?:knee|ankle|achilles).{0,25}pain/i.test(symptoms)) lower = 0;
  if (!upper && !lower) return null;
  const regional = !upper || !lower || state.hardStop || state.level === 'red';
  const modifier = coachRecovery === 'red' ? 0.6 : coachRecovery === 'yellow' ? 0.75 : 1;
  const selected = [];
  for (const [region, cap] of [['upper',upper],['lower',lower]]) {
    if (!cap) continue;
    const candidates = CATALOGUE[region].filter(ex => !(ex.tags || []).some(tag => playerRestrictions.includes(tag)))
      .slice(0, upper && lower ? 4 : 5);
    let budget = Math.floor(candidates.reduce((n, ex) => n + ex.sets, 0) * cap / 100 * modifier);
    for (const candidate of candidates) {
      const sets = Math.min(candidate.sets, budget); budget -= sets;
      if (sets) selected.push({ ...candidate, sets, region, preparation: candidate.sets === 1 });
    }
  }
  if (!selected.length) return null;
  const blocks = [];
  function block(title, items) {
    if (!items.length) return;
    const label = String.fromCharCode(65 + blocks.length);
    blocks.push({label, title, rest_note:'45–75 сек между подходами; упражнения выполнять последовательно.',
      exercises:items.map((ex,index)=>({code:`${label}${index+1}`,name:ex.name,
        targetSets:Array(ex.sets).fill(ex.reps),loadUnits:ex.units,
        tempo:'контролируемый',cue:`${ex.role}. ${ex.region === 'unloaded' ? '' : 'Плавное движение, без взрывной фазы. '}${ex.cue}`,
        weightNote:ex.name.includes('DB') || ex.name.includes('Band') ? 'Лёгкое сопротивление подбирает тренер; RPE 3–5, без отказа и прогрессии веса.' : 'Без дополнительного веса; комфортное выполнение.',
        autoReg:STOP,alternatives:[],prehabRegion:ex.region,
      }))});
  }
  block('Подготовка движения',selected.filter(ex=>ex.preparation));
  block('Разрешённая силовая работа',selected.filter(ex=>!ex.preparation && ex.role.includes('сил')));
  block('Контроль и локальная выносливость разрешённых зон',selected.filter(ex=>!ex.preparation && !ex.role.includes('сил')));
  block('Разгрузка и контроль реакции',[{name:'Comfortable Supported Breathing',reps:'60 сек',sets:2,units:1,region:'unloaded',role:'Разгрузка без лечебной гимнастики',cue:'Выбрать удобное безболезненное положение с опорой. Спокойно дышать без задержек и движения болезненным сегментом; если положение неприятно — прекратить.'}]);
  const preliminary = !!snapshot.readySixPlanning?.preliminary;
  const localNote = regional
    ? 'Для проблемной зоны нет отдельного назначения: только комфортное положение и спокойное дыхание. Целевые лечебные упражнения, растяжение через боль и силовая прогрессия не назначаются.'
    : 'Работа направлена на поддержание силы, контроля движения и переносимости нагрузки. При появлении локальной боли этот блок пересматривается.';
  const warning = [state.detail, localNote, STOP, NEXT,
    preliminary ? `Предварительная программа на ${date}; перед выполнением проверить новые анкеты и допуск на эту дату.` : '',
    state.hardStop || ['no_gym','calendar_conflict'].includes(recommendation.key) ? 'Сохраняется ограничение ReadySix или календаря: это черновик для согласования, не разрешение выполнить нагрузку.' : '',
  ].filter(Boolean).join(' ');
  const session = {
    kind:'prehab_training_draft', blocks,
    assessment:`Профилактика: ${upper && lower ? 'разрешённые верх и низ тела' : upper ? 'разрешённый верх тела с опорой' : 'разрешённая нижняя часть тела'}. ${localNote}`,
    periodization_note:'Порядок: подготовка → разрешённая силовая работа → контроль движения → разгрузка и оценка реакции. Приоритет — качество и переносимость, а не утомление. Повышать только один параметр после устойчивой переносимости; не прогрессировать автоматически.',
    warnings:warning,triggers:[STOP,NEXT],
    methodology:{version:PREHAB_VERSION,mode:regional?'regional':'general',targetDate:date,
      assessmentDate:snapshot.readySixPlanning?.assessmentDate || date,preliminary,
      localZoneStatus:regional?'assessment_needed':'prevention',localTherapyPrescribed:false,
      permittedHealthCaps:{upper,lower},coachRecovery,dayGoal,sources:SOURCE_LINKS,
      progression:'Сначала переносимость и техника; затем один параметр. Реакцию проверить после занятия и следующим утром.',
    },
  };
  return {session,player:snapshot.player,date,dayGoal,dataSummary:warning,
    focus:'inseason_prophylaxis',trainingType:'recovery_prehab',autoSaved:false,
    saveWarning:'Профилактическая программа готова для проверки тренером; автоматического допуска или сохранения нет.',
    quality:{valid:true,errors:[],warnings:[warning],medicalReviewRequired:regional || preliminary,
      medicalReviewReason:regional?localNote:'',readySixState:state,prehabVersion:PREHAB_VERSION},
  };
}
