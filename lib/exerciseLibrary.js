// lib/exerciseLibrary.js
// Centralised exercise library: normalisation, fuzzy matching and CRUD over Redis.
//
// Redis schema (new):
//   ex:lib:{canonicalId}   HASH  → { title, image (data URL), video (YT URL), createdAt, updatedAt }
//   ex:alias               HASH  → { "<normName>" → canonicalId }
//   ex:index               SET   → { canonicalId, canonicalId, ... }
//
// Legacy keys (read-only fallback handled by the API routes):
//   exercise:manual:{slug}      STRING → base64 image
//   exercise:yt-manual:{slug}   STRING → YouTube URL

import { redis, redisPipeline } from './redis';

const RU_STOP_WORDS = new Set(['с', 'на', 'в', 'из', 'и', 'для', 'со', 'по', 'к', 'от', 'за']);

// ── normalize ────────────────────────────────────────────────────────────────
// Reduce an arbitrary exercise name to a stable normalised form + canonicalId.
//   "Присед с трэп-штангой (Trap Bar Squat)" → normName "присед трэп-штангой", id "присед-трэп-штангой"
export function normalize(name) {
  let s = (name || '').toLowerCase().trim();

  // Drop English translations in parentheses, e.g. "(Trap Bar Squat)" — any (...) containing latin chars.
  s = s.replace(/\([^)]*[a-z][^)]*\)/g, ' ');

  // Strip punctuation (keep cyrillic, latin, digits and spaces), collapse whitespace.
  s = s.replace(/[^a-zа-яё0-9\s]+/gi, ' ').replace(/\s+/g, ' ').trim();

  // Tokenise, drop RU stop words.
  let tokens = s.split(' ').filter(t => t && !RU_STOP_WORDS.has(t));

  // Sort tokens so word order doesn't matter.
  tokens.sort();

  const normName = tokens.join(' ');
  const canonicalId = normName.replace(/\s+/g, '-');

  return { normName, canonicalId };
}

// ── fuzzy helpers ────────────────────────────────────────────────────────────
function tokenSet(str) {
  return new Set(str.split(' ').filter(Boolean));
}

function jaccard(aSet, bSet) {
  if (!aSet.size && !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

function trigrams(str) {
  const s = '  ' + str.replace(/\s+/g, ' ') + '  ';
  const grams = new Set();
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  return grams;
}

function diceTrigram(a, b) {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (!ga.size && !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

// fuzzyResolve(normName, allAliasKeys) → best matching alias key | null
// allAliasKeys are the normalised names stored in ex:alias.
export function fuzzyResolve(normName, allAliasKeys) {
  if (!normName || !Array.isArray(allAliasKeys) || !allAliasKeys.length) return null;
  const aTokens = tokenSet(normName);

  let best = null;
  let bestScore = 0;

  for (const key of allAliasKeys) {
    if (key === normName) return key; // exact, can't beat it
    const jac = jaccard(aTokens, tokenSet(key));
    const dice = diceTrigram(normName, key);
    if (jac >= 0.6 || dice >= 0.65) {
      const score = Math.max(jac, dice);
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
  }
  return best;
}

// ── HGETALL parsing ──────────────────────────────────────────────────────────
// Upstash returns HGETALL as a flat array ["field","val",...] (or sometimes an object).
function parseHash(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (!raw.length) return null;
    const obj = {};
    for (let i = 0; i < raw.length - 1; i += 2) obj[raw[i]] = raw[i + 1];
    return obj;
  }
  if (typeof raw === 'object') {
    return Object.keys(raw).length ? raw : null;
  }
  return null;
}

// ── resolveId ────────────────────────────────────────────────────────────────
// Map a free-form name → { canonicalId, isNew }. Registers the alias when seen for the first time.
export async function resolveId(name) {
  const { normName, canonicalId: derivedId } = normalize(name);

  // 1) exact alias hit
  const direct = await redis('hget', 'ex:alias', normName).catch(() => null);
  if (direct) return { canonicalId: direct, isNew: false };

  // 2) fuzzy match against existing aliases
  const aliasKeys = await redis('hkeys', 'ex:alias').catch(() => []);
  const matchKey = fuzzyResolve(normName, aliasKeys || []);
  if (matchKey) {
    const matchedId = await redis('hget', 'ex:alias', matchKey).catch(() => null);
    if (matchedId) {
      // Record this spelling as an alias of the matched card for next time.
      await redis('hset', 'ex:alias', normName, matchedId).catch(() => {});
      return { canonicalId: matchedId, isNew: false };
    }
  }

  // 3) brand new — register the alias for the derived id.
  await redis('hset', 'ex:alias', normName, derivedId).catch(() => {});
  return { canonicalId: derivedId, isNew: true };
}

// ── getCard ──────────────────────────────────────────────────────────────────
export async function getCard(canonicalId) {
  const raw = await redis('hgetall', `ex:lib:${canonicalId}`).catch(() => null);
  return parseHash(raw);
}

// ── setImage ─────────────────────────────────────────────────────────────────
export async function setImage(name, imageData) {
  const { canonicalId } = await resolveId(name);
  const ts = String(Date.now());
  const existing = await getCard(canonicalId);
  const createdAt = existing?.createdAt || ts;

  await redisPipeline([
    ['HSET', `ex:lib:${canonicalId}`, 'image', imageData, 'title', name, 'createdAt', createdAt, 'updatedAt', ts],
    ['SADD', 'ex:index', canonicalId],
  ]);
  return canonicalId;
}

// ── setVideo ─────────────────────────────────────────────────────────────────
// overwrite=false → don't clobber an existing video (e.g. a trainer's manual link).
export async function setVideo(name, url, { overwrite = true } = {}) {
  const { canonicalId } = await resolveId(name);
  const ts = String(Date.now());
  const existing = await getCard(canonicalId);

  // Don't overwrite a trainer's manual choice with an automatic one.
  if (!overwrite && existing?.video) return canonicalId;

  const createdAt = existing?.createdAt || ts;

  await redisPipeline([
    ['HSET', `ex:lib:${canonicalId}`, 'video', url, 'title', name, 'createdAt', createdAt, 'updatedAt', ts],
    ['SADD', 'ex:index', canonicalId],
  ]);
  return canonicalId;
}

// ── deleteImage / deleteVideo ────────────────────────────────────────────────
export async function deleteImage(name) {
  const { canonicalId } = await resolveId(name);
  await redis('hdel', `ex:lib:${canonicalId}`, 'image').catch(() => {});
}

export async function deleteVideo(name) {
  const { canonicalId } = await resolveId(name);
  await redis('hdel', `ex:lib:${canonicalId}`, 'video').catch(() => {});
}

// ── getAllCards ──────────────────────────────────────────────────────────────
export async function getAllCards() {
  const ids = await redis('smembers', 'ex:index').catch(() => []);
  if (!ids || !ids.length) return [];

  const results = await redisPipeline(ids.map(id => ['HGETALL', `ex:lib:${id}`]));
  const cards = [];
  ids.forEach((id, i) => {
    const card = parseHash(results[i]);
    if (card) cards.push({ canonicalId: id, category: card.category || '', ...card });
  });
  return cards;
}

// ── setCategory ──────────────────────────────────────────────────────────────
export async function setCategory(canonicalId, category) {
  const ts = String(Date.now());
  await redis('hset', `ex:lib:${canonicalId}`, 'category', category || '', 'updatedAt', ts).catch(() => {});
  await redis('sadd', 'ex:index', canonicalId).catch(() => {});
}
