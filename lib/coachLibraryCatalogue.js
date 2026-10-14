import {redis,redisPipeline} from './redis';
import {getAllCards,normalize} from './exerciseLibrary';
import {EXERCISE_BANK,findExerciseUrl} from './exerciseBank';
import {isCoachBannedExercise} from './exerciseRestrictions';
function legacySlug(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

function isBannedLibraryExercise(name) {
  return isCoachBannedExercise(name) || /incline push[ -]?up|наклонн.*отжим/i.test(name || '');
}

// SCAN helper — follows cursor to collect all matching keys.
async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const res = await redis('scan', cursor, 'match', pattern, 'count', '200').catch(() => null);
    if (!Array.isArray(res)) break;
    cursor = String(res[0]);
    (res[1] || []).forEach(k => keys.push(k));
  } while (cursor !== '0');
  return keys;
}

export async function coachLibraryCards(){
    const cards = await getAllCards();
    const listById = new Map();

    for (const item of EXERCISE_BANK) {
      if (isBannedLibraryExercise(item.n)) continue;
      const { canonicalId } = normalize(item.n);
      if (!canonicalId || listById.has(canonicalId)) continue;
      listById.set(canonicalId, {
        canonicalId,
        title: item.n,
        hasImage: false,
        video: item.u || null,
        autoVideo: item.u || null,
        category: '',
        createdAt: null,
        updatedAt: null,
        source: 'bank',
      });
    }

    cards.forEach(c => {
      if (isBannedLibraryExercise(c.title || c.canonicalId)) return;
      const existing = listById.get(c.canonicalId);
      listById.set(c.canonicalId, {
        canonicalId: c.canonicalId,
        title: c.title || existing?.title || c.canonicalId,
        hasImage: !!c.image,
        video: c.video || existing?.video || null,
        autoVideo: existing?.autoVideo || null,
        category: c.category || '',
        createdAt: c.createdAt || null,
        updatedAt: c.updatedAt || null,
        source: existing?.source === 'bank' ? 'bank+custom' : 'custom',
      });
    });

    const list = Array.from(listById.values());

    // Step 1: yt-manual by legacySlug (migrated together, slugs match).
    const needAuto = list.filter(c => !c.video);
    if (needAuto.length) {
      const ytManualCmds = needAuto.map(c => ['GET', `exercise:yt-manual:${legacySlug(c.title)}`]);
      const ytManualResults = await redisPipeline(ytManualCmds).catch(() => []);
      needAuto.forEach((c, i) => { if (ytManualResults[i]) c.autoVideo = ytManualResults[i]; });
    }

    // Step 2: exercise:yt:* auto-search cache matched by canonicalId — NOT by slug.
    // Slug-based matching fails because the exercise name in the program may use different
    // word order than the name stored in ex:lib (e.g. "прыжок на ящик двусторонний"
    // vs "Двусторонний прыжок на ящик"). Normalising both to the same sorted token set
    // guarantees a match regardless of word order.
    const stillNeed = list.filter(c => !c.video && !c.autoVideo);
    if (stillNeed.length) {
      const ytKeys = await scanKeys('exercise:yt:*');
      if (ytKeys.length) {
        const ytUrls = await redisPipeline(ytKeys.map(k => ['GET', k])).catch(() => []);
        // Build { canonicalId → url } from every non-'none' auto-search cache entry.
        const ytByCanon = {};
        ytKeys.forEach((key, i) => {
          const url = ytUrls[i];
          if (!url || url === 'none') return;
          const slug = key.slice('exercise:yt:'.length);
          const { canonicalId } = normalize(slug.replace(/-/g, ' '));
          if (!ytByCanon[canonicalId]) ytByCanon[canonicalId] = url;
        });
        stillNeed.forEach(c => {
          if (ytByCanon[c.canonicalId]) c.autoVideo = ytByCanon[c.canonicalId];
        });
      }
    }

    // Step 3: static exercise bank — covers 1565 well-known exercises.
    for (const c of list) {
      if (!c.video && !c.autoVideo && c.title) {
        const bankUrl = findExerciseUrl(c.title);
        if (bankUrl) c.autoVideo = bankUrl;
      }
    }

    // Newest first when timestamps are available.
    list.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return list;
}
