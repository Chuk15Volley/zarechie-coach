// Calendar-led in-season focus assignment. It intentionally contains no
// hard-coded season dates and no automatic "every fourth week" deload: those
// decisions require actual fatigue/load evidence or an explicit coach note.

function dayDistance(gameDate, date) {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${gameDate}T12:00:00Z`)) / 86400000);
}

function longTravel(note = '') {
  const text = String(note).toLowerCase();
  const hours = Number(text.match(/(\d+)\s*ч/)?.[1] || 0);
  const zones = Number(text.match(/(\d+)\s*(?:часов|\s*час)?\s*пояс/)?.[1] || 0);
  return hours > 3 || zones > 2 || /длинн|дальн/.test(text);
}

function explicitTaper(note = '') {
  return /тейпер|целевой турнир|пиков/.test(String(note).toLowerCase());
}

export function assignFocuses(days, calendarEvents = []) {
  if (!Array.isArray(days)) return days;
  const sorted = [...days].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const gameDates = [...new Set([
    ...sorted.filter(day => day.type === 'game').map(day => day.date),
    ...(Array.isArray(calendarEvents) ? calendarEvents : []).filter(event => event.type === 'game').map(event => event.date),
  ])].sort();

  const nearestOffset = date => {
    let best = null;
    for (const gameDate of gameDates) {
      const offset = dayDistance(gameDate, date);
      if (best == null || Math.abs(offset) < Math.abs(best)) best = offset;
    }
    return best;
  };

  return sorted.map(day => {
    if (day.type !== 'training') {
      const { focus, ...event } = day;
      return event;
    }
    if (explicitTaper(day.note)) return { ...day, focus: 'inseason_taper' };
    if (longTravel(day.note)) return { ...day, focus: 'inseason_prophylaxis' };

    const offset = nearestOffset(day.date);
    if (offset === 1 || offset === 2 || offset === 0) return { ...day, focus: 'inseason_prophylaxis' };
    if (offset === -1) return { ...day, focus: 'inseason_md1_activation' };
    if (offset === -2) return { ...day, focus: 'inseason_power' };
    if (offset != null && offset <= -3) return { ...day, focus: 'inseason_strength' };
    if (offset != null && offset >= 3) return { ...day, focus: day.focus || 'inseason_strength' };
    return { ...day, focus: day.focus || 'inseason_strength' };
  });
}
