export default function CoachCompletedNotice({execution}) {
 return <details className="coach-execution-confirmed coach-completed-notice"><summary><span role="status">Выполнено · {execution.totalSets}/{execution.totalSets} · исходный план защищён</span></summary><p>{new Date(execution.completedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК. Редактирование, сохранение и перенос отключены. Факты дополняются отдельно в истории.</p></details>;
}
