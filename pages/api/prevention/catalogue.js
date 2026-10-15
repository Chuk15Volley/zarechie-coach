import { isAuthorized, coachAuditActor } from '../../../lib/auth';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { loadCourse, saveCourse } from '../../../lib/prevention/store';
import { preventionCourses } from '../../../lib/prevention/catalogue.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!await enforceRateLimit(req, res, { scope: 'prevention-catalogue', limit: 120, windowSeconds: 600 })) return;
  const input = req.method === 'GET' ? req.query : req.body || {};
  try {
    const course = req.method === 'GET' ? (await loadCourse(input.workspace, input.courseId)).course : await saveCourse(input.workspace, input, coachAuditActor(req));
    return res.status(200).json({ course, courses: preventionCourses() });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Не удалось загрузить или сохранить курс профилактики.' }); }
}
