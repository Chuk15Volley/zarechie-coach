// Planning date and observation date are different facts. Tomorrow's calendar
// is authoritative for the session; today's ReadySix decision informs its draft.
export function readySixToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

const cap = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const minimum = values => {
  const known = values.map(cap).filter(value => value != null);
  return known.length ? Math.min(...known) : null;
};
const unique = values => [...new Set(values.filter(Boolean))];
const rank = { full: 0, insufficient_data: 1, modified: 2, limited: 3, individual_plan: 4, load_stop: 5 };

function mergeDecision(current, target) {
  if (!current) return target || null;
  if (!target) return current;
  const selected = (rank[target.recommendation] || 0) > (rank[current.recommendation] || 0)
    && target.recommendation !== 'insufficient_data' ? target : current;
  const targets = new Map((current.targets || []).map(item => [item.target, item]));
  for (const item of target.targets || []) {
    const before = targets.get(item.target);
    if (!before) { targets.set(item.target, item); continue; }
    const healthCapPercent = minimum([before.healthCapPercent ?? (before.planApplicability === 'not_planned' ? null : before.capPercent), item.healthCapPercent ?? (item.planApplicability === 'not_planned' ? null : item.capPercent)]);
    targets.set(item.target, { ...item, healthCapPercent,
      hardStopSignal: before.hardStopSignal === true || item.hardStopSignal === true,
      restrictions: unique([...(before.restrictions || []), ...(item.restrictions || [])]),
    });
  }
  return { ...selected,
    capPercent: minimum([current.capPercent, target.capPercent]),
    hardStopSignal: current.hardStopSignal === true || target.hardStopSignal === true,
    reasons: unique([...(current.reasons || []), ...(target.reasons || [])]),
    restrictions: unique([...(current.restrictions || []), ...(target.restrictions || [])]),
    targets: [...targets.values()],
  };
}

export function latestReadySixObservation(monitoring, asOfDate) {
  return ['whoop', 'morning', 'evening', 'postMorning', 'postEvening', 'overtraqHistory']
    .flatMap(key => Array.isArray(monitoring?.[key]) ? monitoring[key] : [])
    .map(row => row?.date).filter(date => typeof date === 'string' && date <= asOfDate)
    .sort().at(-1) || null;
}

export function combineReadySixPlanningContext(target, current) {
  const planning = { preliminary: true, targetDate: target.date, assessmentDate: current.date,
    assessmentRevision: current.revision || null, calendarRevision: target.revision || null,
    requiresDayOfReview: true };
  if (target.mode === 'team-readiness') {
    const players = new Map((current.players || []).map(row => [String(row.player?.id), row]));
    return { ...target, players: (target.players || []).map(row => {
      const observed = players.get(String(row.player?.id));
      return { ...row, monitoring: observed?.monitoring || row.monitoring,
        decision: mergeDecision(observed?.decision, row.decision),
        planning: { ...planning, latestObservationDate: latestReadySixObservation(observed?.monitoring || row.monitoring, current.date) },
      };
    }) };
  }
  return { ...target, monitoring: current.monitoring, decision: mergeDecision(current.decision, target.decision),
    planning: { ...planning, latestObservationDate: latestReadySixObservation(current.monitoring, current.date) } };
}
