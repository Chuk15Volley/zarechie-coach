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

export async function hydratePlayerPhotos(players, workspace = 'zarechie') {
  const list = Array.isArray(players) ? players : [];
  if (!list.length) return [];

  const raws = await redisPipeline(
    list.flatMap(p => {
      const id = String(p.id || '');
      const commands = [['get', playerPhotoKey(workspace, id)]];
      if (workspace === 'zarechie') commands.push(['get', legacyPlayerPhotoKey(id)]);
      return commands;
    })
  ).catch(() => []);

  const step = workspace === 'zarechie' ? 2 : 1;
  const writes = [];

  const hydrated = list.map((p, i) => {
    const local = raws[i * step] || null;
    const legacy = workspace === 'zarechie' ? raws[i * step + 1] || null : null;
    const source = extractPlayerPhoto(p);
    const photo = local || legacy || source || null;
    if (!local && photo) {
      writes.push(['set', playerPhotoKey(workspace, p.id), photo]);
    }
    return { ...p, photo };
  });

  if (writes.length) redisPipeline(writes).catch(() => {});
  return hydrated;
}

