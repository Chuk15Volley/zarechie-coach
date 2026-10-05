export function medicalHoldReason(snapshot, state = {}, date = '') {
  const injuries = (snapshot.injuryLog || []).filter(row => row.status !== 'resolved' && (!row.date || row.date <= date));
  const text = JSON.stringify({ detail: state.detail, observations: state.observations, injuries });
  if (/FEVER|повышенн[а-я]* температур|лихорад|febrile/i.test(text)) return 'Повышенная температура: спортивная нагрузка не назначается до очной оценки и обновления допуска.';
  if (/запрет врача|врач[^.]{0,70}запрет|медицинск[^.]{0,50}противопоказ|подозрен[^.]{0,30}перелом|прогрессирующ[^.]{0,30}невр|нарушен[^.]{0,30}мочеиспуск|остр[^.]{0,30}травм/i.test(text)) return 'Медицинский сигнал: до очной оценки тренировочная нагрузка не назначается.';
  return '';
}

