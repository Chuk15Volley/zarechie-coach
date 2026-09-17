// Draft is a generation state, never the title of a coach-saved workout.
export function approvedProgramLabel(value) {
  return String(value || '')
    .replace(/индивидуальный черновик/gi, 'индивидуальная программа')
    .replace(/черновик\s*·\s*/gi, '')
    .replace(/черновик/gi, 'программа');
}

export function approvedProgramText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace('это черновик для согласования, не разрешение выполнить нагрузку.', 'программа проверена и сохранена тренером с учётом этих ограничений.')
    .replace('Черновик для согласования:', 'Программа проверена тренером:')
    .replace('До выполнения согласовать упражнения и допуск со штабом.', 'Выполнять в пределах указанных ограничений.')
    .replace('Это черновик для тренера, а не допуск к выполнению.', 'Программа проверена и сохранена тренером.');
}

export function approveProgramSession(session, approvedAt) {
  return {
    ...session,
    approval: { status: 'coach_approved', approvedAt, method: 'manual_save' },
    ...Object.fromEntries(['title', 'name', 'trainingLabel'].filter(key => typeof session[key] === 'string').map(key => [key, approvedProgramLabel(session[key])])),
    ...Object.fromEntries(['warnings', 'assessment', 'periodization_note'].filter(key => typeof session[key] === 'string').map(key => [key, approvedProgramText(session[key])])),
  };
}
