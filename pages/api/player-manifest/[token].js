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
    name: playerName ? `${playerName} · NK Coach` : 'Korenchuk Performance - Моя тренировка',
    short_name: playerName || 'KP System',
    description: 'Korenchuk Performance System · Strength & Conditioning',
    start_url: `/player/${tokenValue}`,
    scope: `/player/${tokenValue}`,
    display: 'standalone',
    background_color: '#07101a',
    theme_color: '#07101a',
    orientation: 'portrait-primary',
    icons: [
      { src: playerIcon, sizes: '512x512', purpose: 'any maskable' },
      { src: playerIcon, sizes: '192x192', purpose: 'any maskable' },
      { src: '/nk-logo.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'any' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json(manifest);
}
