// Conservative coaching options. No exercise here diagnoses or treats an
// unidentified complaint. Tags express restrictions and involved regions.
const e = (name, region, zones, tags, reps, cue, anchor = false) => ({ name, region, zones, tags, reps, cue, anchor });
export const PREHAB_FAMILIES = {
  supportedControl: [
    e('Supported Wrist Radial and Ulnar Deviation', 'upper', [], ['WRIST'], '8', 'Предплечье лежит на столе ладонью вниз. Плавно двигать кисть в стороны в небольшой амплитуде, без веса.'),
    e('Seated Thumb Opposition', 'upper', [], ['WRIST'], '8', 'Предплечья с опорой. Последовательно касаться большим пальцем остальных пальцев без сильного сжатия.'),
    e('Seated Finger Tendon Glide', 'upper', [], ['WRIST'], '8', 'Предплечье на опоре. Плавно менять положение пальцев: прямая кисть, крючок, мягкий кулак; без боли и силового сжатия.'),
    e('Supported Shoulder Scaption Slide', 'upper', ['shoulder'], ['SHOULDER'], '6/ст.', 'Предплечье на полотенце на столе. Скользить вперёд и немного в сторону в комфортной амплитуде; плечо не поднимать к уху.'),

    e('Seated Elbow Flexion and Extension', 'upper', [], ['WRIST'], '8', 'Спина с опорой, плечи расслаблены. Плавно согнуть и разогнуть локти без веса и движения плечом.'),
    e('Seated Forearm Pronation and Supination', 'upper', [], ['WRIST'], '8', 'Предплечья на столе, локти согнуты. Плавно повернуть ладони вверх и вниз без веса; плечо неподвижно.'),
    e('Supported Wrist Flexion and Extension', 'upper', [], ['WRIST'], '8', 'Предплечье на опоре, кисть за краем. Небольшие плавные движения кистью без веса.'),
    e('Seated Hand Open and Close', 'upper', [], ['WRIST'], '8', 'Предплечья на опоре. Мягко раскрывать пальцы и собирать кисть, не сжимать кулак с усилием.'),
    e('Supported Shoulder Flexion Slide', 'upper', ['shoulder'], ['SHOULDER'], '6/ст.', 'Сидя перед столом, предплечье на полотенце. Скользить рукой вперёд в короткой комфортной амплитуде, не тянуть через боль.'),
    e('Supported Shoulder External Rotation AROM', 'upper', ['shoulder'], ['SHOULDER'], '6/ст.', 'Сидя с опорой спины, локоть у корпуса на полотенце. Повернуть предплечье наружу без резинки, веса и боли.'),
  ],

  ankleMobility: [
    e('Seated Ankle Pumps', 'lower', ['ankle'], ['ANKLE'], '40 сек/ст.', 'Сидя с опорой ноги, плавно сгибать и разгибать стопу в комфортной амплитуде, без натяжения.'),
    e('Seated Ankle Circles', 'lower', ['ankle'], ['ANKLE'], '40 сек/ст.', 'Небольшие медленные круги стопой; не стремиться к предельной амплитуде.'),
  ],
  hipMobility: [
    e('Supine Heel Slide', 'lower', ['knee', 'back'], [], '6/ст.', 'Лёжа, плавно скользить пяткой, сохраняя спокойный таз и дыхание.'),
    e('Bent-Knee Fallout', 'lower', ['back'], [], '6/ст.', 'Лёжа на спине, стопы на полу; небольшое отведение колена без движения таза.'),
  ],
  shoulderMobility: [
    e('Seated Scapular Retraction (Back Supported)', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '8', 'Спина с опорой; мягко направлять лопатки назад и вниз, не поднимать плечи.'),
    e('Forearm Wall Slide', 'upper', ['shoulder', 'back'], ['SHOULDER', 'WRIST'], '8', 'Предплечья на стене; короткая комфортная амплитуда без прогиба поясницы.'),
  ],
  row: [
    e('Chest-Supported DB Row', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '8', 'Грудь на скамье; лёгкий вес, плавная тяга к рёбрам без рывка и прогиба.'),
    e('Seated Band Row (Back Supported)', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '10', 'Устойчивая опора спины и безопасное крепление резинки; лёгкая тяга без помощи корпусом.'),
  ],
  hip: [
    e('Bodyweight Glute Bridge', 'lower', ['back', 'knee', 'ankle', 'achilles'], ['AXIAL'], '8', 'Плавно поднять таз без переразгибания поясницы; не задерживать дыхание.'),
    e('Side-Lying Hip Abduction', 'lower', ['back'], [], '8/ст.', 'Голова с опорой, таз неподвижен; небольшой подъём ноги без веса.'),
    e('Side-Lying Clamshell', 'lower', ['back'], [], '10/ст.', 'Лёжа на боку, раскрыть верхнее колено без поворота таза.'),
  ],
  knee: [
    e('Supported High-Box Sit-to-Stand', 'lower', ['knee', 'ankle', 'achilles', 'back'], ['AXIAL', 'KNEE_HIGH', 'ANKLE'], '8', 'Высокая скамья; опора руками, без веса, колени направлять по стопам.'),
    e('Supported Shallow Split Squat', 'lower', ['knee', 'ankle', 'achilles', 'back'], ['AXIAL', 'KNEE_HIGH', 'ANKLE'], '6/ст.', 'Держаться за устойчивую опору; небольшая глубина без веса и боли.'),
  ],
  balance: [
    e('Supported Single-Leg Balance', 'lower', ['ankle', 'achilles', 'knee'], ['ANKLE', 'KNEE_HIGH'], '30 сек/ст.', 'Рядом устойчивая опора; глаза открыты, ровная поверхность. Сначала уменьшать помощь рукой, затем менять задачу.', true),
    e('Supported Tandem Stance', 'lower', ['ankle', 'achilles', 'knee'], ['ANKLE', 'KNEE_HIGH'], '30 сек/ст.', 'Стопы одна перед другой рядом с опорой; сохранять спокойное дыхание и контроль таза.', true),
  ],
  trunk: [
    e('Dead Bug Heel Tap', 'lower', ['back', 'knee'], [], '6/ст.', 'Лёжа на спине с опорой головы, бёдра и колени согнуты примерно до 90°. Поочерёдно легко касаться пола пяткой, сохраняя нейтральную поясницу; при потере контроля уменьшить амплитуду.', true),
    e('Supine March', 'lower', ['back'], [], '6/ст.', 'Стопы на полу, поочерёдно приподнимать одну стопу без движения таза.', true),
  ],
  scapula: [
    e('Supine Serratus Reach', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '10', 'Лёжа с опорой головы, руки вверх без веса; короткое движение лопатки к потолку без прогиба.', true),
    e('Chest-Supported Prone W Raise', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '8', 'Грудь на опоре; руки буквой W, небольшой подъём без веса и подъёма плеч.', true),
  ],
  calf: [
    e('Seated Calf Raise (Bodyweight)', 'lower', ['ankle', 'achilles'], ['ANKLE'], '12', 'Сидя, плавно поднять и опустить пятки без дополнительного веса, пружины и растяжения через край.'),
    e('Supported Bilateral Calf Raise', 'lower', ['ankle', 'achilles', 'knee'], ['ANKLE', 'KNEE_HIGH'], '10', 'Держаться за опору; плавное движение на ровном полу без веса и пружины.'),
  ],
  rotator: [
    e('Seated Band External Rotation', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '10', 'Спина с опорой, локти у корпуса; небольшое сопротивление, без движения туловищем.'),
    e('Side-Lying Shoulder External Rotation', 'upper', ['shoulder'], ['SHOULDER', 'WRIST'], '8/ст.', 'Голова с опорой, локоть на полотенце у корпуса; без веса или минимальный вес после проверки тренером.'),
  ],
  hipControl: [
    e('Supine Adductor Ball Squeeze', 'lower', ['back', 'knee'], [], '6 × 5 сек', 'Мягкое субмаксимальное сжатие мяча без задержки дыхания и боли; это контроль, не максимальное усилие.'),
    e('Supported Standing Hip Abduction', 'lower', ['ankle', 'achilles', 'knee', 'back'], ['AXIAL', 'ANKLE', 'KNEE_HIGH'], '8/ст.', 'Держаться за опору, небольшое отведение ноги без наклона корпуса и резинки.'),
  ],
  foot: [
    e('Seated Short-Foot Exercise', 'lower', ['ankle'], ['ANKLE'], '8/ст.', 'Мягко собрать свод без сгибания пальцев, большого усилия и судороги.', true),
    e('Seated Toe Splay', 'lower', ['ankle'], ['ANKLE'], '8/ст.', 'Мягко развести пальцы и расслабить; стопа с опорой.', true),
  ],
};
export const PREHAB_POSITION_TASKS = {
  middle: { label: 'Центральный блокирующий', priorities: 'Голень и ахилл, контроль колена, плечевой пояс', families: ['calf', 'rotator', 'foot'] },
  outside: { label: 'Доигровщик', priorities: 'Плечевой пояс, таз и корпус, контроль голени', families: ['rotator', 'hipControl', 'calf'] },
  opposite: { label: 'Диагональный', priorities: 'Плечевой пояс, таз и задняя цепь, голень', families: ['rotator', 'hipControl', 'calf'] },
  setter: { label: 'Связующий', priorities: 'Лопатка и плечо, стопа, контроль таза при боковых перемещениях', families: ['rotator', 'foot', 'hipControl'] },
  libero: { label: 'Либеро', priorities: 'Таз и приводящие, корпус, стопа и голеностоп', families: ['hipControl', 'foot', 'calf'] },
  general: { label: 'Амплуа не указано', priorities: 'Голень, плечевой пояс и контроль таза; уточнить амплуа', families: ['calf', 'rotator', 'hipControl'] },
};
