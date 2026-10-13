import { generatedDraftKey } from '../../../lib/generatedDraft.mjs';
import { getPrehabReactions } from '../../../lib/prehabReactionStore';
import { parseSavedSession } from '../../../lib/sessionLabel';
// pages/api/programs/get.js
// GET ?playerId=&date= → previously saved (edited) session for that player+day, if any.
// Lets the UI offer "load the saved version" instead of always re-generating from scratch.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { sessionKey } from '../../../lib/workspacePrefix';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, workspace = 'zarechie' } = req.query || {};
  if (!playerId || !date) {
    return res.status(400).json({ error: 'playerId and date are required' });
  }

  try {
    const draftRaw = await redis('get', generatedDraftKey(workspace, playerId, date));
    const savedRaw = await redis('get', sessionKey(workspace, playerId, date));
    let draft = typeof draftRaw === 'string' ? JSON.parse(draftRaw) : draftRaw;
    let saved = typeof savedRaw === 'string' ? JSON.parse(savedRaw) : savedRaw;
    let draftOwner=String(playerId),savedOwner=String(playerId);
    // ReadySix uses numeric IDs; older player links and programs retain WHOOP IDs.
    // Read both editions without migrating records or rotating the player's link.
    const numeric=String(playerId).replace(/^whoop_/,'');
    if(/^\d+$/.test(numeric)){
      const alias=String(playerId)===numeric?'whoop_'+numeric:numeric;
      const [aliasDraftRaw,aliasSavedRaw]=await Promise.all([
        redis('get',generatedDraftKey(workspace,alias,date)),
        redis('get',sessionKey(workspace,alias,date)),
      ]);
      const parse=value=>typeof value==='string'?JSON.parse(value):value;
      const aliasDraft=parse(aliasDraftRaw),aliasSaved=parse(aliasSavedRaw);
      if(aliasDraft && (!draft || String(aliasDraft.generatedAt || '')>String(draft.generatedAt || ''))){draft=aliasDraft;draftOwner=alias;}
      if(aliasSaved && (!saved || String(aliasSaved.savedAt || aliasSaved.generatedAt || '')>String(saved.savedAt || saved.generatedAt || ''))){saved=aliasSaved;savedOwner=alias;}
    }
    const raw = draft && (!saved || draft.generatedAt > saved.savedAt) ? draft : saved;
    if (!raw) return res.status(200).json({ record: null });
    const { record } = raw?.draft ? { record: raw } : parseSavedSession(raw);
    const sourcePlayerId=raw===draft?draftOwner:savedOwner;
    if (record?.session) record.session = sanitizeUnavailableEquipmentExercises(record.session);
    if (record?.session?.kind === 'prehab_training_draft') {
      [record.prehabReaction] = await getPrehabReactions(sourcePlayerId, [date], workspace);
    }
    return res.status(200).json({ record:record?{...record,sourcePlayerId}:record });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
