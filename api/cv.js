import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { matchAndScoreJobs } from '../lib/match-logic.js';

async function extractText(fileBase64, fileType) {
  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const type = fileType.toLowerCase();
    
    if (type.includes('pdf')) {
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(buffer);
      console.log('PDF parsed, chars:', result.text?.length || 0);
      return result.text || '';
    }
    
    if (type.includes('doc') || type.includes('word')) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      console.log('DOCX parsed, chars:', result.value?.length || 0);
      return result.value || '';
    }
    
    console.log('Falling back to plain text for type:', type);
    return buffer.toString('utf-8');
  } catch (err) {
    console.error('Extraction error:', err.message);
    throw new Error(`Failed to read file: ${err.message}`);
  }
}

export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'parse') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    const { role, fileBase64, fileType } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file provided' });

    try {
      const text = await extractText(fileBase64, fileType || 'application/pdf');
      if (!text || text.trim().length < 50) {
        return res.status(400).json({ error: 'Could not extract enough text from the CV. Is it an image?' });
      }

      if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ error: 'Groq API Key is not configured in Vercel settings.' });
      }

      const prompt = `You are an expert technical recruiter analyzing a CV. 
Extract a COMPREHENSIVE profile from this CV. 

Role sought: ${role || 'Not specified'}.

CV CONTENT:
${text.slice(0, 5000)}

STRICT INSTRUCTIONS:
1. Extract at least 15-20 relevant skills if they exist. Include technical tools, languages, frameworks, methodologies (Agile, TDD), and soft skills.
2. Be precise about 'yearsExperience'.
3. For 'seniority', choose the best fit: junior, mid, senior, or lead.

Respond with ONLY valid JSON:
{
  "summary": "Professional summary focusing on career highlights",
  "primaryRole": "Main job title, e.g. Frontend Developer",
  "skills": ["Skill 1", "Skill 2", "..."],
  "yearsExperience": <number>,
  "seniority": "junior" | "mid" | "senior" | "lead",
  "location": "City, Country",
  "languages": ["Language 1", "Language 2"]
}`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error('Groq API error:', errText);
        return res.status(500).json({ error: `AI Service Error: ${groqRes.status}` });
      }

      const d = await groqRes.json();
      const content = d.choices?.[0]?.message?.content;
      if (!content) throw new Error('AI returned an empty response');

      const clean = content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      
      return res.status(200).json(parsed);
    } catch (err) {
      console.error('CV Parse Error:', err);
      return res.status(400).json({ error: err.message || 'CV processing failed' });
    }
  }

  if (action === 'match') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { summary, skills, yearsExperience, jobs } = req.body;
    try {
      const scored = await matchAndScoreJobs({ summary, skills, yearsExperience }, jobs);
      return res.status(200).json({ scored });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Matching failed' });
    }
  }

  return res.status(404).json({ error: 'CV action not found' });
}
