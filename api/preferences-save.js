import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const ALLOWED_WORK_TYPES = new Set(['remote', 'hybrid', 'onsite', 'any']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = req.body || {};
  const preferredLocation = String(body.preferredLocation || '').trim().slice(0, 200);
  const workType = String(body.workType || 'any').toLowerCase();
  const minFitPercent = Math.max(0, Math.min(100, Number(body.minFitPercent ?? 45)));

  if (!ALLOWED_WORK_TYPES.has(workType)) {
    return res.status(400).json({ error: 'Invalid work type' });
  }

  try {
    await query(
      `INSERT INTO job_search_preferences (user_id, preferred_location, work_type, min_fit_percent, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         preferred_location = EXCLUDED.preferred_location,
         work_type = EXCLUDED.work_type,
         min_fit_percent = EXCLUDED.min_fit_percent,
         updated_at = NOW()`,
      [user.id, preferredLocation, workType, minFitPercent]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to save preferences' });
  }
}
