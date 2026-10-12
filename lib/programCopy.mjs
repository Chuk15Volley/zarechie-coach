// Copy movement tasks, never another athlete's clinical context or load evidence.
export const validProgramWorkspace = value => ['zarechie','nkperf'].includes(value);
export function programCopySession(session) {
  return {
    kind: 'copied_training_draft',
    blocks: (session.blocks || []).map(block => ({
      ...Object.fromEntries(Object.entries(block).filter(([key]) => ['label','code','title','exerciseOrder','restSeconds','transitionRestSeconds','roundRestSeconds','rest_note','blockRestSeconds'].includes(key))),
      exercises: (block.exercises || []).map(ex => ({
        ...Object.fromEntries(Object.entries(ex).filter(([key]) => ['code','name','targetSets','tempo','cue','compactDescription','coaching_note','loadUnits','videoUrl','youtubeUrl','rest','restSeconds','rest_seconds','transitionRestSeconds','activeSecondsPerSet','controlledExecution'].includes(key))),
        weightKg: null,
        weightNote: /без веса|без отягощ|unloaded|bodyweight/i.test(`${ex.name} ${ex.weightNote || ''}`) ? 'Без отягощения; комфортная амплитуда. RPE 2–4; без отказа.' : 'Вес назначить индивидуально по фактической истории этого упражнения и текущей переносимости; вес другого игрока не переносится.',
        autoReg: 'Новая или усилившаяся боль, потеря техники — остановить подход и сообщить тренеру.',
        alternatives: [],
      })),
    })),
    assessment: 'Копия структуры программы для индивидуальной проверки тренером. Перед сохранением проверьте состояние ReadySix, ограничения, упражнения и дозировку получателя.',
  };
}
