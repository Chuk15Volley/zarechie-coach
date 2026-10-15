import lowBack from './low-back-resilience.json' with { type: 'json' };
import knee from './knee-resilience.json' with { type: 'json' };
import { shoulderDefinitions } from './shoulder.mjs';
import { elbowDefinitions } from './elbow.mjs';
import { buildCourse, COURSE_ID, DEFAULT_RESTS, preventionError } from './model.mjs';

const definitions = [
  { source: lowBack, metadata: { id: COURSE_ID, title: 'Low Back Resilience', regionId: 'low-back', region: 'Поясница', sourceTitle: 'Low Back Resilience.pdf', defaultRests: DEFAULT_RESTS,
    importNotes: ['На стр. 35 в последнем занятии семь технических заглушек вместо подсказок и семь отсутствующих видеоссылок; названия Shin Box Rotation No Hands и Hip Hinge Arms Overhead отличаются от предыдущих занятий. Поля доступны для ручного исправления.', 'Дополнительный документ для поясничного курса пока не подключён.'],
  } },
  { source: knee, metadata: { id: 'knee-resilience', title: 'Knee Resilience', regionId: 'knee', region: 'Колено', sourceTitle: 'Knee Resilience.pdf', defaultRests: { ...DEFAULT_RESTS, D: 20, roundD: 30 },
    setRanges: { main: [3, 4], stretch: [2, 3], mobility: [2, 3] }, hasMobility: true,
    blockLabels: { A: 'Движение и контроль', B: 'Основной блок', C: 'Растяжка', D: 'Подвижность колена' },
    importNotes: ['Все 48 занятий перенесены с четырьмя упражнениями основного блока и диапазоном 3–4 подхода. Растяжка C и подвижность D включаются независимо.', 'В документе есть упражнение Quad Set с дозировкой 10 × 5 секунд: это десять отдельных удержаний, а не одно непрерывное удержание 50 секунд.', 'Все 480 строк упражнений имеют исходные видеоссылки. Названия, подсказки и ссылки доступны для ручного исправления.'],
    guidance: [
      { title: 'Подвижность колена', sourceTitle: 'Knee Resilience.pdf', pages: '15–16', text: 'Автор включает необязательный блок D для восстановления сгибания и разгибания колена. При полной подвижности этот блок можно не включать. Необходимость блока и комфортную амплитуду определяет тренер с учётом медицинских ограничений.' },
      { title: 'Контроль выполнения и повтор курса', sourceTitle: 'Supplemental Information.pdf', pages: '6', text: 'Автор предлагает оценивать изменения функции и дискомфорта, последовательность выполнения, усилие и используемую нагрузку. Повтор курса может быть полезен после индивидуальной оценки; в приложении он требует нового назначения тренером и не запускается автоматически.' },
      { title: 'Обращение за дополнительной помощью', sourceTitle: 'Supplemental Information.pdf', pages: '7', text: 'В документе перечислены поводы для индивидуальной медицинской оценки: новая острая неясная боль в груди или плече, сложный медицинский анамнез, длительная боль без облегчения, выраженная тревога или страх. Курс не заменяет обследование и медицинский допуск.' },
      { title: 'Дискомфорт и изменение дозировки', sourceTitle: 'Supplemental Information.pdf', pages: '9–11', text: 'Автор отдельно оговаривает обсуждение упражнений через боль с медицинским специалистом, переносимость дискомфорта, отсутствие усиления симптомов на следующий день и оценку изменений за более длительный период. Общая шкала из PDF не становится автоматическим разрешением тренироваться через боль. При ухудшении нужно обсудить дозировку с тренером; жалобы и ограничения остаются в ReadySix.' },
      { title: 'Общая активность и восстановление', sourceTitle: 'Knee Resilience.pdf; Supplemental Information.pdf', pages: '13; 13–15', text: 'В исходниках рассматриваются ходьба и общая активность, сон, суммарная тренировочная и бытовая нагрузка, питание и другие факторы восстановления. Фиксированная цель по шагам, дополнительная анкета состояния и отдельный расчёт готовности в этом разделе не создаются.' },
    ],
  } },
  ...shoulderDefinitions,
  ...elbowDefinitions,
];
export function courseDefinition(id = COURSE_ID) {
  const definition = definitions.find(row => row.metadata.id === id);
  if (!definition) throw preventionError('Программа профилактики не найдена.', 404);
  return definition;
}
export function preventionCourses() { return definitions.map(({ source, metadata }) => ({ id: metadata.id, title: metadata.title, regionId: metadata.regionId, region: metadata.region, author: 'E3 Rehab', sessions: source.length, phases: [...new Set(source.map(s => s.phase))], sourceTitle: metadata.sourceTitle })); }
export function registeredCourse(id = COURSE_ID, catalogue) { const { source, metadata } = courseDefinition(id); return buildCourse(source, catalogue, metadata); }
