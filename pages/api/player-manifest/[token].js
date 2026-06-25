// Dynamic Web App Manifest per player token.
// Gives each player a standalone PWA that opens directly to their session URL.
export default function handler(req, res) {
  const { token } = req.query;

  const manifest = {
    name: 'NK Coach — Моя тренировка',
    short_name: 'NK Coach',
    description: 'Nikolay Korenchuk · High Performance Coach',
    start_url: `/player/${token}`,
    scope: `/player/${token}`,
    display: 'standalone',
    background_color: '#07101a',
    theme_color: '#07101a',
    orientation: 'portrait-primary',
    icons: [
      { src: '/nk-logo.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'any' },
      { src: '/nk-logo.jpg', sizes: '192x192', type: 'image/jpeg', purpose: 'any' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json(manifest);
}
