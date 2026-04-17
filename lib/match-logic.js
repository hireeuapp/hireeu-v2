// lib/match-logic.js
const MIN_SCORE = 45;

async function callGroq(prompt, maxTokens = 1500) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.1 })
  });
  if (!response.ok) throw new Error(`Groq error: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function calculateScore(candidate, jobFacts) {
  const W_SKILLS = 45, W_EXP = 30, W_SENIORITY = 15, W_FIELD = 10;
  let skillScore = 0, expScore = 0, seniorScore = 0, fieldScore = 0;
  const gaps = [], strengths = [], candSkills = (candidate.skills || []).map(s => s.toLowerCase());
  const required = jobFacts.requiredSkills || [], critical = jobFacts.criticalSkills || [];

  if (required.length > 0) {
    let matched = 0;
    for (const skill of required) { if (candSkills.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs))) matched++; }
    const ratio = matched / required.length;
    skillScore = Math.round(ratio * W_SKILLS);
    if (ratio >= 0.7) strengths.push(`${matched}/${required.length} required skills match`);
    else gaps.push(`missing ${required.length - matched} required skills`);
    let critPenalty = 0;
    for (const cs of critical) { if (!candSkills.some(s => s.includes(cs.toLowerCase()) || cs.toLowerCase().includes(s))) critPenalty += 10; }
    skillScore = Math.max(0, skillScore - Math.min(critPenalty, 30));
  } else { skillScore = Math.round(W_SKILLS * 0.55); }

  const yearsReq = jobFacts.yearsRequired || 0, yearsCand = candidate.yearsExperience || 0;
  if (yearsReq === 0) { expScore = Math.round(W_EXP * 0.7); }
  else { const diff = yearsCand - yearsReq; if (diff >= 0) { expScore = W_EXP; strengths.push(`${yearsCand}yrs experience meets requirement`); } else if (diff >= -1) expScore = Math.round(W_EXP * 0.75); else gaps.push(`needs ${yearsReq}yrs, has ${yearsCand}`); }

  const seniority = jobFacts.seniorityMatch || 'unknown';
  if (seniority === 'match') { seniorScore = W_SENIORITY; strengths.push('seniority match'); } else seniorScore = Math.round(W_SENIORITY * 0.6);

  if (jobFacts.fieldMatch === true) { fieldScore = W_FIELD; strengths.push('same domain'); } else fieldScore = Math.round(W_FIELD * 0.5);

  const total = Math.min(92, (skillScore + expScore + seniorScore + fieldScore));
  
  // ROLE MATCH PENALTY: If the role is a total mismatch (e.g. Driver vs Dev), slash the score.
  let finalScore = total;
  const roleMatch = jobFacts.roleMatchScore ?? 1; // 0 to 1
  if (roleMatch < 0.4) finalScore = Math.round(total * 0.4);
  else if (roleMatch < 0.7) finalScore = Math.round(total * 0.8);

  const reason = gaps.length ? `Gap: ${gaps[0]}.` : `Strong fit — ${strengths[0]}.`;
  const missingSkills = critical.filter(cs => !candSkills.some(s => s.includes(cs.toLowerCase()) || cs.toLowerCase().includes(s))).slice(0, 4);
  return { score: finalScore, reason, missingSkills };
}

export async function matchAndScoreJobs(candidate, jobs, minScore = MIN_SCORE) {
  const summary = candidate?.summary || '', skills = candidate?.skills || [], yearsExperience = candidate?.yearsExperience || 0;
  if (!summary || !jobs?.length) return [];
  const BATCH = 8, allScored = [];
  for (let start = 0; start < jobs.length; start += BATCH) {
    const batch = jobs.slice(start, start + BATCH);
    const jobList = batch.map((j, i) => `[${i}] ${j.title} at ${j.company}\n${(j.description || '').slice(0, 600)}`).join('\n\n');
    const prompt = `Extract facts for job-matching. Respondents must ONLY provide JSON.
PROFILE: ${candidate.primaryRole || ''} - ${summary} Skills: ${skills.join(', ')} Exp: ${yearsExperience}
For each job extract: yearsRequired, requiredSkills, criticalSkills, seniorityMatch ("match"|"stretch"|"overqualified"), roleMatchScore (0.0 to 1.0 based on how well the candidate's primary role matches the job title), fieldMatch (true|false|null).
JOBS: ${jobList}
Response JSON only: {"jobs": [{"index": 0, "yearsRequired": 3, "requiredSkills": [], "criticalSkills": [], "seniorityMatch": "match", "roleMatchScore": 0.9, "fieldMatch": true}]}`;
    try {
      const text = await callGroq(prompt, 1500);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      const extracted = JSON.parse(jsonMatch[0].trim());
      for (const jf of extracted.jobs || []) {
        const job = batch[jf.index]; if (!job) continue;
        const { score, reason, missingSkills } = calculateScore({ summary, skills, yearsExperience }, jf);
        allScored.push({ ...job, match: score, reason, missingSkills, seniority: jf.seniorityMatch });
      }
    } catch (e) { 
      console.error('Groq Analysis Error:', e);
      batch.forEach(j => allScored.push({ ...j, match: 50, reason: 'Analysis timed out or failed.', missingSkills: [] })); 
    }
  }
  return allScored.filter(j => j.match >= minScore).sort((a, b) => b.match - a.match);
}
