import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

function sanitizeArray(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 200);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = req.body || {};
  const summary = String(body.summary || '').trim().slice(0, 5000);
  const skills = sanitizeArray(body.skills);
  const yearsExperience = Math.max(0, Math.min(70, Number(body.yearsExperience || 0)));
  const seniority = String(body.seniority || 'unknown').toLowerCase();
  const location = body.location ? String(body.location).trim().slice(0, 200) : null;
  const languages = sanitizeArray(body.languages);
  const rawCvText = body.rawCvText ? String(body.rawCvText).slice(0, 20000) : null;

  try {
    await query(
      `INSERT INTO candidate_profiles (user_id, summary, skills, years_experience, seniority, location, languages, raw_cv_text, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         summary = EXCLUDED.summary,
         skills = EXCLUDED.skills,
         years_experience = EXCLUDED.years_experience,
         seniority = EXCLUDED.seniority,
         location = EXCLUDED.location,
         languages = EXCLUDED.languages,
         raw_cv_text = EXCLUDED.raw_cv_text,
         updated_at = NOW()`,
      [user.id, summary, JSON.stringify(skills), yearsExperience, seniority, location, JSON.stringify(languages), rawCvText]
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to save profile' });
  }
}
