/**
 * FootballIQ v5 — /api/xg (Vercel Function)
 * Fetches real xG data from Understat for EPL, La Liga, Bundesliga, Serie A, Ligue 1
 * Returns last-10-match xG stats split by home/away + regression signal
 */

"use strict";

// ── COMPETITION → UNDERSTAT LEAGUE KEY ───────────────────────────────
const LEAGUE_MAP = {
  "Premier League":  "EPL",
  "La Liga":         "La_liga",
  "Serie A":         "Serie_A",
  "Bundesliga":      "Bundesliga",
  "Ligue 1":         "Ligue_1",
};

// Current season start year — update each August
const CURRENT_YEAR = 2025; // 2025-26 season

// ── TEAM NAME → UNDERSTAT SLUG ───────────────────────────────────────
const SLUG_MAP = {
  // Premier League
  "arsenal":"Arsenal","man city":"Manchester_City","manchester city":"Manchester_City",
  "man utd":"Manchester_United","manchester united":"Manchester_United","man united":"Manchester_United",
  "liverpool":"Liverpool","chelsea":"Chelsea","tottenham":"Tottenham","spurs":"Tottenham",
  "newcastle":"Newcastle_United","newcastle united":"Newcastle_United",
  "aston villa":"Aston_Villa","west ham":"West_Ham","west ham united":"West_Ham",
  "brighton":"Brighton","brentford":"Brentford","fulham":"Fulham","everton":"Everton",
  "nottm forest":"Nottingham_Forest","nottingham forest":"Nottingham_Forest",
  "wolves":"Wolverhampton_Wanderers","wolverhampton":"Wolverhampton_Wanderers",
  "crystal palace":"Crystal_Palace","leicester":"Leicester","leicester city":"Leicester",
  "ipswich":"Ipswich","southampton":"Southampton","burnley":"Burnley","luton":"Luton",
  "sheffield utd":"Sheffield_United","sheffield united":"Sheffield_United",
  "bournemouth":"Bournemouth","west brom":"West_Brom","sunderland":"Sunderland",
  // La Liga
  "real madrid":"Real_Madrid","barcelona":"Barcelona","fc barcelona":"Barcelona",
  "atletico madrid":"Atletico_Madrid","atletico":"Atletico_Madrid",
  "sevilla":"Sevilla","villarreal":"Villarreal","real sociedad":"Real_Sociedad",
  "athletic bilbao":"Athletic_Club","athletic club":"Athletic_Club",
  "real betis":"Real_Betis","betis":"Real_Betis","valencia":"Valencia",
  "osasuna":"Osasuna","getafe":"Getafe","rayo vallecano":"Rayo_Vallecano",
  "celta vigo":"Celta_Vigo","celta":"Celta_Vigo","mallorca":"Mallorca",
  "girona":"Girona","alaves":"Alaves","las palmas":"Las_Palmas",
  "leganes":"Leganes","espanyol":"Espanyol","cadiz":"Cadiz",
  "granada":"Granada","almeria":"Almeria",
  // Bundesliga
  "bayern munich":"Bayern_Munich","bayern":"Bayern_Munich","fc bayern":"Bayern_Munich",
  "borussia dortmund":"Borussia_Dortmund","dortmund":"Borussia_Dortmund","bvb":"Borussia_Dortmund",
  "bayer leverkusen":"Bayer_Leverkusen","leverkusen":"Bayer_Leverkusen",
  "rb leipzig":"RasenBallsport_Leipzig","leipzig":"RasenBallsport_Leipzig",
  "eintracht frankfurt":"Eintracht_Frankfurt","frankfurt":"Eintracht_Frankfurt",
  "borussia monchengladbach":"Borussia_Moenchengladbach","gladbach":"Borussia_Moenchengladbach",
  "sc freiburg":"SC_Freiburg","freiburg":"SC_Freiburg",
  "union berlin":"Union_Berlin","vfb stuttgart":"VfB_Stuttgart","stuttgart":"VfB_Stuttgart",
  "hoffenheim":"Hoffenheim","werder bremen":"Werder_Bremen","bremen":"Werder_Bremen",
  "mainz":"Mainz","augsburg":"Augsburg","wolfsburg":"Wolfsburg",
  "bochum":"VfL_Bochum","vfl bochum":"VfL_Bochum","heidenheim":"Heidenheim",
  "cologne":"FC_Koeln","fc koln":"FC_Koeln","koln":"FC_Koeln","darmstadt":"Darmstadt",
  // Serie A
  "juventus":"Juventus","juve":"Juventus",
  "inter milan":"Internazionale","inter":"Internazionale","internazionale":"Internazionale",
  "ac milan":"AC_Milan","milan":"AC_Milan","napoli":"Napoli","ssc napoli":"Napoli",
  "as roma":"AS_Roma","roma":"AS_Roma","lazio":"Lazio","atalanta":"Atalanta",
  "fiorentina":"Fiorentina","torino":"Torino","bologna":"Bologna","sassuolo":"Sassuolo",
  "udinese":"Udinese","empoli":"Empoli","lecce":"Lecce",
  "hellas verona":"Hellas_Verona","verona":"Hellas_Verona","monza":"Monza",
  "salernitana":"Salernitana","frosinone":"Frosinone","genoa":"Genoa",
  "venezia":"Venezia","cagliari":"Cagliari","parma":"Parma","como":"Como",
  // Ligue 1
  "psg":"Paris_Saint_Germain","paris saint germain":"Paris_Saint_Germain","paris sg":"Paris_Saint_Germain",
  "marseille":"Marseille","om":"Marseille","lyon":"Lyon","olympique lyonnais":"Lyon",
  "monaco":"Monaco","as monaco":"Monaco","nice":"Nice","ogc nice":"Nice",
  "rennes":"Rennes","stade rennais":"Rennes","lens":"Lens","rc lens":"Lens",
  "lille":"Lille","losc":"Lille","strasbourg":"Strasbourg","montpellier":"Montpellier",
  "nantes":"Nantes","toulouse":"Toulouse","reims":"Reims","stade reims":"Reims",
  "brest":"Brest","le havre":"Le_Havre","clermont":"Clermont","metz":"Metz",
  "lorient":"Lorient","angers":"Angers","auxerre":"Auxerre",
  "saint etienne":"Saint-Etienne","st etienne":"Saint-Etienne",
};

// ── HELPERS ──────────────────────────────────────────────────────────
function findSlug(name) {
  const n = name.toLowerCase().trim()
    .replace(/\bfc\b/gi, "").replace(/\bsc\b/gi, "").replace(/\s+/g, " ").trim();
  if (SLUG_MAP[n]) return SLUG_MAP[n];
  // Try removing common suffixes
  for (const suffix of [" united", " city", " town", " fc", " cf"]) {
    const trimmed = n.replace(new RegExp(suffix + "$"), "").trim();
    if (SLUG_MAP[trimmed]) return SLUG_MAP[trimmed];
  }
  // Fallback: capitalize words and join with underscores
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join("_");
}

function parseUnderstatJSON(html, varName) {
  const re = new RegExp(`var ${varName}\\s*=\\s*JSON\\.parse\\('([\\s\\S]*?)'\\)\\s*;`, "i");
  const m = html.match(re);
  if (!m) return null;
  try {
    const decoded = m[1]
      .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function fetchTeamData(slug, year) {
  const url = `https://understat.com/team/${encodeURIComponent(slug)}/${year}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FootballIQ/5.0; +https://footballiq.app)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  return parseUnderstatJSON(html, "datesData");
}

function processMatches(raw, teamSlug) {
  if (!Array.isArray(raw)) return null;
  const completed = raw.filter(m => m.isResult === true);
  if (completed.length < 3) return null;

  const processed = completed.map(m => {
    // Determine if this team played home: compare slugified home team title
    const homeSlug = (m.h?.title || "").replace(/\s+/g, "_");
    const isHome = homeSlug === teamSlug
      || homeSlug.toLowerCase() === teamSlug.toLowerCase()
      || m.side === "h";

    return {
      date:   m.datetime?.split(" ")[0] || "",
      home:   isHome,
      xGF:    parseFloat(isHome ? m.xG?.h : m.xG?.a) || 0,
      xGA:    parseFloat(isHome ? m.xG?.a : m.xG?.h) || 0,
      goalsF: parseInt(isHome ? m.goals?.h : m.goals?.a) || 0,
      goalsA: parseInt(isHome ? m.goals?.a : m.goals?.h) || 0,
    };
  });

  const last10   = processed.slice(-10);
  const homeM    = last10.filter(m => m.home);
  const awayM    = last10.filter(m => !m.home);
  const avgXGF   = avg(last10.map(m => m.xGF));
  const avgXGA   = avg(last10.map(m => m.xGA));
  const avgGoals = avg(last10.map(m => m.goalsF));
  const overperf = avgGoals - avgXGF;

  return {
    matches:        last10.length,
    avg_xGF:        +avgXGF.toFixed(2),
    avg_xGA:        +avgXGA.toFixed(2),
    avg_goals:      +avgGoals.toFixed(2),
    xg_overperf:    +overperf.toFixed(2),
    regression:     overperf > 0.3  ? "OVERPERFORMING — goals likely to regress DOWN"
                  : overperf < -0.3 ? "UNDERPERFORMING — goals likely to regress UP"
                  : "Well calibrated to xG",
    home_avg_xGF:   +(avg(homeM.map(m => m.xGF))).toFixed(2),
    home_avg_xGA:   +(avg(homeM.map(m => m.xGA))).toFixed(2),
    away_avg_xGF:   +(avg(awayM.map(m => m.xGF))).toFixed(2),
    away_avg_xGA:   +(avg(awayM.map(m => m.xGA))).toFixed(2),
    home_matches:   homeM.length,
    away_matches:   awayM.length,
    recent_5:       last10.slice(-5).map(m => ({
      date:   m.date,
      home:   m.home,
      xGF:    m.xGF,
      xGA:    m.xGA,
      goals:  `${m.goalsF}-${m.goalsA}`,
    })),
  };
}

// ── HANDLER ──────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { team, competition } = req.query || {};

  if (!team) {
    res.status(400).json({ error: "team param required" });
    return;
  }

  const league = LEAGUE_MAP[competition];
  if (!league) {
    res.status(200).json({ success: false, reason: `${competition} not in Understat (EPL/La Liga/Bundesliga/Serie A/Ligue 1 only)` });
    return;
  }

  const slug = findSlug(team);

  // Try current season, fall back to previous
  let raw = await fetchTeamData(slug, CURRENT_YEAR);
  let usedYear = CURRENT_YEAR;
  if (!raw || raw.filter(m => m.isResult).length < 5) {
    raw = await fetchTeamData(slug, CURRENT_YEAR - 1);
    usedYear = CURRENT_YEAR - 1;
  }

  if (!raw) {
    res.status(200).json({ success: false, reason: `No xG data found for "${team}" — team name may differ on Understat` });
    return;
  }

  const data = processMatches(raw, slug);
  if (!data) {
    res.status(200).json({ success: false, reason: `Insufficient match data for "${team}" (need at least 3 results)` });
    return;
  }

  res.status(200).json({ success: true, team, slug, season: `${usedYear}-${usedYear + 1}`, data });
};
