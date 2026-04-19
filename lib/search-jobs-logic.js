// lib/search-jobs-logic.js

// ── City aliases ─────────────────────────────────────────────────────────────
// Maps common English spellings / alternate names to what job APIs return.
// Used both for building API queries and for post-filter matching.
const CITY_ALIASES = {
  // Poland
  'warsaw':    ['warsaw', 'warszawa'],
  'warszawa':  ['warsaw', 'warszawa'],
  'krakow':    ['krakow', 'kraków', 'cracow'],
  'kraków':    ['krakow', 'kraków', 'cracow'],
  'wroclaw':   ['wroclaw', 'wrocław'],
  'wrocław':   ['wroclaw', 'wrocław'],
  'gdansk':    ['gdansk', 'gdańsk'],
  'gdańsk':    ['gdansk', 'gdańsk'],
  'poznan':    ['poznan', 'poznań'],
  'poznań':    ['poznan', 'poznań'],
  'lodz':      ['lodz', 'łódź'],
  'łódź':      ['lodz', 'łódź'],
  // Germany
  'munich':    ['munich', 'münchen'],
  'münchen':   ['munich', 'münchen'],
  'cologne':   ['cologne', 'köln'],
  'köln':      ['cologne', 'köln'],
  'frankfurt': ['frankfurt'],
  'berlin':    ['berlin'],
  'hamburg':   ['hamburg'],
  'dusseldorf':['dusseldorf', 'düsseldorf'],
  'düsseldorf':['dusseldorf', 'düsseldorf'],
  'stuttgart': ['stuttgart'],
  // Other common EU
  'prague':    ['prague', 'praha'],
  'praha':     ['prague', 'praha'],
  'vienna':    ['vienna', 'wien'],
  'wien':      ['vienna', 'wien'],
  'amsterdam': ['amsterdam'],
  'brussels':  ['brussels', 'bruxelles', 'brussel'],
  'budapest':  ['budapest'],
  'bucharest': ['bucharest', 'bucurești'],
};

// Maps a location string to an Adzuna country code + JSearch country phrase.
// Checks for country name first, then falls back to city→country lookup.
const COUNTRY_MAP = {
  // Country name → { adzuna code, jsearch phrase }
  'poland':      { code: 'pl', phrase: 'Poland' },
  'polska':      { code: 'pl', phrase: 'Poland' },
  'germany':     { code: 'de', phrase: 'Germany' },
  'deutschland': { code: 'de', phrase: 'Germany' },
  'uk':          { code: 'gb', phrase: 'United Kingdom' },
  'united kingdom': { code: 'gb', phrase: 'United Kingdom' },
  'britain':     { code: 'gb', phrase: 'United Kingdom' },
  'netherlands': { code: 'nl', phrase: 'Netherlands' },
  'holland':     { code: 'nl', phrase: 'Netherlands' },
  'france':      { code: 'fr', phrase: 'France' },
  'spain':       { code: 'es', phrase: 'Spain' },
  'italy':       { code: 'it', phrase: 'Italy' },
  'czechia':     { code: 'cz', phrase: 'Czech Republic' },
  'czech republic': { code: 'cz', phrase: 'Czech Republic' },
  'austria':     { code: 'at', phrase: 'Austria' },
  'hungary':     { code: 'hu', phrase: 'Hungary' },
  'romania':     { code: 'ro', phrase: 'Romania' },
  'sweden':      { code: 'se', phrase: 'Sweden' },
  'switzerland': { code: 'ch', phrase: 'Switzerland' },
  'belgium':     { code: 'be', phrase: 'Belgium' },
  'portugal':    { code: 'pt', phrase: 'Portugal' },
};

// City → country fallback (when user types a city with no country)
const CITY_TO_COUNTRY = {
  'warsaw': 'pl', 'warszawa': 'pl', 'krakow': 'pl', 'kraków': 'pl',
  'wroclaw': 'pl', 'wrocław': 'pl', 'gdansk': 'pl', 'gdańsk': 'pl',
  'poznan': 'pl', 'poznań': 'pl', 'lodz': 'pl', 'łódź': 'pl',
  'berlin': 'de', 'munich': 'de', 'münchen': 'de', 'hamburg': 'de',
  'frankfurt': 'de', 'cologne': 'de', 'köln': 'de', 'stuttgart': 'de',
  'dusseldorf': 'de', 'düsseldorf': 'de',
  'london': 'gb', 'manchester': 'gb', 'birmingham': 'gb', 'edinburgh': 'gb',
  'amsterdam': 'nl', 'rotterdam': 'nl',
  'paris': 'fr', 'lyon': 'fr',
  'madrid': 'es', 'barcelona': 'es',
  'rome': 'it', 'milan': 'it', 'milano': 'it',
  'prague': 'cz', 'praha': 'cz',
  'vienna': 'at', 'wien': 'at',
  'budapest': 'hu',
  'bucharest': 'ro',
  'stockholm': 'se',
  'zurich': 'ch', 'zürich': 'ch', 'geneva': 'ch',
  'brussels': 'be', 'bruxelles': 'be',
  'lisbon': 'pt', 'lisboa': 'pt',
};

const COUNTRY_CODE_TO_PHRASE = {
  pl: 'Poland', de: 'Germany', gb: 'United Kingdom', nl: 'Netherlands',
  fr: 'France', es: 'Spain', it: 'Italy', cz: 'Czech Republic', at: 'Austria',
  hu: 'Hungary', ro: 'Romania', se: 'Sweden', ch: 'Switzerland', be: 'Belgium',
  pt: 'Portugal',
};

/**
 * Parse a location string like "Berlin, Germany" or "Warsaw" or "Germany"
 * and return { adzunaCode, jsearchPhrase, cityAliases }.
 * Defaults to Poland if nothing is recognisable.
 */
function resolveLocation(preferredLocation) {
  const raw = (preferredLocation || '').toLowerCase().trim();
  if (!raw) return { adzunaCode: 'pl', jsearchPhrase: 'Poland', cityAliases: [] };

  // Try each token (split on comma/space) against country map first
  const tokens = raw.split(/[,\s]+/).filter(Boolean);

  // Full string match against country map
  if (COUNTRY_MAP[raw]) {
    const { code, phrase } = COUNTRY_MAP[raw];
    return { adzunaCode: code, jsearchPhrase: phrase, cityAliases: [] };
  }

  // Token match against country map
  for (const token of tokens) {
    if (COUNTRY_MAP[token]) {
      const { code, phrase } = COUNTRY_MAP[token];
      // Also capture any city tokens
      const cityToken = tokens.find(t => t !== token);
      const cityAliases = cityToken ? (CITY_ALIASES[cityToken] || [cityToken]) : [];
      return { adzunaCode: code, jsearchPhrase: phrase, cityAliases };
    }
  }

  // Token match against city→country lookup
  for (const token of tokens) {
    if (CITY_TO_COUNTRY[token]) {
      const code = CITY_TO_COUNTRY[token];
      const phrase = COUNTRY_CODE_TO_PHRASE[code] || 'Poland';
      const cityAliases = CITY_ALIASES[token] || [token];
      return { adzunaCode: code, jsearchPhrase: phrase, cityAliases };
    }
  }

  // Fallback: treat the whole string as a city in Poland
  const cityAliases = CITY_ALIASES[raw] || [raw];
  return { adzunaCode: 'pl', jsearchPhrase: 'Poland', cityAliases };
}

/**
 * Check if a job's location matches the user's preferred city.
 * Uses aliases so "warsaw" matches "Warszawa" etc.
 */
function locationMatchesCity(jobLocation, cityAliases) {
  if (!cityAliases.length) return true; // no city filter
  const loc = (jobLocation || '').toLowerCase();
  return cityAliases.some(alias => loc.includes(alias.toLowerCase()));
}

// ── Role expansion ────────────────────────────────────────────────────────────

const ROLE_SYNONYMS = {
  'testing':           ['QA engineer', 'software tester', 'manual tester', 'quality assurance'],
  'qa':                ['QA engineer', 'quality assurance', 'software tester', 'QA analyst'],
  'tester':            ['QA engineer', 'software tester', 'manual tester', 'QA specialist'],
  'qa engineer':       ['QA engineer', 'quality assurance engineer', 'software tester'],
  'qa tester':         ['QA tester', 'software tester', 'manual tester', 'QA engineer'],
  'manual tester':     ['manual tester', 'QA engineer', 'software tester'],
  'automation tester': ['automation tester', 'QA automation engineer', 'SDET', 'test automation engineer'],
  'developer':         ['software developer', 'software engineer', 'backend developer', 'frontend developer'],
  'frontend':          ['frontend developer', 'React developer', 'UI developer', 'JavaScript developer'],
  'backend':           ['backend developer', 'Node.js developer', 'Java developer', 'Python developer'],
  'fullstack':         ['fullstack developer', 'full stack developer', 'software engineer'],
  'devops':            ['DevOps engineer', 'SRE', 'platform engineer', 'infrastructure engineer'],
  'data':              ['data analyst', 'data engineer', 'business intelligence analyst', 'data scientist'],
  'data analyst':      ['data analyst', 'business intelligence analyst', 'BI analyst'],
  'pm':                ['project manager', 'IT project manager', 'scrum master', 'delivery manager'],
  'project manager':   ['IT project manager', 'project manager', 'scrum master'],
  'product manager':   ['product manager', 'product owner', 'PO'],
  'java':              ['Java developer', 'Java engineer', 'backend Java developer'],
  'python':            ['Python developer', 'Python engineer', 'backend Python developer'],
  'javascript':        ['JavaScript developer', 'frontend developer', 'Node.js developer'],
  'react':             ['React developer', 'frontend developer', 'React engineer'],
  'mobile':            ['mobile developer', 'Android developer', 'iOS developer', 'React Native developer'],
  'android':           ['Android developer', 'mobile developer', 'Kotlin developer'],
  'ios':               ['iOS developer', 'Swift developer', 'mobile developer'],
  'security':          ['cybersecurity engineer', 'security analyst', 'penetration tester', 'infosec engineer'],
  'support':           ['IT support specialist', 'technical support engineer', 'helpdesk engineer'],
  'analyst':           ['business analyst', 'data analyst', 'systems analyst', 'IT analyst'],
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
    return { queries: ROLE_SYNONYMS[key], qaIntent: QA_INTENT_KEYS.has(key) };
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

// ── Filtering helpers ─────────────────────────────────────────────────────────

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key =
      (j.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim() +
      '||' +
      (j.company || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEnglishJob(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const text = `${title} ${desc}`.slice(0, 1500);

  const polishChars = (text.match(/[ąćęłńóśźż]/gi) || []).length;
  if (polishChars > 15) return false;

  const techKeywords = /\b(developer|engineer|tester|qa|quality assurance|software|node|js|react|python|java|aws|docker|kubernetes|devops)\b/i;
  const sample = text.slice(0, 800);
  if (sample.length < 50) return true;

  const hits = (sample.match(/\b(the|and|for|with|you|our|this|will|have|are|we|your|that|from|an?|is|it|at|on|in|to)\b/gi) || []).length;
  if (hits >= 4) return true;
  if (techKeywords.test(title) && hits >= 2) return true;

  return false;
}

function hasProhibitedLanguages(job) {
  const desc = (job.description || '').toLowerCase();

  const Langs = '(polish|polski|polskiego|polsku|german|niemiecki|deutsch)';
  const Flags = '(must speak|required|vorausgesetzt|wymagan[ay]|znajomość|mówiący|płynny|at least|fluency|fluent|knowledge|level|płynna|komunikatywna|proficient)';
  const Levels = '(b2|c1|c2|fluent|native|profiency|advanced)';

  const pattern1 = new RegExp(`\\b${Flags}\\b.{0,60}\\b${Langs}\\b`, 'i');
  const pattern2 = new RegExp(`\\b${Langs}\\b.{0,60}\\b(${Flags}|${Levels})\\b`, 'i');
  const levelShorthand = new RegExp(`\\b${Langs}\\b[\\s-]{0,3}\\b(b[12]|c[12])\\b`, 'i');
  const together = /\b(english|polish)\s+and\s+(polish|english)\b/i;

  return (
    pattern1.test(desc) ||
    pattern2.test(desc) ||
    levelShorthand.test(desc) ||
    (together.test(desc) && /\brequired\b/i.test(desc))
  );
}

function isBlocked(job) {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const BLOCKED_PHRASES = [
    'security clearance', 'us citizen', 'u.s. citizen',
    'nato secret', 'only citizens', 'must be a citizen', 'citizenship required',
  ];
  return BLOCKED_PHRASES.some(p => text.includes(p));
}

// ── API fetchers ──────────────────────────────────────────────────────────────

async function fetchJSearch(queries, apiKey, jsearchPhrase) {
  const fetches = queries.map(async q => {
    try {
      const url = new URL('https://jsearch.p.rapidapi.com/search');
      url.searchParams.set('query', `${q} in ${jsearchPhrase}`);
      url.searchParams.set('num_pages', '1');
      url.searchParams.set('date_posted', 'month');

      const r = await fetch(url.toString(), {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!r.ok) {
        const err = await r.text();
        console.error(`[JSearch] API error for "${q}":`, r.status, err);
        return { error: `JSearch API Error ${r.status}: ${err.slice(0, 50)}`, data: [] };
      }

      const d = await r.json();
      const items = (d.data || []).slice(0, 15).map(j => ({
        id: 'js_' + (j.job_id || Math.random()),
        title: j.job_title || '',
        company: j.employer_name || '',
        location: [j.job_city, j.job_country].filter(Boolean).join(', ') || jsearchPhrase,
        description: (j.job_description || '').slice(0, 1000),
        applyUrl: j.job_apply_link || j.job_google_link || '',
        postedAt: j.job_posted_at_datetime_utc || null,
        source: 'JSearch',
        isRemote: j.job_is_remote || false,
      }));
      return { data: items };
    } catch (e) {
      console.error(`[JSearch] Fetch failed for "${q}":`, e.message);
      return { error: e.message, data: [] };
    }
  });

  const results = await Promise.all(fetches);
  return {
    data: results.flatMap(r => r.data || []),
    errors: results.filter(r => r.error).map(r => r.error),
  };
}

async function fetchAdzuna(queries, appId, appKey, adzunaCode) {
  const fetches = queries.slice(0, 4).map(async q => {
    try {
      const url = new URL(`https://api.adzuna.com/v1/api/jobs/${adzunaCode}/search/1`);
      url.searchParams.set('app_id', appId);
      url.searchParams.set('app_key', appKey);
      url.searchParams.set('what', q);
      url.searchParams.set('results_per_page', '15');
      url.searchParams.set('max_days_old', '30');
      url.searchParams.set('sort_by', 'date');

      const r = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) return [];

      const d = await r.json();
      return (d.results || []).map(j => ({
        id: 'a_' + j.id,
        title: j.title || '',
        company: j.company?.display_name || '',
        location: j.location?.display_name || '',
        description: (j.description || '').slice(0, 1000),
        applyUrl: j.redirect_url || '',
        postedAt: j.created || null,
        source: 'Adzuna',
        isRemote: false,
      }));
    } catch {
      return [];
    }
  });

  return (await Promise.all(fetches)).flat();
}

async function fetchPracujScraper(role, baseUrl) {
  if (!baseUrl) return [];
  try {
    const triggerUrl = `${baseUrl.replace(/\/$/, '')}/scrape-async?role=${encodeURIComponent(role)}`;
    fetch(triggerUrl).catch(() => {});

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
      isRemote: j.isRemote || false,
    }));
  } catch (e) {
    console.error('[search] Scraper fetch failed:', e.message);
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function searchJobsByRole(role, options = {}) {
  const jsearchKey = process.env.JSEARCH_API_KEY || process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY;
  const adzunaId   = process.env.ADZUNA_APP_ID;
  const adzunaKey  = process.env.ADZUNA_APP_KEY;
  const scraperUrl = process.env.SCRAPER_URL;

  if (!jsearchKey && !adzunaId && !scraperUrl) {
    throw new Error('No job search sources configured. Please add JSEARCH_API_KEY or SCRAPER_URL.');
  }

  // Resolve country + city from the user's preferred location
  const { adzunaCode, jsearchPhrase, cityAliases } = resolveLocation(options.preferredLocation || '');

  const { queries } = expandRole(role);

  const [jsearchRes, adzunaJobs, scraperJobs] = await Promise.all([
    jsearchKey ? fetchJSearch(queries, jsearchKey, jsearchPhrase) : Promise.resolve({ data: [], errors: [] }),
    adzunaId   ? fetchAdzuna(queries, adzunaId, adzunaKey, adzunaCode) : Promise.resolve([]),
    // Pracuj scraper is Poland-specific; skip for other countries
    (scraperUrl && adzunaCode === 'pl') ? fetchPracujScraper(role, scraperUrl) : Promise.resolve([]),
  ]);

  const raw = [...(jsearchRes.data || []), ...adzunaJobs, ...scraperJobs];
  const diagnostics = {
    rawCount: raw.length,
    jsearchErrors: jsearchRes.errors || [],
    langFiltered: 0,
    qaFiltered: 0,
  };

  let clean = dedupe(raw);

  const beforeLang = clean.length;
  clean = clean.filter(j => {
    if (!isEnglishJob(j)) return false;
    if (options.englishOnly && hasProhibitedLanguages(j)) return false;
    return true;
  });
  diagnostics.langFiltered = beforeLang - clean.length;

  clean = clean.filter(j => !isBlocked(j));

  // If user specified a city, filter to that city (or remote jobs)
  if (cityAliases.length > 0) {
    clean = clean.filter(j => {
      const isRemote = j.isRemote || (j.location || '').toLowerCase().includes('remote');
      return isRemote || locationMatchesCity(j.location, cityAliases);
    });
  }

  // Sort: most relevant location first, then by recency
  clean.sort((a, b) => {
    const ap = locationMatchesCity(a.location, cityAliases.length ? cityAliases : ['poland', 'warszawa', 'warsaw', 'pl']) ? 1 : 0;
    const bp = locationMatchesCity(b.location, cityAliases.length ? cityAliases : ['poland', 'warszawa', 'warsaw', 'pl']) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ad = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const bd = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    return bd - ad;
  });

  return { results: clean.slice(0, 50), diagnostics };
}
