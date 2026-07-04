// lib/monthPlanner.js
// Auto-assigns focus codes to training days for a monthly schedule.
// Input/output: array of day objects { date, type, focus?, note? }.
// type: "game" | "travel" | "rest" | "training"

// Taper windows (10 days before each peak). [start, end] inclusive ISO dates.
const TAPER_WINDOWS = [
  ['2025-12-18', '2025-12-28'], // Суперкубок (конец декабря)
  ['2026-01-06', '2026-01-16'], // Кубок России (середина января)
  ['2026-04-01', '2026-04-30'], // плей-офф (апрель)
];

function parseTravelNote(note) {
  if (!note) return { long: false };
  const text = String(note).toLowerCase();
  const hours = text.match(/(\d+)\s*ч/);
  const zones = text.match(/(\d+)\s*(?:часов|час)?\s*пояс/);
  const long =
    (hours && parseInt(hours[1], 10) > 3) ||
    (zones && parseInt(zones[1], 10) > 2) ||
    /длинн|дальн/.test(text);
  return { long: !!long };
}

function isInTaper(dateStr) {
  return TAPER_WINDOWS.some(([a, b]) => dateStr >= a && dateStr <= b);
}

// Returns array of {focus} assignments for each training day.
export function assignFocuses(days) {
  if (!Array.isArray(days)) return days;

  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const gameDates = sorted.filter(d => d.type === 'game').map(d => d.date);

  // MD offset: signed day distance to nearest game (negative = before, positive = after).
  // Returns null if no game in the month.
  function mdOffset(dateStr) {
    if (!gameDates.length) return null;
    let best = null;
    for (const g of gameDates) {
      const diff = Math.round(
        (Date.parse(dateStr + 'T12:00:00Z') - Date.parse(g + 'T12:00:00Z')) / 86400000
      );
      if (best === null || Math.abs(diff) < Math.abs(best)) best = diff;
    }
    return best;
  }

  // Deload wave 3:1 — count ISO weeks that contain at least one training day,
  // every 4th loaded week becomes a deload week.
  const weekKey = dateStr => {
    const d = new Date(dateStr + 'T12:00:00Z');
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().slice(0, 10);
  };
  const trainingWeeks = [];
  for (const d of sorted) {
    if (d.type === 'training') {
      const wk = weekKey(d.date);
      if (!trainingWeeks.includes(wk)) trainingWeeks.push(wk);
    }
  }
  const deloadWeeks = new Set(trainingWeeks.filter((_, i) => (i + 1) % 4 === 0));

  // Phase by month: February → accumulation; March/April (pre-taper) → conversion.
  function phaseForMonth(dateStr) {
    const month = dateStr.slice(5, 7);
    if (month === '02') return 'inseason_accumulation';
    if (month === '03' || month === '04') return 'inseason_conversion';
    return null;
  }

  return sorted.map((day, idx) => {
    if (day.type !== 'training') {
      const { focus, ...rest } = day;
      return rest;
    }

    // 1. Deload week overrides everything — whole week is deload.
    const wk = weekKey(day.date);
    if (deloadWeeks.has(wk)) return { ...day, focus: 'inseason_deload' };

    // 2. Taper window.
    if (isInTaper(day.date)) return { ...day, focus: 'inseason_taper' };

    // 3. Long travel day → light activation only.
    if (day.note && parseTravelNote(day.note).long) {
      return { ...day, focus: 'inseason_prophylaxis' };
    }

    const off = mdOffset(day.date);

    // 4. MD-relative assignment when a game anchors the day.
    if (off !== null) {
      if (off === -1) return { ...day, focus: 'inseason_prophylaxis' }; // MD-1 активация
      if (off === -3) return { ...day, focus: 'inseason_power' };       // MD-3
      if (off === 2) return { ...day, focus: 'inseason_prophylaxis' };  // MD+2
      // ≥3 days before game → strength is allowed (MD-4 and earlier).
      if (off <= -3) return { ...day, focus: 'inseason_strength' };
      if (off > 2) {
        const ph = phaseForMonth(day.date);
        return { ...day, focus: ph || 'inseason_strength' };
      }
      // Too close to game (MD-2) and no specific rule → light prophylaxis.
      return { ...day, focus: 'inseason_prophylaxis' };
    }

    // 5. No game anchor → use month phase, default to strength.
    const ph = phaseForMonth(day.date);
    return { ...day, focus: ph || 'inseason_strength' };
  });
}
