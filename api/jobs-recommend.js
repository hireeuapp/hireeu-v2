import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { searchJobsByRole } from './search-jobs.js';
import { matchAndScoreJobs } from './match-and-score.js';

function deriveRoleFromProfile(profile) {
  const skillSeed = Array.isArray(profile.skills) ? profile.skills.slice(0, 4).join(' ') : '';
  const summarySeed = String(profile.summary || '').split('.').slice(0, 1).join(' ');
  const senioritySeed = String(profile.seniority || '').toLowerCase();
  const combined = `${senioritySeed} ${skillSeed} ${summarySeed}`.trim();
  return combined || 'software engineer';
}

function matchesWorkType(job, workType) {
  if (workType === 'any') return true;
  const text = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  if (workType === 'remote') return job.isRemote === true || text.includes('remote');
  if (workType === 'hybrid') return text.includes('hybrid');
  if (workType === 'onsite') return !(job.isRemote === true) && !text.includes('remote');
  return true;
}

function matchesLocation(job, preferredLocation) {
  if (!preferredLocation) return true;
  return (job.location || '').toLowerCase().includes(preferredLocation.toLowerCase());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const profileResult = await query(
      `SELECT summary, skills, years_experience, seniority, location
       FROM candidate_profiles WHERE user_id = $1`,
      [user.id]
    );
    if (profileResult.rowCount === 0) {
      return res.status(400).json({ error: 'Profile not found. Upload and save your CV profile first.' });
    }
    const profile = profileResult.rows[0];

    const prefResult = await query(
      `SELECT preferred_location, work_type, min_fit_percent
       FROM job_search_preferences WHERE user_id = $1`,
      [user.id]
    );
    const prefs = prefResult.rowCount
      ? prefResult.rows[0]
      : { preferred_location: '', work_type: 'any', min_fit_percent: 45 };

    const roleQuery = deriveRoleFromProfile({
      summary: profile.summary,
      skills: profile.skills || [],
      seniority: profile.seniority || 'unknown',
    });

    const jobs = await searchJobsByRole(roleQuery);
    const scored = await matchAndScoreJobs(
      {
        summary: profile.summary || '',
        skills: profile.skills || [],
        yearsExperience: profile.years_experience || 0,
      },
      jobs,
      prefs.min_fit_percent ?? 45
    );

    const filtered = scored
      .filter((job) => matchesWorkType(job, prefs.work_type || 'any'))
      .filter((job) => matchesLocation(job, prefs.preferred_location || ''))
      .slice(0, 25);

    return res.status(200).json({
      results: filtered,
      meta: {
        roleQuery,
        totalScored: scored.length,
        returned: filtered.length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to recommend jobs' });
  }
}
