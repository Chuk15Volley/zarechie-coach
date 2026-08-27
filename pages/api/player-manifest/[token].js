// Dynamic Web App Manifest per player token.
// Gives each player a standalone PWA that opens directly to their session URL.
import { getPlayerInfo } from '../../../lib/playerData';
import { resolveShareToken } from '../../../lib/shareToken';

export default async function handler(req, res) {
  const { token } = req.query;
  const tokenValue = Array.isArray(token) ? token[0] : token;
  const playerIcon = `/api/player-photo/${encodeURIComponent(tokenValue || '')}`;
  const resolved = await resolveShareToken(tokenValue).catch(() => null);
  const player = resolved?.playerId
    ? await getPlayerInfo(resolved.playerId, resolved.workspace).catch(() => null)
    : null;
  const playerName = String(player?.name || '').trim();

  const manifest = {
    id: `/player/${tokenValue}`,
    name: playerName ? `${playerName} · NK Coach` : 'Korenchuk Performance - Моя тренировка',
    short_name: playerName || 'KP System',
    description: 'Korenchuk Performance System · Strength & Conditioning',
    start_url: `/player/${tokenValue}`,
    scope: '/player/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#050b12',
    theme_color: '#050b12',
    orientation: 'portrait-primary',
    categories: ['fitness', 'sports', 'health'],
    icons: [
      { src: playerIcon, sizes: '512x512', purpose: 'any' },
      { src: playerIcon, sizes: '192x192', purpose: 'any' },
      { src: '/nk-logo.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Тренировка', short_name: 'Тренировка', url: `/player/${tokenValue}`, icons: [{ src: '/nk-logo.jpg', sizes: '192x192' }] },
      { name: 'История', short_name: 'История', url: `/player/${tokenValue}#history`, icons: [{ src: '/nk-logo.jpg', sizes: '192x192' }] },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json(manifest);
}
