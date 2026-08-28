import crypto from 'node:crypto';
import { redisPipeline } from './redis.js';
import { playerPhotoKey } from './workspacePrefix.js';
import { decodeImageDataUrl } from './imageData.js';

const PHOTO_FIELDS = [
  'photo',
  'photoUrl',
  'photo_url',
  'avatar',
  'avatarUrl',
  'avatar_url',
  'image',
  'imageUrl',
  'image_url',
  'picture',
  'pictureUrl',
  'picture_url',
  'profilePhoto',
  'profile_photo',
  'profilePhotoUrl',
  'profile_photo_url',
  'headshot',
  'headshotUrl',
  'headshot_url',
];

function validPhotoValue(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  if (s.startsWith('data:')) {
    try { decodeImageDataUrl(s); return s; } catch (_) { return null; }
  }
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && s.length <= 2048 ? s : null;
  } catch {
    return null;
  }
}

export function extractPlayerPhoto(record) {
  if (!record || typeof record !== 'object') return null;
  for (const field of PHOTO_FIELDS) {
    const direct = validPhotoValue(record[field]);
    if (direct) return direct;
  }
  for (const nestedKey of ['profile', 'media', 'player']) {
    const nested = record[nestedKey];
    if (nested && typeof nested === 'object') {
      const nestedPhoto = extractPlayerPhoto(nested);
      if (nestedPhoto) return nestedPhoto;
    }
  }
  return null;
}

export function legacyPlayerPhotoKey(playerId) {
  return `player:photo:${playerId}`;
}

export function playerPhotoPath(workspace, playerId, value = '') {
  const params = new URLSearchParams({
    playerId: String(playerId || ''),
    workspace: workspace === 'nkperf' ? 'nkperf' : 'zarechie',
  });
  if (value) {
    const version = crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
    params.set('v', version);
  }
  return `/api/players/photo?${params.toString()}`;
}

function idVariants(playerId) {
  const raw = String(playerId || '').trim();
  if (!raw) return [];
  const variants = [raw];
  if (raw.startsWith('whoop_')) variants.push(raw.replace(/^whoop_/, ''));
  else if (/^\d+$/.test(raw)) variants.push(`whoop_${raw}`);
  return [...new Set(variants)];
}

export async function hydratePlayerPhotos(players, workspace = 'zarechie', options = {}) {
  const list = Array.isArray(players) ? players : [];
  if (!list.length) return [];

  const pipeline = options.redisPipelineImpl || redisPipeline;

  const raws = await pipeline(
    list.flatMap(p => {
      const commands = [];
      for (const id of idVariants(p.id)) {
        commands.push(['get', playerPhotoKey(workspace, id)]);
        if (workspace === 'zarechie') commands.push(['get', legacyPlayerPhotoKey(id)]);
      }
      return commands;
    })
  ).catch(() => []);

  const stepFor = p => idVariants(p.id).length * (workspace === 'zarechie' ? 2 : 1);
  const writes = [];
  let offset = 0;

  const prepared = list.map(p => {
    const variants = idVariants(p.id);
    const step = stepFor(p);
    const slice = raws.slice(offset, offset + step);
    offset += step;

    const local = slice.map(validPhotoValue).find(Boolean) || null;
    const source = extractPlayerPhoto(p);
    if (!local && source) {
      for (const id of variants) {
        writes.push(['set', playerPhotoKey(workspace, id), source]);
        if (workspace === 'zarechie') writes.push(['set', legacyPlayerPhotoKey(id), source]);
      }
    }
    return { player: p, local, source };
  });

  let migrationSucceeded = true;
  if (writes.length) {
    try { await pipeline(writes); } catch (_) { migrationSucceeded = false; }
  }

  return prepared.map(({ player, local, source }) => {
    const value = local || source;
    if (!value) return { ...player, photo: null, hasPhoto: false };
    const photo = (local || migrationSucceeded)
      ? playerPhotoPath(workspace, player.id, value)
      : value;
    return { ...player, photo, hasPhoto: true };
  });
}
