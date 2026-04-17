// api/system-check.js
export default async function handler(req, res) {
  const status = {
    database: !!process.env.DATABASE_URL,
    jsearch: !!(process.env.JSEARCH_API_KEY || process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY),
    adzuna: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    scraper: !!process.env.SCRAPER_URL,
    groq: !!process.env.GROQ_API_KEY
  };
  
  return res.status(200).json(status);
}
