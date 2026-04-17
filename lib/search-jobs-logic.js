// lib/search-jobs-logic.js
const ROLE_SYNONYMS = {
  'testing':              ['QA engineer', 'software tester', 'manual tester', 'quality assurance'],
  'qa':                   ['QA engineer', 'quality assurance', 'software tester', 'QA analyst'],
  'tester':               ['QA engineer', 'software tester', 'manual tester', 'QA specialist'],
  'qa engineer':          ['QA engineer', 'quality assurance engineer', 'software tester'],
  'qa tester':            ['QA tester', 'software tester', 'manual tester', 'QA engineer'],
  'manual tester':        ['manual tester', 'QA engineer', 'software tester'],
  'automation tester':    ['automation tester', 'QA automation engineer', 'SDET', 'test automation engineer'],
  'developer':            ['software developer', 'software engineer', 'backend developer', 'frontend developer'],
  'frontend':             ['frontend developer', 'React developer', 'UI developer', 'JavaScript developer'],
  'backend':              ['backend developer', 'Node.js developer', 'Java developer', 'Python developer'],
  'fullstack':            ['fullstack developer', 'full stack developer', 'software engineer'],
  'devops':               ['DevOps engineer', 'SRE', 'platform engineer', 'infrastructure engineer'],
  'data':                 ['data analyst', 'data engineer', 'business intelligence analyst', 'data scientist'],
  'data analyst':         ['data analyst', 'business intelligence analyst', 'BI analyst'],
  'pm':                   ['project manager', 'IT project manager', 'scrum master', 'delivery manager'],
  'project manager':      ['IT project manager', 'project manager', 'scrum master'],
  'product manager':      ['product manager', 'product owner', 'PO'],
  'java':                 ['Java developer', 'Java engineer', 'backend Java developer'],
  'python':               ['Python developer', 'Python engineer', 'backend Python developer'],
  'javascript':           ['JavaScript developer', 'frontend developer', 'Node.js developer'],
  'react':                ['React developer', 'frontend developer', 'React engineer'],
  'mobile':               ['mobile developer', 'Android developer', 'iOS developer', 'React Native developer'],
  'android':              ['Android developer', 'mobile developer', 'Kotlin developer'],
  'ios':                  ['iOS developer', 'Swift developer', 'mobile developer'],
  'security':             ['cybersecurity engineer', 'security analyst', 'penetration tester', 'infosec engineer'],
  'support':              ['IT support specialist', 'technical support engineer', 'helpdesk engineer'],
  'analyst':              ['business analyst', 'data analyst', 'systems analyst', 'IT analyst'],
};

const QA_INTENT_KEYS = new Set([
  'testing', 'qa', 'tester', 'qa engineer', 'qa tester', 'manual tester', 'automation tester',
]);

function normalizeRolePhrase(role) {
  let s = role.trim().toLowerCase();
  s = s.replace(/\b(jobs?|roles?|positions?|openings?|vacancies?|hiring|remote|full[\s-]?time|part[\s-]?time)\b/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function expandRole(role) {
  const key = normalizeRolePhrase(role);
  if (ROLE_SYNONYMS[key]) {
    const queries = ROLE_SYNONYMS[key];
    return { queries, qaIntent: QA_INTENT_KEYS.has(key) };
  }
  const entries = Object.entries(ROLE_SYNONYMS).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of entries) {
    if (!k) continue;
    if (key.includes(k) || (k.includes(key) && key.length >= 3)) {
      return { queries: v.slice(0, 4), qaIntent: QA_INTENT_KEYS.has(k) };
    }
  }
  return { queries: [key || role.trim()], qaIntent: false };
}

function jobMatchesQaIntent(job) {
  const title = (job.title || '').toLowerCase();
  const text = `${title} ${(job.description || '').slice(0, 500)}`.toLowerCase();
  return (
    /\bqa\b|\bq\.a\.\b|\bqe\b|quality assurance|quality engineer|software tester|manual tester|test engineer|testing engineer|test automation|automation tester|sdet|\bstlc\b|\bvctc\b|regression test/.test(text) ||
    /\btester\b/.test(text) ||
    (/test/.test(title) && /(qa|quality|assurance|automation|manual|software)/.test(title))
  );
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = (j.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim() + '||' + 
                (j.company || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEnglishJob(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  
  // If it's a tech job, be VERY lenient
  const techKeywords = /\b(developer|engineer|tester|qa|quality assurance|software|data|node|js|react|python|java|aws|azure|docker|kubernetes|devops|sdet|specialist|intern|trainee)\b/i;
  if (techKeywords.test(title)) {
    // A tech job with a title like "Java Developer" is likely English-friendly even if description is short or has Polish footer
    if (desc.length < 500) return true; 
  }
  
  const sample = `${title} ${desc}`.slice(0, 800);
  if (sample.length < 50) return true;
  
  // Check for common English sentence-starting tokens
  const hits = (sample.match(/\b(the|and|for|with|you|our|this|will|have|are|we|your|that|from|an?|is|it|at|on|in|to)\b/gi) || []).length;
  
  // If we have at least 3 strong hits in a small sample, it's likely English enough
  if (hits >= 3) return true;
  
  // Reject only if it clearly looks like non-English (many non-ASCII chars)
  if (/[àáâãäåæçèéêëìíîïðñòóôõöùúûüýþßœ]{3,}/i.test(sample)) return false;
  
  return true; 
}

function isBlocked(job) {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const BLOCKED_PHRASES = ['security clearance', 'us citizen', 'u.s. citizen', 'nato secret', 'only citizens', 'must be a citizen', 'citizenship required'];
  return BLOCKED_PHRASES.some(p => text.includes(p));
}

function isPoland(job) {
  const loc = (job.location || '').toLowerCase();
  // Support "Poland", city names, and "PL" country code
  const plMarkers = [
    'poland', 'warszawa', 'warsaw', 'kraków', 'krakow', 'wrocław', 'wroclaw', 
    'gdańsk', 'gdansk', 'poznań', 'poznan', 'łódź', 'lodz', ', pl', '(pl)', '/ pl'
  ];
  return plMarkers.some(m => loc.includes(m)) || /\bpl\b/i.test(loc);
}

async function fetchJSearch(queries, apiKey) {
  const fetches = queries.map(async (q) => {
    try {
      const url = new URL('https://jsearch.p.rapidapi.com/search');
      url.searchParams.set('query', `${q} in Poland`);
      url.searchParams.set('num_pages', '1');
      url.searchParams.set('date_posted', 'month');
      
      const r = await fetch(url.toString(), { 
        headers: { 
          'X-RapidAPI-Key': apiKey, 
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' 
        }, 
        signal: AbortSignal.timeout(15000) 
      });

      if (!r.ok) {
        const err = await r.text();
        console.error(`[JSearch] API Error for "${q}":`, r.status, err);
        return { error: `JSearch API Error ${r.status}: ${err.slice(0, 50)}`, data: [] };
      }

      const d = await r.json();
      const items = (d.data || []).slice(0, 15).map(j => ({ 
        id: 'js_' + (j.job_id || Math.random()), 
        title: j.job_title || '', 
        company: j.employer_name || '', 
        location: [j.job_city, j.job_country].filter(Boolean).join(', ') || 'Poland', 
        description: (j.job_description || '').slice(0, 1000), 
        applyUrl: j.job_apply_link || j.job_google_link || '', 
        postedAt: j.job_posted_at_datetime_utc || null, 
        source: 'JSearch', 
        isRemote: j.job_is_remote || false 
      }));
      return { data: items };
    } catch (e) { 
      console.error(`[JSearch] Fetch failed for "${q}":`, e.message);
      return { error: e.message, data: [] }; 
    }
  });
  
  const results = await Promise.all(fetches);
  const allData = results.flatMap(r => r.data || []);
  const errors = results.filter(r => r.error).map(r => r.error);
  
  return { data: allData, errors };
}

async function fetchAdzuna(queries, appId, appKey) {
  const fetches = [];
  for (const code of ['pl', 'gb']) {
    for (const q of queries.slice(0, 2)) {
      fetches.push((async () => {
        try {
          const url = new URL(`https://api.adzuna.com/v1/api/jobs/${code}/search/1`);
          url.searchParams.set('app_id', appId); url.searchParams.set('app_key', appKey); url.searchParams.set('what', q); url.searchParams.set('results_per_page', '15'); url.searchParams.set('max_days_old', '30'); url.searchParams.set('sort_by', 'date');
          const r = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
          if (!r.ok) return [];
          const d = await r.json();
          return (d.results || []).map(j => ({ id: 'a_' + j.id, title: j.title || '', company: j.company?.display_name || '', location: j.location?.display_name || '', description: (j.description || '').slice(0, 1000), applyUrl: j.redirect_url || '', postedAt: j.created || null, source: 'Adzuna', isRemote: false }));
        } catch { return []; }
      })());
    }
  }
  return (await Promise.all(fetches)).flat();
}

async function fetchPracujScraper(role, baseUrl) {
  if (!baseUrl) return [];
  try {
    // 1. Trigger async scrape (non-blocking)
    const triggerUrl = `${baseUrl.replace(/\/$/, '')}/scrape-async?role=${encodeURIComponent(role)}`;
    fetch(triggerUrl).catch(() => {}); // fire and forget

    // 2. Fetch current cached results
    const fetchUrl = `${baseUrl.replace(/\/$/, '')}/scrape-cached?role=${encodeURIComponent(role)}`;
    const r = await fetch(fetchUrl, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.jobs || []).map(j => ({
      id: j.id || Math.random().toString(),
      title: j.title || '',
      company: j.company || '',
      location: j.location || 'Poland',
      description: j.description || '',
      applyUrl: j.url || j.applyUrl || '',
      postedAt: j.postedAt || null,
      source: j.source || 'Pracuj.pl',
      isRemote: j.isRemote || false
    }));
  } catch (e) {
    console.error('[search] Scraper fetch failed:', e.message);
    return [];
  }
}

export async function searchJobsByRole(role) {
  const jsearchKey = process.env.JSEARCH_API_KEY || process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY;
  const adzunaId = process.env.ADZUNA_APP_ID;
  const adzunaKey = process.env.ADZUNA_APP_KEY;
  const scraperUrl = process.env.SCRAPER_URL;

  if (!jsearchKey && !adzunaId && !scraperUrl) {
    throw new Error('No job search sources are configured in Vercel. Please add JSEARCH_API_KEY or SCRAPER_URL.');
  }

  const { queries, qaIntent } = expandRole(role);
  
  const [jsearchRes, adzunaJobs, scraperJobs] = await Promise.all([
    jsearchKey ? fetchJSearch(queries, jsearchKey) : Promise.resolve({ data: [] }),
    adzunaId ? fetchAdzuna(queries, adzunaId, adzunaKey) : Promise.resolve([]),
    scraperUrl ? fetchPracujScraper(role, scraperUrl) : Promise.resolve([])
  ]);
  
  const raw = [...(jsearchRes.data || []), ...adzunaJobs, ...scraperJobs];
  const diagnostics = {
    rawCount: raw.length,
    jsearchErrors: jsearchRes.errors || [],
    langFiltered: 0,
    qaFiltered: 0
  };

  let clean = dedupe(raw);
  
  const beforeLang = clean.length;
  clean = clean.filter(isEnglishJob);
  diagnostics.langFiltered = beforeLang - clean.length;

  clean = clean.filter(j => !isBlocked(j));
  
  clean.sort((a, b) => {
    const ap = isPoland(a) ? 1 : 0;
    const bp = isPoland(b) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ad = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const bd = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    return bd - ad;
  });
  
  return { results: clean.slice(0, 50), diagnostics };
}
