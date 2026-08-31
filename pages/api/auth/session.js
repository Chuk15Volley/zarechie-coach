import { isAuthorized, setSessionCookie } from '../../../lib/auth.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) return res.status(401).json({ authenticated: false });
  // Sliding renewal keeps an actively used coach session alive. The credential
  // remains HttpOnly and is rotated on every successful heartbeat.
  setSessionCookie(res);
  return res.status(200).json({ authenticated: true, role: 'coach' });
}
