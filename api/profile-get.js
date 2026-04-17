import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const result = await query(
      `SELECT summary, skills, years_experience, seniority, location, languages, raw_cv_text
       FROM candidate_profiles WHERE user_id = $1`,
      [user.id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({
        profile: {
          summary: '',
          skills: [],
          yearsExperience: 0,
          seniority: 'unknown',
          location: null,
          languages: [],
          rawCvText: null,
        },
      });
    }

    const row = result.rows[0];
    return res.status(200).json({
      profile: {
        summary: row.summary || '',
        skills: row.skills || [],
        yearsExperience: row.years_experience || 0,
        seniority: row.seniority || 'unknown',
        location: row.location || null,
        languages: row.languages || [],
        rawCvText: row.raw_cv_text || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
}
