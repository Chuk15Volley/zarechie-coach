// pages/api/exercises/dedupe.js
// GET → { groups: [{ cards: [{ canonicalId, title, hasImage }], suggestedKeepId }] }
// Coach-facing: clusters near-duplicate library cards by token Jaccard similarity.

import { isAuthorized } from '../../../lib/auth';
import { getAllCards, normalize } from '../../../lib/exerciseLibrary';

const THRESHOLD = 0.75;

function tokenSet(str) {
  return new Set(String(str || '').split(' ').filter(Boolean));
}

function jaccard(aSet, bSet) {
  if (!aSet.size && !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cards = await getAllCards();
  const n = cards.length;

  // Precompute normalised token sets per card.
  const sets = cards.map(c => tokenSet(normalize(c.title || c.canonicalId).normName));

  // Union-find over near-duplicate pairs.
  const parent = cards.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccard(sets[i], sets[j]) >= THRESHOLD) union(i, j);
    }
  }

  // Collect clusters with more than one member.
  const clusters = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    (clusters[root] = clusters[root] || []).push(i);
  }

  const groups = [];
  for (const members of Object.values(clusters)) {
    if (members.length < 2) continue;
    const groupCards = members.map(i => ({
      canonicalId: cards[i].canonicalId,
      title: cards[i].title || cards[i].canonicalId,
      hasImage: !!cards[i].image,
    }));
    const withImage = groupCards.find(c => c.hasImage);
    groups.push({
      cards: groupCards,
      suggestedKeepId: (withImage || groupCards[0]).canonicalId,
    });
  }

  return res.status(200).json({ groups });
}
