# FootballIQ v5

AI-powered football match predictions with **real xG data**, **live odds**, **referee stats** and **line movement** — powered by Claude Sonnet + Netlify Functions.

---

## What's new in v5 vs v4

| Feature | v4 | v5 |
|---|---|---|
| xG data | Estimated by AI | **Real data from Understat** (EPL/La Liga/Bundesliga/Serie A/Ligue 1) |
| Referee stats | Web-searched | **Real stats from football-data.co.uk** (cards/game, penalty rate) |
| Live odds | Browser (key exposed) | **Server-side proxy** (key hidden) |
| Line movement | None | **Opening vs current odds** (from every-2h snapshots) |
| API keys | In browser | **Secured in Netlify env vars** |

---

## Setup (10 minutes)

### 1. Create a Netlify account
Go to [netlify.com](https://netlify.com) → Sign up free.

### 2. Push to GitHub
Create a new GitHub repository and push this folder to it:
```bash
git init
git add .
git commit -m "FootballIQ v5"
git remote add origin https://github.com/YOUR_USERNAME/footballiq-v5.git
git push -u origin main
```

### 3. Connect to Netlify
- Netlify dashboard → **Add new site** → **Import an existing project**
- Choose GitHub → select your `footballiq-v5` repository
- Build settings are auto-detected from `netlify.toml`
- Click **Deploy site**

### 4. Set environment variables
Netlify dashboard → Your site → **Site configuration** → **Environment variables** → **Add a variable**:

| Key | Value | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✅ Yes |
| `ODDS_API_KEY` | Your Odds API key | Optional (enables live odds) |

Get your Anthropic key at [console.anthropic.com](https://console.anthropic.com)
Get a free Odds API key at [the-odds-api.com](https://the-odds-api.com) (500 free requests/month)

### 5. Redeploy
After setting env vars: **Deploys** → **Trigger deploy** → **Deploy site**

### 6. Open the app
Your site will be at `https://your-site-name.netlify.app`

On first use, open ⚙ Settings and enter your Anthropic API key. This is used for the AI analysis phases; it's stored in your browser only.

---

## Local development

Install [Netlify CLI](https://docs.netlify.com/cli/get-started/):
```bash
npm install -g netlify-cli
netlify login
```

Create a `.env` file from the template:
```bash
cp .env.example .env
# Edit .env and add your real keys
```

Run locally:
```bash
npm install
netlify dev
```
App will be at `http://localhost:8888` with all Netlify Functions available.

---

## Project structure

```
footballiq-v5/
├── index.html                    ← The app (all UI, all features)
├── netlify.toml                  ← Build config + scheduled function
├── package.json                  ← Node.js deps (@netlify/blobs)
├── .env.example                  ← Environment variable template
└── netlify/functions/
    ├── xg.js                     ← Real xG from Understat (5 leagues)
    ├── referee.js                ← Referee stats from football-data.co.uk
    ├── odds.js                   ← Live odds proxy + line movement
    └── snap-odds.js              ← Scheduled: snapshots odds every 2h
```

---

## How each Netlify Function works

### `xg.js` — Real xG data
- Fetches team pages from [understat.com](https://understat.com)
- Parses last 10 matches: xGF, xGA, actual goals per game
- Returns home/away splits separately for more accurate analysis
- Supports: Premier League, La Liga, Bundesliga, Serie A, Ligue 1
- Falls back gracefully for unsupported competitions

### `referee.js` — Referee statistics  
- Downloads season CSV files from [football-data.co.uk](https://www.football-data.co.uk/data.php) (completely free)
- Searches for the referee by name (fuzzy matching)
- Returns: cards/game, yellow/red split, penalty rate, home win % in their matches
- Supports 12 leagues across current + previous season

### `odds.js` — Live odds + line movement
- Proxies The Odds API server-side (key never exposed to browser)
- Stores first snapshot of each day in Netlify Blob Storage (opening lines)
- Returns current odds + opening odds + calculated line movement signal

### `snap-odds.js` — Scheduled snapshotter
- Runs every 2 hours automatically (Netlify Scheduled Functions)
- Captures opening lines for 8 major competitions
- Enables line movement detection after first run of each day

---

## Data quality by competition

| Competition | xG | Referee stats | Live odds | Line movement |
|---|---|---|---|---|
| Premier League | ✅ Understat | ✅ FDCO | ✅ if key set | ✅ after 1st snapshot |
| La Liga | ✅ | ✅ | ✅ | ✅ |
| Bundesliga | ✅ | ✅ | ✅ | ✅ |
| Serie A | ✅ | ✅ | ✅ | ✅ |
| Ligue 1 | ✅ | ✅ | ✅ | ✅ |
| UCL/UEL | ❌ web search | ❌ web search | ✅ | ✅ |
| Other leagues | ❌ web search | partial | varies | varies |

---

## Cost

| Service | Cost |
|---|---|
| Netlify hosting + functions | **Free** (125k function calls/month) |
| Understat xG data | **Free** (no API key, no rate limits for personal use) |
| football-data.co.uk referee stats | **Free** |
| Anthropic API (claude-sonnet-4-6) | ~€0.14/prediction |
| The Odds API | Free (500 req/month) or $10-50/month |

---

## Troubleshooting

**Icons not showing** — Netlify deployment needed (icons load from jsDelivr CDN)

**xG data not loading** — Check team name spelling. Team names must roughly match Understat's naming. Common alternates: "Man City" → "Manchester City", "Spurs" → "Tottenham", "PSG" → "Paris Saint Germain"

**Odds not loading** — Set `ODDS_API_KEY` in Netlify environment variables

**Function timeout** — Data functions (xg, referee, odds) are fast (<5s). If timing out, check Netlify function logs

**Line movement shows "Normal"** — The snap-odds function needs to have run at least once before the current odds load to compute movement. Wait for the next 2h snapshot cycle.
