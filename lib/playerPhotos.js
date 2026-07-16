import { redisPipeline } from './redis';
import { playerPhotoKey } from './workspacePrefix';

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
  if (s.startsWith('data:image/')) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
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

function idVariants(playerId) {
  const raw = String(playerId || '').trim();
  if (!raw) return [];
  const variants = [raw];
  if (raw.startsWith('whoop_')) variants.push(raw.replace(/^whoop_/, ''));
  else if (/^\d+$/.test(raw)) variants.push(`whoop_${raw}`);
  return [...new Set(variants)];
}

export async function hydratePlayerPhotos(players, workspace = 'zarechie') {
  const list = Array.isArray(players) ? players : [];
  if (!list.length) return [];

  const raws = await redisPipeline(
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

  const hydrated = list.map((p, i) => {
    const variants = idVariants(p.id);
    const step = stepFor(p);
    const slice = raws.slice(offset, offset + step);
    offset += step;

    const local = slice.find(Boolean) || null;
    const source = extractPlayerPhoto(p);
    const photo = local || source || null;
    if (photo) {
      for (const id of variants) {
        writes.push(['set', playerPhotoKey(workspace, id), photo]);
        if (workspace === 'zarechie') writes.push(['set', legacyPlayerPhotoKey(id), photo]);
      }
    }
    return { ...p, photo };
  });

  if (writes.length) redisPipeline(writes).catch(() => {});
  return hydrated;
}
