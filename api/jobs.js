import { searchJobsByRole } from '../lib/search-jobs-logic.js';
import { matchAndScoreJobs } from '../lib/match-logic.js';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

// Score a single job against a CV using Groq
async function scoreJobHelper(cv, job) {
  const prompt = `Recruiter view. Candidate CV: ${cv.slice(0, 2000)}. Job: ${job.title} at ${job.company}. Desc: ${job.description.slice(0, 800)}. Score 0-100 and reason. JSON only: {"score": 85, "reason": "fit", "missing_skills": []}`;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.1,
      }),
    });
    const d = await r.json();
    const parsed = JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
    return {
      ...job,
      score: parsed.score || 0,
      reason: parsed.reason || '',
      missing_skills: parsed.missing_skills || [],
    };
  } catch {
    return { ...job, score: 0, reason: 'Scoring failed.', missing_skills: [] };
  }
}

// Apply post-fetch filters based on user preferences
function applyPreferenceFilters(jobs, prefs) {
  return jobs.filter(j => {
    const loc = (j.location || '').toLowerCase();
    const isRemote = j.isRemote || loc.includes('remote');

    const wt = prefs.workType || 'any';
    if (wt === 'remote' && !isRemote) return false;
    if (wt === 'onsite' && isRemote) return false;
    if (wt === 'remote-eu' && !isRemote) return false;

    // Location filter: job must include the preferred city, or be remote
    const prefLoc = (prefs.preferredLocation || '').toLowerCase().trim();
    if (prefLoc && !isRemote && !loc.includes(prefLoc)) return false;

    return true;
  });
}

export default async function handler(req, res) {
  const { action } = req.query;

  // ── Search (simple role-based search, no auth required) ─────────────────
  if (action === 'search') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { role } = req.body;
    if (!role?.trim()) return res.status(400).json({ error: 'Missing role' });
    try {
      // FIX: searchJobsByRole returns { results, diagnostics } — was previously
      // assigned to `jobs` directly, causing "jobs is not iterable" errors.
      const { results: jobs, diagnostics } = await searchJobsByRole(role);
      return res.status(200).json({ jobs, diagnostics });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Recommend (personalised, auth required) ──────────────────────────────
  if (action === 'recommend') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      // 1. Load candidate profile
      const profileRes = await query(
        'SELECT summary, primary_role, skills, years_experience, seniority FROM candidate_profiles WHERE user_id = $1',
        [user.id]
      );
      if (!profileRes.rowCount) {
        return res.status(400).json({ error: 'Profile not found. Please complete your profile first.' });
      }
      const profile = profileRes.rows[0];

      // 2. Load saved preferences as baseline
      const prefRes = await query(
        `SELECT preferred_location, work_type, min_fit_percent, english_only,
                hide_citizenship, visa_sponsorship, spoken_languages, contract_type, seniority_pref
         FROM job_search_preferences WHERE user_id = $1`,
        [user.id]
      );
      const dbPrefs = prefRes.rows[0] || {};

      // 3. Merge: client-sent prefs override DB prefs
      const body = req.body || {};
      const prefs = {
        englishOnly:       body.englishOnly       ?? !!dbPrefs.english_only     ?? false,
        minFitPercent:     body.minFitPercent      ?? dbPrefs.min_fit_percent    ?? 45,
        preferredLocation: body.preferredLocation  ?? dbPrefs.preferred_location ?? '',
        workType:          body.workType           ?? dbPrefs.work_type          ?? 'any',
        hideCitizenship:   body.hideCitizenship    ?? !!dbPrefs.hide_citizenship ?? true,
        visaSponsorship:   body.visaSponsorship    ?? !!dbPrefs.visa_sponsorship ?? false,
        contractType:      body.contractType       ?? dbPrefs.contract_type      ?? 'any',
        seniorityPref:     body.seniorityPref      ?? dbPrefs.seniority_pref     ?? 'any',
      };

      const searchOptions = { englishOnly: prefs.englishOnly };

      // 4. Build role query, respecting seniority preference
      const baseRole = profile.primary_role || profile.skills?.[0] || 'Software Engineer';
      const seniorityLabel = (prefs.seniorityPref !== 'any' ? prefs.seniorityPref : profile.seniority) || '';
      const roleQuery = `${seniorityLabel} ${baseRole}`.trim();

      let { results: jobs, diagnostics } = await searchJobsByRole(roleQuery, searchOptions);

      // 5. Broaden if too few results
      if (jobs.length < 10) {
        const broaderRes = await searchJobsByRole(baseRole, searchOptions);

        if (jobs.length + broaderRes.results.length < 3) {
          const { results: fallbackJobs } = await searchJobsByRole('IT Specialist');
          broaderRes.results.push(...fallbackJobs);
        }

        const seenIds = new Set(jobs.map(j => j.id));
        for (const j of broaderRes.results) {
          if (!seenIds.has(j.id)) {
            jobs.push(j);
            seenIds.add(j.id);
          }
        }
        if (broaderRes.diagnostics) diagnostics = broaderRes.diagnostics;
      }

      // 6. Apply preference filters (location, work type)
      jobs = applyPreferenceFilters(jobs, prefs);

      // 7. Score and rank against candidate profile
      const scored = await matchAndScoreJobs(
        {
          summary: profile.summary,
          primaryRole: profile.primary_role,
          skills: profile.skills,
          yearsExperience: profile.years_experience,
        },
        jobs,
        prefs.minFitPercent
      );

      return res.status(200).json({ results: scored.slice(0, 20), diagnostics });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Score (batch score jobs against a raw CV) ────────────────────────────
  if (action === 'score') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { cv, jobs } = req.body;
    if (!jobs?.length || !cv) return res.status(400).json({ error: 'Missing cv or jobs' });
    try {
      const scored = await Promise.all(jobs.map(job => scoreJobHelper(cv, job)));
      return res.status(200).json({
        results: scored.sort((a, b) => b.score - a.score).slice(0, 10),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Jobs action not found' });
}
