// pages/api/programs/generate.js
// POST { playerId, days=14, focus, notes } → AI-generated gym training program
// Uses the same player data as the zarechie dashboard (WHOOP, surveys, neuro tests).

import { getPlayerSnapshot } from '../../../lib/playerData';
import { isAuthorized } from '../../../lib/auth';

const FOCUS_LABELS = {
  preseason: 'предсезонная подготовка — база силы и объёма',
  inseason: 'игровой период — поддержание формы, минимизация утомления',
  power: 'развитие взрывной силы и прыжка',
  strength: 'максимальная силовая база',
  rehab: 'возврат после травмы / разгрузка',
};

function avg(arr) {
  const vals = arr.filter(v => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function summarizeSnapshot(snap) {
  const { player, whoop, surveys, morning, neuro, periodDays } = snap;

  const recovery = avg(whoop.map(d => d.recovery));
  const hrv = avg(whoop.map(d => d.hrv));
  const rhr = avg(whoop.map(d => d.rhr));
  const sleepHours = avg(whoop.map(d => d.sleep_hours));
  const strain = avg(whoop.map(d => d.strain));

  const srpe = avg(surveys.map(d => d.srpe));
  const fatigue = avg(surveys.map(d => d.fatigue));
  const soreness = avg(surveys.map(d => d.soreness));
  const recentInjury = surveys.find(d => d.hasInjury);

  const mws = avg(morning.map(d => d.mws));
  const sleepQuality = avg(morning.map(d => d.sleep));
  const stress = avg(morning.map(d => d.stress));
  const doms = avg(morning.map(d => d.doms));

  const lines = [
    `Игрок: ${player.name}, позиция: ${player.position || 'не указана'}`,
    `Период анализа: последние ${periodDays} дней`,
    '',
    'WHOOP (средние значения за период):',
    `• Recovery: ${recovery != null ? recovery + '%' : 'нет данных'}`,
    `• ВСР (HRV): ${hrv != null ? hrv + ' мс' : 'нет данных'}`,
    `• Пульс покоя: ${rhr != null ? rhr + ' уд/мин' : 'нет данных'}`,
    `• Сон: ${sleepHours != null ? sleepHours + ' ч' : 'нет данных'}`,
    `• Strain: ${strain != null ? strain : 'нет данных'}`,
    '',
    'Вечерний опросник (средние значения):',
    `• sRPE: ${srpe != null ? srpe + '/10' : 'нет данных'}`,
    `• Усталость: ${fatigue != null ? fatigue + '/5' : 'нет данных'}`,
    `• Крепатура: ${soreness != null ? soreness + '/5' : 'нет данных'}`,
    recentInjury
      ? `• ⚠ Зафиксирована травма ${recentInjury.date}: область ${(recentInjury.injuryAreas || []).join(', ') || '—'}, боль ${recentInjury.pain_level}/10. ${recentInjury.injuryText || ''}`
      : '• Травм за период не зафиксировано',
    '',
    'Утренний чек-ин (средние значения):',
    `• MWS (Morning Wellness Score): ${mws != null ? mws + '%' : 'нет данных'}`,
    `• Качество сна: ${sleepQuality != null ? sleepQuality + '/5' : 'нет данных'}`,
    `• Стресс вне зала: ${stress != null ? stress + '/5' : 'нет данных'}`,
    `• Крепатура утром: ${doms != null ? doms + '/5' : 'нет данных'}`,
  ];

  if (neuro) {
    lines.push('', 'Нейромышечное тестирование (последние замеры):', JSON.stringify(neuro, null, 2));
  }

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен в переменных среды Vercel' });
  }

  const { playerId, days = 14, focus = 'inseason', notes = '' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const snapshot = await getPlayerSnapshot(String(playerId), Number(days) || 14);
  if (!snapshot) return res.status(404).json({ error: 'Player not found' });

  const dataSummary = summarizeSnapshot(snapshot);
  const focusLabel = FOCUS_LABELS[focus] || focus;

  const userPrompt = `${dataSummary}

Цель программы: ${focusLabel}
${notes ? `Дополнительные указания тренера: ${notes}` : ''}

Составь программу тренировок в тренажёрном зале на ближайшую неделю (микроцикл).`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: `Ты — элитный тренер по силовой и кондиционной подготовке (S&C) мирового уровня, специализирующийся на волейболе.
Составляешь программы тренировок в зале на основе объективных данных (WHOOP) и субъективных опросников игрока.

Принципы:
- Волейбол — взрывной вид спорта: приоритет на силу ног, прыжок, плиометрику, стабильность плеча и кора, профилактику травм колена/плеча/спины.
- Учитывай текущее восстановление и накопленное утомление: если Recovery/MWS низкие, sRPE/усталость высокие — снижай объём и интенсивность, не добавляй максимальные усилия.
- Если зафиксирована травма — программа должна её учитывать (избегать пострадавшей зоны, добавлять реабилитационные элементы).
- Учитывай игровой период (in-season — поддержание, не наращивание) vs межсезонье (можно строить объём/силу).
- Указывай конкретику: упражнения, подходы × повторения, % от 1ПМ или RPE-шкала, отдых между подходами, дни недели.
- Структура ответа: 1) Краткая оценка состояния игрока (2-3 предложения) → 2) Микроцикл по дням (название дня, упражнения с параметрами) → 3) Ключевые предостережения/на что обратить внимание тренеру в зале.
- Пиши на русском языке, профессиональным языком тренера, без избыточных вступлений.`,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const program = data.content?.[0]?.text || '';
    return res.status(200).json({ program, player: snapshot.player, dataSummary });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
