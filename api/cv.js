import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { matchAndScoreJobs } from '../lib/match-logic.js';

async function extractText(fileBase64, fileType) {
  const buffer = Buffer.from(fileBase64, 'base64');
  const type = fileType.toLowerCase();
  if (type.includes('pdf')) {
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer); return result.text || '';
  }
  if (type.includes('doc') || type.includes('word')) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer }); return result.value || '';
  }
  return buffer.toString('utf-8');
}

export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'parse') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { role, fileBase64, fileType } = req.body;
    try {
      const text = await extractText(fileBase64, fileType);
      const prompt = `Extract profile from CV. Role sought: ${role}. CV: ${text.slice(0, 4000)}. JSON ONLY: {"summary": "...", "skills": [], "yearsExperience": 0, "seniority": "mid", "location": "Warsaw", "languages": []}`;
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.1 })
      });
      const d = await groqRes.json();
      const parsed = JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  }

  if (action === 'match') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { summary, skills, yearsExperience, jobs } = req.body;
    try {
      const scored = await matchAndScoreJobs({ summary, skills, yearsExperience }, jobs);
      return res.status(200).json({ scored });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(404).json({ error: 'CV action not found' });
}
