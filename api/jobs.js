import { searchJobsByRole } from '../lib/search-jobs-logic.js';
import { matchAndScoreJobs } from '../lib/match-logic.js';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

async function scoreJobHelper(cv, job) {
  const prompt = `Recruiter view. Candidate CV: ${cv.slice(0, 2000)}. Job: ${job.title} at ${job.company}. Desc: ${job.description.slice(0, 800)}. Score 0-100 and reason. JSON only: {"score": 85, "reason": "fit", "missing_skills": []}`;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 150, temperature: 0.1 })
    });
    const d = await r.json();
    const parsed = JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
    return { ...job, score: parsed.score || 0, reason: parsed.reason || '', missing_skills: parsed.missing_skills || [] };
  } catch { return { ...job, score: 0, reason: 'Scoring failed.', missing_skills: [] }; }
}

export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'search') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { role } = req.body;
    try {
      const jobs = await searchJobsByRole(role);
      return res.status(200).json({ jobs });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (action === 'recommend') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const user = await requireAuth(req, res); if (!user) return;
    try {
      const [profileRes, prefRes] = await Promise.all([
        query('SELECT summary, skills, years_experience, seniority FROM candidate_profiles WHERE user_id = $1', [user.id]),
        query('SELECT preferred_location, work_type, min_fit_percent FROM job_search_preferences WHERE user_id = $1', [user.id])
      ]);
      if (!profileRes.rowCount) return res.status(400).json({ error: 'Profile not found' });
      const profile = profileRes.rows[0], prefs = prefRes.rows[0] || { preferred_location: '', work_type: 'any', min_fit_percent: 45 };
      let roleQuery = `${profile.seniority} ${profile.skills.slice(0, 3).join(' ')}`.trim();
      let jobs = await searchJobsByRole(roleQuery || 'software engineer');
      
      // Fallback if no jobs found
      if (jobs.length === 0 && profile.skills.length > 0) {
        console.log('No jobs found for precise role, trying broader search...');
        roleQuery = `${profile.seniority} ${profile.skills[0]} developer`.trim();
        jobs = await searchJobsByRole(roleQuery);
      }
      
      const scored = await matchAndScoreJobs({ summary: profile.summary, skills: profile.skills, yearsExperience: profile.years_experience }, jobs, prefs.min_fit_percent);
      return res.status(200).json({ results: scored.slice(0, 20) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (action === 'score') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { cv, jobs } = req.body;
    if (!jobs?.length || !cv) return res.status(400).json({ error: 'Missing cv or jobs' });
    try {
      const scored = await Promise.all(jobs.map(job => scoreJobHelper(cv, job)));
      return res.status(200).json({ results: scored.sort((a,b) => b.score - a.score).slice(0, 10) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(404).json({ error: 'Jobs action not found' });
}
