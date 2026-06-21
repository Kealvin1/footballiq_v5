/**
 * FootballIQ v5 — /api/referee (Vercel Function)
 * Fetches referee statistics AND team corner statistics from
 * football-data.co.uk (free, no auth). Two modes share the same CSV
 * fetch: ?name=X for referee stats, ?team1=X&team2=Y for corner stats.
 */

"use strict";

// ── COMPETITION → FDCO CODES ─────────────────────────────────────────
const LEAGUE_CODES = {
  "Premier League":    ["E0"],
  "Championship":      ["E1"],
  "La Liga":           ["SP1"],
  "Serie A":           ["I1"],
  "Bundesliga":        ["D1"],
  "Ligue 1":           ["F1"],
  "Eredivisie":        ["N1"],
  "Primeira Liga":     ["P1"],
  "Scottish Premiership": ["SC0"],
  "Belgian Pro League":["B1"],
  "Turkish Süper Lig": ["T1"],
  "Greek Super League":["G1"],
};

// Season codes: "2526" = 2025-26, "2425" = 2024-25
const SEASONS = ["2526", "2425"];
const BASE    = "https://www.football-data.co.uk/mmz4281";

// ── CSV PARSER ───────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/\r/g, ""));
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/\r/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] || ""]));
  }).filter(row => Object.values(row).some(v => v !== ""));
}

function safeInt(v) { const n = parseInt(v); return isNaN(n) ? 0 : n; }

// ── REFEREE NAME MATCHING ─────────────────────────────────────────────
function nameScore(a, b) {
  a = a.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  b = b.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  if (a === b) return 1;
  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  if (aParts.at(-1) === bParts.at(-1)) return 0.9;
  if (a.includes(b) || b.includes(a)) return 0.8;
  return 0;
}

// ── TEAM NAME MATCHING — conservative, avoids silent wrong-team matches ──
// Requires BOTH: first word prefix-matches (e.g. "Man"→"Manchester") AND
// last word matches exactly (e.g. "City"=="City"). Tested against known
// abbreviation patterns (Utd/United, Nott'm/Nottingham) via a small alias
// list — deliberately kept short rather than comprehensive: an unmatched
// team correctly falls back to "no data", safer than an over-eager list
// risking a false match between different clubs (e.g. Man City/Leicester City).
const WORD_ALIASES = { "utd": "united", "nottm": "nottingham" };
function normWord(w) { return WORD_ALIASES[w] || w; }

function teamNameMatch(a, b) {
  const norm = s => (s || "").toLowerCase().replace(/[^a-z\s]/g, "").trim();
  a = norm(a); b = norm(b);
  if (!a || !b) return false;
  if (a === b) return true;
  const aWords = a.split(/\s+/).filter(w => w.length > 1).map(normWord);
  const bWords = b.split(/\s+/).filter(w => w.length > 1).map(normWord);
  if (aWords.length === 0 || bWords.length === 0) return false;
  const aFirst = aWords[0], bFirst = bWords[0];
  const aLast  = aWords.at(-1), bLast = bWords.at(-1);
  const firstMatch = aFirst === bFirst || aFirst.startsWith(bFirst) || bFirst.startsWith(aFirst);
  const lastMatch  = aLast === bLast;
  return firstMatch && lastMatch;
}

// ── TEAM CORNER STATS — reuses the SAME CSV rows already fetched for
// referee stats. No new external dependency, no new fetch call.
function aggregateTeamCornerStats(rows, teamName) {
  const matches = rows.filter(r => teamNameMatch(r.HomeTeam, teamName) || teamNameMatch(r.AwayTeam, teamName));
  if (matches.length < 3) return null;

  let cornersFor = 0, cornersAgainst = 0;
  let homeFor = 0, homeAgainst = 0, homeCount = 0;
  let awayFor = 0, awayAgainst = 0, awayCount = 0;

  matches.forEach(m => {
    const isHome = teamNameMatch(m.HomeTeam, teamName);
    const hc = safeInt(m.HC), ac = safeInt(m.AC);
    if (isHome) {
      cornersFor += hc; cornersAgainst += ac;
      homeFor += hc; homeAgainst += ac; homeCount++;
    } else {
      cornersFor += ac; cornersAgainst += hc;
      awayFor += ac; awayAgainst += hc; awayCount++;
    }
  });

  const total = matches.length;
  return {
    matches:               total,
    corners_for_per_game:     +(cornersFor / total).toFixed(2),
    corners_against_per_game: +(cornersAgainst / total).toFixed(2),
    match_corners_avg:        +((cornersFor + cornersAgainst) / total).toFixed(2),
    home_corners_for:      homeCount > 0 ? +(homeFor / homeCount).toFixed(2) : null,
    home_corners_against:  homeCount > 0 ? +(homeAgainst / homeCount).toFixed(2) : null,
    away_corners_for:      awayCount > 0 ? +(awayFor / awayCount).toFixed(2) : null,
    away_corners_against:  awayCount > 0 ? +(awayAgainst / awayCount).toFixed(2) : null,
  };
}

async function fetchCSV(leagueCode, season) {
  const url = `${BASE}/${season}/${leagueCode}.csv`;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FootballIQ/5.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return parseCSV(await resp.text());
  } catch {
    return null;
  }
}

function aggregateRefereeStats(rows, name) {
  const matches = rows.filter(r => {
    const ref = r["Referee"] || r["referee"] || "";
    return ref && nameScore(ref, name) >= 0.8;
  });

  if (matches.length < 3) return null;

  const nameCount = {};
  matches.forEach(m => {
    const ref = m["Referee"] || "";
    nameCount[ref] = (nameCount[ref] || 0) + 1;
  });
  const canonicalName = Object.entries(nameCount).sort((a, b) => b[1] - a[1])[0][0];

  const total    = matches.length;
  const totYell  = matches.reduce((s, m) => s + safeInt(m.HY) + safeInt(m.AY), 0);
  const totRed   = matches.reduce((s, m) => s + safeInt(m.HR) + safeInt(m.AR), 0);
  const totCards = totYell + totRed;

  const totPen = matches.reduce((s, m) => {
    return s + safeInt(m.HP || 0) + safeInt(m.AP || 0);
  }, 0);

  const homeWins  = matches.filter(m => safeInt(m.FTHG) > safeInt(m.FTAG)).length;

  return {
    name:              canonicalName || name,
    matches:           total,
    cards_per_game:    +(totCards / total).toFixed(2),
    yellow_per_game:   +(totYell  / total).toFixed(2),
    red_per_game:      +(totRed   / total).toFixed(2),
    penalties_per_game:+(totPen   / total).toFixed(2),
    home_win_rate:     Math.round(homeWins / total * 100),
    personality:       totCards / total > 5   ? "Strict — high card volume"
                     : totCards / total < 3   ? "Lenient — low card volume"
                     : "Average card rate",
  };
}

// ── CORS HEADERS ─────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { name, competition, team1, team2 } = req.query || {};
  if (!name && !(team1 && team2)) {
    res.status(400).json({ error: "name OR team1+team2 params required" });
    return;
  }

  const codes = competition ? (LEAGUE_CODES[competition] || []) : [];
  const fetchCodes = codes.length > 0 ? codes : ["E0", "SP1", "D1", "I1", "F1"];

  let allRows = [];
  const fetches = fetchCodes.flatMap(code => SEASONS.map(s => fetchCSV(code, s)));
  const results = await Promise.allSettled(fetches);

  results.forEach(r => {
    if (r.status === "fulfilled" && r.value) allRows = allRows.concat(r.value);
  });

  if (allRows.length === 0) {
    res.status(200).json({ success: false, reason: "Could not fetch football-data.co.uk CSV" });
    return;
  }

  // Team corner stats mode — reuses the SAME fetched rows, no extra fetch.
  if (team1 && team2) {
    const corners1 = aggregateTeamCornerStats(allRows, team1);
    const corners2 = aggregateTeamCornerStats(allRows, team2);
    res.status(200).json({ success: !!(corners1 || corners2), team1: corners1, team2: corners2 });
    return;
  }

  // Referee stats mode — unchanged from before.
  const stats = aggregateRefereeStats(allRows, name);
  if (!stats) {
    res.status(200).json({ success: false, reason: `Referee "${name}" not found or fewer than 3 matches in database` });
    return;
  }

  res.status(200).json({ success: true, data: stats });
};
