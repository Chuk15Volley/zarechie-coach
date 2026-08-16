function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function secondsLabel(value) {
  const seconds = Number(value);
  if (seconds === 1) return '1 секунду';
  if (seconds >= 2 && seconds <= 4) return `${seconds} секунды`;
  return `${seconds} секунд`;
}

function secondsNominative(value) {
  const seconds = Number(value);
  if (seconds === 1) return '1 секунда';
  if (seconds >= 2 && seconds <= 4) return `${seconds} секунды`;
  return `${seconds} секунд`;
}

function tempoParts(tempo) {
  const normalized = clean(tempo)
    .toUpperCase()
    .replace(/СЕК(?:УНД[А-Я]*)?|SEC(?:ONDS?)?|S/g, '')
    .replace(/\s+/g, '');
  const match = normalized.match(/^(\d+|X)-(\d+|X)-(\d+|X)-(\d+|X)$/);
  return match ? match.slice(1) : null;
}

function movementKind(name) {
  const value = clean(name).toLowerCase();
  if (/jump|pogo|hop|bound|прыж/.test(value)) return 'jump';
  if (/throw|slam|chest pass|shot.?put|брос/.test(value)) return 'throw';
  if (/mobility|mobilization|stretch|foam roll|мфр|мобил|растяж|дыхани/.test(value)) return 'mobility';
  if (/carry|walk|march|перенос|ходьб|марш/.test(value)) return 'locomotion';
  if (/plank|hold|\biso\b|isometric|pallof|dead bug|bird.?dog|copenhagen|планк|удерж|изометр/.test(value)) return 'isometric';
  if (/row|pull.?up|chin.?up|face pull|pull.?apart|тяга|подтяг/.test(value)) return 'pull';
  if (/press|push.?up|жим|отжим/.test(value)) return 'press';
  if (/external rotation|internal rotation|shoulder rotation|наружн.*ротац|внутренн.*ротац/.test(value)) return 'rotation';
  if (/curl|сгибани/.test(value)) return 'curl';
  if (/extension|разгибани/.test(value)) return 'extension';
  if (/swing|high pull|snatch pull|clean pull|рывковая тяга|протяжк/.test(value)) return 'ballistic';
  return 'raise';
}

function loweringClause(kind, eccentric) {
  const timed = eccentric !== '0' && eccentric !== 'X';
  const duration = timed ? secondsLabel(eccentric) : '';
  if (kind === 'jump') return timed
    ? `опускайся в амортизацию ${duration}, сохраняя устойчивое положение`
    : 'опускайся в амортизацию быстро, сохраняя устойчивое положение';
  if (kind === 'throw') return timed ? `выполняй замах ${duration}` : 'выполняй замах под контролем';
  if (kind === 'pull') return timed ? `возвращайся в исходное положение ${duration}` : 'возвращайся в исходное положение под контролем';
  if (kind === 'press') return timed ? `опускай снаряд ${duration}` : 'опускай снаряд под контролем';
  if (kind === 'rotation') return timed ? `возвращай руку в исходное положение ${duration}` : 'возвращай руку в исходное положение под контролем';
  if (kind === 'curl') return timed ? `разгибай сустав ${duration}` : 'разгибай сустав под контролем';
  if (kind === 'extension') return timed ? `сгибай сустав ${duration}` : 'сгибай сустав под контролем';
  if (kind === 'mobility') return 'двигайся плавно в доступной амплитуде';
  if (kind === 'locomotion') return 'сохраняй контролируемый ритм движения';
  if (kind === 'isometric') return 'займи рабочее положение под контролем';
  if (kind === 'ballistic') return timed ? `опускай снаряд ${duration}` : 'опускай снаряд под контролем';
  return timed ? `опускайся вниз ${duration}` : 'опускайся вниз под контролем';
}

function pauseClause(kind, pause) {
  if (pause === '0' || pause === 'X') {
    return ['raise', 'jump'].includes(kind) ? 'без паузы внизу' : 'без паузы перед рабочей фазой';
  }
  const duration = secondsLabel(pause);
  return ['raise', 'jump'].includes(kind)
    ? `пауза внизу — ${secondsNominative(pause)}`
    : `удерживай рабочее положение ${duration}`;
}

function effortClause(kind) {
  if (kind === 'jump') return 'выпрыгивай вверх максимально резко';
  if (kind === 'throw') return 'бросай мяч максимально резко';
  if (kind === 'pull') return 'тяни максимально резко, не теряя положения корпуса';
  if (kind === 'press') return 'выжимай максимально резко, сохраняя контроль';
  if (kind === 'rotation') return 'выполняй рабочую ротацию максимально активно, без рывка';
  if (kind === 'curl') return 'сгибай сустав максимально резко, сохраняя контроль';
  if (kind === 'extension') return 'разгибай сустав максимально резко, сохраняя контроль';
  if (kind === 'mobility') return 'возвращайся в исходное положение активно, без рывка';
  if (kind === 'locomotion') return 'каждый шаг выполняй максимально активно';
  if (kind === 'isometric') return 'напряжение создавай максимально резко и удерживай положение';
  if (kind === 'ballistic') return 'разгоняй снаряд максимально резко';
  return 'поднимайся вверх максимально резко';
}

export function tempoDescription(tempo, exerciseName = '') {
  const value = clean(tempo);
  const kind = movementKind(exerciseName);
  const parts = tempoParts(value);
  if (parts) {
    const [eccentric, bottomPause, , topPause] = parts;
    if (kind === 'isometric') {
      const hold = bottomPause !== '0' && bottomPause !== 'X'
        ? secondsLabel(bottomPause)
        : 'заданное время';
      return `Темп: займи рабочее положение под контролем; напряжение создавай максимально резко; удерживай положение ${hold}.`;
    }
    const clauses = [
      loweringClause(kind, eccentric),
      pauseClause(kind, bottomPause),
      effortClause(kind),
    ];
    if (topPause !== '0' && topPause !== 'X') {
      clauses.push(`зафиксируй конечное положение на ${secondsLabel(topPause)}`);
    }
    return `Темп: ${clauses.join('; ')}.`;
  }

  const lower = value.toLowerCase();
  if (/реактив|взрыв|максимально быстро/.test(lower)) {
    return `Темп: ${loweringClause(kind, 'X')}; ${pauseClause(kind, '0')}; ${effortClause(kind)}.`;
  }
  if (/изометр|\biso\b|удерж/.test(lower) || kind === 'isometric') {
    return `Темп: займи рабочее положение под контролем; напряжение создавай максимально резко; удерживай положение заданное время.`;
  }
  if (/контрол/.test(lower)) {
    return `Темп: ${loweringClause(kind, '0')}; без лишней паузы; ${effortClause(kind)}.`;
  }
  return `Темп: ${loweringClause(kind, '0')}; ${pauseClause(kind, '0')}; ${effortClause(kind)}.`;
}

export function stripTempoDescription(cue) {
  return clean(cue)
    .replace(/^темп\s*[:—-]\s*[^.?!]*(?:[.?!]\s*)?/i, '')
    .trim();
}

function generatedExerciseDescription(exercise = {}) {
  const technique = stripTempoDescription(exercise.cue || exercise.coaching_note || '');
  return `${tempoDescription(exercise.tempo, exercise.name)}${technique ? ` ${technique}` : ''}`.trim();
}

export function exerciseDescription(exercise = {}) {
  if (typeof exercise.descriptionOverride === 'string') {
    return exercise.descriptionOverride;
  }
  return generatedExerciseDescription(exercise);
}

export function normalizeSessionTempoDescriptions(session) {
  if (!session?.blocks) return session;
  return {
    ...session,
    blocks: session.blocks.map(block => ({
      ...block,
      exercises: (block.exercises || []).map(exercise => ({
        ...exercise,
        cue: generatedExerciseDescription(exercise),
      })),
    })),
  };
}
