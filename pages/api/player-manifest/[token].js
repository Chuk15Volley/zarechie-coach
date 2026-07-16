// Dynamic Web App Manifest per player token.
// Gives each player a standalone PWA that opens directly to their session URL.
export default function handler(req, res) {
  const { token } = req.query;
  const tokenValue = Array.isArray(token) ? token[0] : token;
  const playerIcon = `/api/player-photo/${encodeURIComponent(tokenValue || '')}`;

  const manifest = {
    name: 'Korenchuk Performance - Моя тренировка',
    short_name: 'KP System',
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
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json(manifest);
}
