# HireEU v2 — AI-Powered Job Assistant for Foreigners in Poland & EU

**HireEU** is an intelligent job search platform that helps foreigners and expats find relevant job opportunities across Poland and the European Union. Upload your CV once, and our AI instantly matches you with tailored job listings and generates personalized cover letters.

**Live:** https://hireeu.vercel.app  
**Early traction:** ~17 signups in 24 hours from geographically diverse expat audience

---

## 🎯 Core Features

### 1. **Intelligent CV Parsing**
- Upload CV in **PDF** or **DOCX** format
- AI extracts comprehensive profile: skills, experience, seniority level, languages, location
- Powered by **Groq API** (Llama 3.3 70B) for fast, accurate extraction
- Supports 20+ skill detection across technical tools, frameworks, methodologies, and soft skills

### 2. **Smart Job Matching**
- Multi-source job aggregation:
  - **JSearch API** (RapidAPI) — global job listings
  - **Adzuna API** — EU-wide opportunities
  - **Custom scraper** (Railway-deployed) — Polish-specific platforms:
    - JustJoinIT
    - NoFluffJobs
    - EnglishJobs.pl
- Semantic matching algorithm scores jobs across 10 dimensions (location, salary, languages, role fit, etc.)
- Filters by work type (remote, hybrid, onsite) and minimum fit threshold
- Returns ranked job results with match percentages

### 3. **AI-Generated Cover Letters**
- On-demand cover letter generation
- Tailored to specific job listings and your CV
- Uses Groq API for fast, personalized text generation
- One-click download ready for applications

### 4. **User Authentication & Profiles**
- Secure JWT-based authentication
- User account storage with password hashing (bcryptjs)
- Persistent candidate profiles with CV data
- Job search preferences (location, work type, fit threshold)
- GDPR-compliant privacy policy and data handling

---

## 📦 Tech Stack

### Frontend
- **Vanilla HTML/CSS/JavaScript** — lightweight, no framework overhead
- **Dark mode support** — navy & silver design system
- **Responsive mobile-first design**

### Backend
- **Node.js** with **Express** (serverless on Vercel)
- **Neon PostgreSQL** (Frankfurt) — persistent user & profile storage
- **Clerk.dev integration** (auth system, optional enterprise upgrade)

### APIs & Services
- **Groq API** — AI profile parsing & cover letter generation
- **JSearch API** (RapidAPI) — 200 req/month free tier, $10/mo for 2,000 req
- **Adzuna API** — EU job listings
- **Railway** — custom Playwright scraper for Polish job boards
- **Gmail SMTP** — waitlist confirmation emails
- **Vercel** — hosting & serverless functions

### Libraries
- `pg` — PostgreSQL client
- `jsonwebtoken` — JWT auth
- `bcryptjs` — password hashing
- `mammoth` — DOCX text extraction
- `pdf-parse` — PDF text extraction

---

## 🗂️ Project Structure

```
hireeu-v2-main/
├── api/                        # Vercel serverless functions
│   ├── auth.js                # Login endpoint
│   ├── auth-logout.js         # Logout handler
│   ├── cv.js                  # CV parsing & job matching
│   ├── jobs.js                # Job search aggregation
│   ├── generate-cover-letter.js # AI cover letter generation
│   ├── user-data.js           # User profile endpoints
│   ├── waitlist.js            # Waitlist signup & email confirmation
│   └── system-check.js        # Health check endpoint
│
├── lib/                       # Core business logic
│   ├── auth.js               # JWT token generation & verification
│   ├── db.js                 # Database connection pool
│   ├── match-logic.js        # Job matching & scoring algorithm
│   └── search-jobs-logic.js  # Job aggregation & filtering
│
├── db/
│   └── schema.sql            # PostgreSQL schema (users, profiles, preferences)
│
├── public/                   # Frontend (served from Vercel)
│   ├── index.html           # Landing page (waitlist signup)
│   ├── app.html             # Main app (auth, CV upload, job search)
│   └── privacy.html         # GDPR privacy policy
│
├── package.json             # Dependencies
├── vercel.json              # Vercel deployment config (rewrites)
├── ENV_VARIABLES.txt        # Required environment variables
└── DEPLOY_GUIDE.html        # Step-by-step deployment instructions
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** (for local development)
- **Git** and a GitHub account (for Vercel deployment)
- **Vercel account** (free tier sufficient)
- **Neon PostgreSQL account** (free tier included)

### 1. Clone the Repository

```bash
git clone https://github.com/AbelHazi3110/hireeu-vercel.git
cd hireeu-vercel
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- `pg` — PostgreSQL client
- `jsonwebtoken` — JWT authentication
- `bcryptjs` — password hashing
- `mammoth` — DOCX parsing
- `pdf-parse` — PDF text extraction

### 3. Set Up Local Environment

Create a `.env.local` file in the project root:

```env
# Database
DATABASE_URL=postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# AI & Job APIs
GROQ_API_KEY=your-groq-api-key
JSEARCH_API_KEY=your-rapidapi-jsearch-key
ADZUNA_APP_ID=your-adzuna-app-id
ADZUNA_APP_KEY=your-adzuna-app-key

# Job Scraper (Railway-deployed)
SCRAPER_URL=https://your-scraper.railway.app

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
ADMIN_EMAIL=your-gmail@gmail.com
SITE_URL=http://localhost:3000
```

### 4. Initialize the Database

Connect to your Neon PostgreSQL instance and run:

```bash
psql -d neondb -f db/schema.sql
```

This creates three tables:
- `app_users` — user accounts with email & password
- `candidate_profiles` — CV data, skills, experience level
- `job_search_preferences` — user-defined filters

### 5. Run Locally

```bash
npm run start
# Runs: npx vercel dev
# Access: http://localhost:3000
```

---

## 📝 API Endpoints

### Authentication
- **POST `/api/auth`** — User registration/login
  - Body: `{ email, password }`
  - Returns: JWT token
- **POST `/api/auth-logout`** — Logout & clear session

### CV & Job Matching
- **POST `/api/cv?action=parse`** — Extract CV data
  - Body: `{ fileBase64, fileType, role }`
  - Returns: `{ summary, primaryRole, skills, yearsExperience, seniority, location, languages }`

- **POST `/api/cv?action=match`** — Score jobs against CV
  - Body: `{ summary, skills, yearsExperience, jobs }`
  - Returns: `{ scored: [{ ...job, matchPercent }] }`

### Job Search
- **GET `/api/jobs?query=python&location=warsaw`** — Aggregate & search jobs
  - Returns: Array of job listings from JSearch, Adzuna, and custom scraper

### Cover Letter Generation
- **POST `/api/generate-cover-letter`** — Generate personalized cover letter
  - Body: `{ candidateSummary, jobDescription }`
  - Returns: `{ coverLetter }`

### User Data
- **GET `/api/user-data`** — Fetch user profile & preferences
- **POST `/api/user-data`** — Update user preferences
- **POST `/api/user-data?action=update-preferences`** — Save job search filters

### Waitlist (Pre-Launch)
- **POST `/api/waitlist`** — Sign up for waitlist
  - Body: `{ email }`
  - Sends confirmation email via Gmail SMTP

---

## ⚙️ Environment Variables Reference

| Variable | Purpose | Where to Get |
|----------|---------|--------------|
| `DATABASE_URL` | PostgreSQL connection string | Neon dashboard |
| `GROQ_API_KEY` | AI model for CV parsing & cover letters | https://console.groq.com/ |
| `JSEARCH_API_KEY` | Global job listings | https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch |
| `ADZUNA_APP_ID` | EU job listings | https://developer.adzuna.com/ |
| `ADZUNA_APP_KEY` | EU job listings | https://developer.adzuna.com/ |
| `SCRAPER_URL` | Custom Polish job board scraper | Railway deployment URL |
| `SMTP_HOST` | Email service | `smtp.gmail.com` |
| `SMTP_USER` | Gmail address for sending emails | Your Gmail account |
| `SMTP_PASS` | Gmail app password (2FA required) | Gmail Settings → Security |
| `ADMIN_EMAIL` | Admin email for notifications | Your email |
| `SITE_URL` | Public site URL | Your Vercel domain or custom domain |

---

## 🚢 Deployment to Vercel

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Initial HireEU v2 commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/hireeu-vercel.git
git push -u origin main
```

**Important:** In Vercel settings, set **Root Directory** to `hireeu-vercel` (if nested in folder structure).

### Step 2: Connect Vercel to GitHub
1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repo
4. Select **Node.js** runtime

### Step 3: Add Environment Variables
In Vercel Dashboard → Project → Settings → Environment Variables:
- Add all variables from `ENV_VARIABLES.txt`
- Keep them secret (check "Encrypted" option)

### Step 4: Deploy
```bash
vercel --prod
```

Or push to `main` branch — Vercel auto-deploys.

### Troubleshooting Common Deployment Issues

**Issue:** `Cannot find module 'pg'`  
**Solution:** Ensure `package.json` is in the root; set Vercel Root Directory correctly.

**Issue:** Database connection fails  
**Solution:** Verify `DATABASE_URL` is correct and Neon IP whitelist includes Vercel servers (`0.0.0.0/0`).

**Issue:** Groq API 401 error  
**Solution:** Check `GROQ_API_KEY` is valid and not expired. Test locally first.

**Issue:** CV parsing returns "Groq API Key not configured"  
**Solution:** Verify env var is set in Vercel Settings (not in `.env.local`, which won't deploy).

---

## 🧠 Matching Algorithm

The job matching engine scores jobs across **10 dimensions** using semantic analysis:

1. **Location fit** — Preference vs. job location
2. **Salary alignment** — Expected vs. posted salary
3. **Language requirements** — User languages vs. job language needs
4. **Role relevance** — Job title similarity to user's primary role
5. **Skill overlap** — How many of user's skills match job requirements
6. **Experience level** — User seniority vs. job level
7. **Work type** — Remote/hybrid/onsite preference
8. **Industry match** — User's career sector vs. job industry
9. **Company reputation** — Job source credibility
10. **Growth potential** — Career advancement opportunity

Each dimension is scored A–F; the final **match percentage** is computed as a weighted average.

---

## 🔐 Security & Privacy

### Password Security
- Passwords are hashed using **bcryptjs** (10-round salt)
- Never stored in plaintext
- JWT tokens issued after successful login (expiry: 7 days)

### Database Security
- Neon PostgreSQL uses **SSL/TLS** encryption
- User data is isolated by `user_id` (UUID)
- Candidate profiles & preferences deleted on account deletion

### GDPR Compliance
- Privacy policy available at `/privacy.html`
- Email confirmation required for waitlist signup
- User data export & deletion on request
- No third-party tracking or analytics

---

## 📊 Current Status

✅ **Completed:**
- Full MVP: CV upload → AI parsing → Job matching → Cover letter generation
- User authentication with persistent profiles
- Multi-source job aggregation (JSearch, Adzuna, custom scraper)
- Email confirmation for waitlist
- GDPR privacy policy
- Vercel deployment automation

🔄 **In Progress / Planned:**
- Clerk.dev authentication upgrade (optional, for enterprise features)
- Enhanced Polish job board scraper (JustJoinIT, NoFluffJobs, EnglishJobs.pl)
- Salary transparency & negotiation tips
- Job alert subscriptions (daily/weekly digests)
- Referral program for early users
- Mobile app (iOS/Android)

---

## 🤝 Contributing

Contributions welcome! To contribute:

1. **Fork** the repo
2. Create a **feature branch**: `git checkout -b feature/your-feature`
3. **Commit** changes: `git commit -m "Add your feature"`
4. **Push** to your fork: `git push origin feature/your-feature`
5. Open a **Pull Request**

---

## 📞 Support & Contact

**Questions or issues?**
- Open a GitHub issue: https://github.com/AbelHazi3110/hireeu-vercel/issues
- Email: [your-email@example.com]
- Live site: https://hireeu.vercel.app

---

## 📄 License

This project is licensed under the **MIT License** — see LICENSE file for details.

---

## 🙏 Acknowledgments

- **Groq** for fast, free AI inference
- **Neon** for serverless PostgreSQL
- **Vercel** for seamless Node.js deployment
- **RapidAPI** for JSearch job aggregation
- **Adzuna** for EU job market data
- Early testers from Warsaw, Kraków, Wrocław, and Gdańsk expat communities

---

**Built with ❤️ for foreigners navigating the EU job market.**
