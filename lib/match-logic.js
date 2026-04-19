// lib/match-logic.js

const MIN_SCORE = 45;

async function callGroq(prompt, maxTokens = 800, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (response.status === 429) {
        // Rate limited — wait before retrying
        const wait = (attempt + 1) * 4000;
        console.warn(`[Groq] Rate limited, retrying in ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) throw new Error(`Groq error ${response.status}: ${await response.text()}`);

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Groq: max retries exceeded');
}

function calculateScore(candidate, jobFacts) {
  const W_SKILLS = 45, W_EXP = 30, W_SENIORITY = 15, W_FIELD = 10;
  const gaps = [], strengths = [];
  const candSkills = (candidate.skills || []).map(s => s.toLowerCase());
  const required = jobFacts.requiredSkills || [];
  const critical = jobFacts.criticalSkills || [];

  // Skills score
  let skillScore = 0;
  if (required.length > 0) {
    let matched = 0;
    for (const skill of required) {
      if (candSkills.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs))) matched++;
    }
    const ratio = matched / required.length;
    skillScore = Math.round(ratio * W_SKILLS);
    if (ratio >= 0.7) strengths.push(`${matched}/${required.length} required skills match`);
    else gaps.push(`missing ${required.length - matched} required skills`);

    let critPenalty = 0;
    for (const cs of critical) {
      if (!candSkills.some(s => s.includes(cs.toLowerCase()) || cs.toLowerCase().includes(s))) critPenalty += 10;
    }
    skillScore = Math.max(0, skillScore - Math.min(critPenalty, 30));
  } else {
    skillScore = Math.round(W_SKILLS * 0.55);
  }

  // Experience score
  let expScore = 0;
  const yearsReq = jobFacts.yearsRequired || 0;
  const yearsCand = candidate.yearsExperience || 0;
  if (yearsReq === 0) {
    expScore = Math.round(W_EXP * 0.7);
  } else {
    const diff = yearsCand - yearsReq;
    if (diff >= 0) { expScore = W_EXP; strengths.push(`${yearsCand}yrs experience meets requirement`); }
    else if (diff >= -1) expScore = Math.round(W_EXP * 0.75);
    else gaps.push(`needs ${yearsReq}yrs, has ${yearsCand}`);
  }

  // Seniority score
  const seniority = jobFacts.seniorityMatch || 'unknown';
  let seniorScore = seniority === 'match'
    ? (strengths.push('seniority match'), W_SENIORITY)
    : Math.round(W_SENIORITY * 0.6);

  // Field match score
  let fieldScore = jobFacts.fieldMatch === true
    ? (strengths.push('same domain'), W_FIELD)
    : Math.round(W_FIELD * 0.5);

  let total = Math.min(92, skillScore + expScore + seniorScore + fieldScore);

  // Role mismatch penalty
  const roleMatch = jobFacts.roleMatchScore ?? 1;
  let finalScore = total;
  if (roleMatch < 0.4) finalScore = Math.round(total * 0.4);
  else if (roleMatch < 0.7) finalScore = Math.round(total * 0.8);

  const reason = gaps.length ? `Gap: ${gaps[0]}.` : `Strong fit — ${strengths[0]}.`;
  const missingSkills = critical
    .filter(cs => !candSkills.some(s => s.includes(cs.toLowerCase()) || cs.toLowerCase().includes(s)))
    .slice(0, 4);

  return { score: finalScore, reason, missingSkills };
}

export async function matchAndScoreJobs(candidate, jobs, minScore = MIN_SCORE) {
  const { summary = '', skills = [], yearsExperience = 0 } = candidate || {};
  if (!summary || !jobs?.length) return [];

  // Smaller batches = shorter prompts = less likely to hit token/rate limits
  const BATCH = 3;
  const allScored = [];

  for (let start = 0; start < jobs.length; start += BATCH) {
    // Small delay between batches to avoid Groq RPM limit
    if (start > 0) await new Promise(r => setTimeout(r, 1000));

    const batch = jobs.slice(start, start + BATCH);
    const jobList = batch
      .map((j, i) => `[${i}] ${j.title} at ${j.company}\n${(j.description || '').slice(0, 400)}`)
      .join('\n\n');

    const prompt = `Extract job-matching facts. JSON only, no preamble.
CANDIDATE: ${candidate.primaryRole || ''} | ${summary.slice(0, 300)} | Skills: ${skills.slice(0, 15).join(', ')} | Exp: ${yearsExperience}yrs
JOBS:
${jobList}
Return: {"jobs":[{"index":0,"yearsRequired":2,"requiredSkills":[],"criticalSkills":[],"seniorityMatch":"match","roleMatchScore":0.9,"fieldMatch":true}]}`;

    try {
      const text = await callGroq(prompt, 600);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const extracted = JSON.parse(jsonMatch[0].trim());
      for (const jf of extracted.jobs || []) {
        const job = batch[jf.index];
        if (!job) continue;
        const { score, reason, missingSkills } = calculateScore({ summary, skills, yearsExperience }, jf);
        allScored.push({ ...job, match: score, reason, missingSkills, seniority: jf.seniorityMatch });
      }
    } catch (e) {
      console.error('[match] Groq batch failed:', e.message);
      // Fallback: score locally without AI, so cards still show something meaningful
      batch.forEach(j => {
        const titleLower = (j.title || '').toLowerCase();
        const hasSkillMatch = skills.some(s => titleLower.includes(s.toLowerCase()));
        allScored.push({
          ...j,
          match: hasSkillMatch ? 55 : 50,
          reason: 'Score estimated — AI analysis unavailable.',
          missingSkills: [],
        });
      });
    }
  }

  return allScored.filter(j => j.match >= minScore).sort((a, b) => b.match - a.match);
}
