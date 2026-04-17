import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const result = await query(
      `SELECT preferred_location, work_type, min_fit_percent
       FROM job_search_preferences
       WHERE user_id = $1`,
      [user.id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({
        preferences: { preferredLocation: '', workType: 'any', minFitPercent: 45 },
      });
    }

    const row = result.rows[0];
    return res.status(200).json({
      preferences: {
        preferredLocation: row.preferred_location || '',
        workType: row.work_type || 'any',
        minFitPercent: row.min_fit_percent ?? 45,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load preferences' });
  }
}
