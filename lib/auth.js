// lib/auth.js — same key as zarechie TRAINER_API_KEY (single-user tool, full access only)

export function isAuthorized(req) {
  return req.headers['x-api-key'] === process.env.TRAINER_API_KEY;
}
