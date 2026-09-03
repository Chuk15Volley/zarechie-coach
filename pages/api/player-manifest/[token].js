// Dynamic Web App Manifest per player token.
// Every installed surface keeps the shared NK identity while opening the
// player's private session URL directly.

export default function handler(req, res) {
  const { token } = req.query;
  const tokenValue = Array.isArray(token) ? token[0] : token;

  const manifest = {
    id: `/player/${tokenValue}`,
    name: 'NK TEAM SYSTEM',
    short_name: 'NK TEAM SYSTEM',
    description: 'NK TEAM SYSTEM · Strength & Conditioning',
    start_url: `/player/${tokenValue}`,
    scope: '/player/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#050b12',
    theme_color: '#050b12',
    orientation: 'portrait-primary',
    categories: ['fitness', 'sports', 'health'],
    icons: [
      { src: '/icons/nk-team-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/nk-team-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/nk-team-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Тренировка', short_name: 'Тренировка', url: `/player/${tokenValue}`, icons: [{ src: '/icons/nk-team-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'История', short_name: 'История', url: `/player/${tokenValue}#history`, icons: [{ src: '/icons/nk-team-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json(manifest);
}
