import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';
import bcrypt from 'bcryptjs';

function sanitizeArray(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 200);
}

export default async function handler(req, res) {
  const { action } = req.query;
  const user = await requireAuth(req, res);
  if (!user) return;

  if (action === 'profile-get') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const result = await query(
        `SELECT summary, primary_role, skills, years_experience, seniority, location, languages, raw_cv_text
         FROM candidate_profiles WHERE user_id = $1`,
        [user.id]
      );
      if (result.rowCount === 0) {
        return res.status(200).json({
          profile: { summary: '', skills: [], yearsExperience: 0, seniority: 'unknown', location: null, languages: [], rawCvText: null },
        });
      }
      const row = result.rows[0];
      return res.status(200).json({
        profile: {
          summary: row.summary || '',
          primaryRole: row.primary_role || '',
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

  if (action === 'profile-save') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const summary = String(body.summary || '').trim().slice(0, 5000);
    const skills = sanitizeArray(body.skills);
    const yearsExperience = Math.max(0, Math.min(70, Number(body.yearsExperience || 0)));
    const seniority = String(body.seniority || 'unknown').toLowerCase();
    const location = body.location ? String(body.location).trim().slice(0, 200) : null;
    const languages = sanitizeArray(body.languages);
    const rawCvText = body.rawCvText ? String(body.rawCvText).slice(0, 20000) : null;
    const primaryRole = String(body.primaryRole || '').trim().slice(0, 200);
    try {
      await query(
        `INSERT INTO candidate_profiles (user_id, summary, primary_role, skills, years_experience, seniority, location, languages, raw_cv_text, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           summary = EXCLUDED.summary, primary_role = EXCLUDED.primary_role, skills = EXCLUDED.skills,
           years_experience = EXCLUDED.years_experience, seniority = EXCLUDED.seniority,
           location = EXCLUDED.location, languages = EXCLUDED.languages,
           raw_cv_text = EXCLUDED.raw_cv_text, updated_at = NOW()`,
        [user.id, summary, primaryRole, JSON.stringify(skills), yearsExperience, seniority, location, JSON.stringify(languages), rawCvText]
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to save profile' });
    }
  }

  if (action === 'preferences-get') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const result = await query(
        `SELECT preferred_location, work_type, min_fit_percent, english_only
         FROM job_search_preferences WHERE user_id = $1`,
        [user.id]
      );
      if (result.rowCount === 0) {
        return res.status(200).json({ preferences: { preferredLocation: '', workType: 'any', minFitPercent: 45 } });
      }
      const row = result.rows[0];
      return res.status(200).json({
        preferences: {
          preferredLocation: row.preferred_location || '',
          workType: row.work_type || 'any',
          minFitPercent: row.min_fit_percent ?? 45,
          englishOnly: !!row.english_only,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load preferences' });
    }
  }

  if (action === 'preferences-save') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const preferredLocation = String(body.preferredLocation || '').trim().slice(0, 200);
    const workType = String(body.workType || 'any').toLowerCase();
    const minFitPercent = Math.max(0, Math.min(100, Number(body.minFitPercent ?? 45)));
    const ALLOWED_WORK_TYPES = new Set(['remote', 'hybrid', 'onsite', 'any']);
    if (!ALLOWED_WORK_TYPES.has(workType)) return res.status(400).json({ error: 'Invalid work type' });
    const englishOnly = !!body.englishOnly;
    try {
      await query(
        `INSERT INTO job_search_preferences (user_id, preferred_location, work_type, min_fit_percent, english_only, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           preferred_location = EXCLUDED.preferred_location, work_type = EXCLUDED.work_type,
           min_fit_percent = EXCLUDED.min_fit_percent, english_only = EXCLUDED.english_only, updated_at = NOW()`,
        [user.id, preferredLocation, workType, minFitPercent, englishOnly]
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to save preferences' });
    }
  }

  // NEW: Update name + email
  if (action === 'account-update') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const name = body.name ? String(body.name).trim().slice(0, 200) : null;
    const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 254) : null;

    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    try {
      const existing = await query(
        'SELECT id FROM app_users WHERE email = $1 AND id != $2',
        [email, user.id]
      );
      if (existing.rowCount > 0) {
        return res.status(409).json({ error: 'That email is already in use by another account' });
      }
      await query(
        'UPDATE app_users SET name = $1, email = $2 WHERE id = $3',
        [name, email, user.id]
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to update account' });
    }
  }

  // NEW: Change password
  if (action === 'password-update') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new passwords are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
      const result = await query(
        'SELECT password_hash FROM app_users WHERE id = $1',
        [user.id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });

      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      const newHash = await bcrypt.hash(newPassword, 12);
      await query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to update password' });
    }
  }

  return res.status(404).json({ error: 'User-data action not found' });
}
