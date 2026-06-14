/**
 * FootballIQ v5 — /netlify/functions/referee
 * Fetches referee statistics from football-data.co.uk (free, no auth)
 * Returns cards/game, penalty rate, home bias for a specific referee
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
  // Returns 0-1 similarity: 1 = exact match
  a = a.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  b = b.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  if (a === b) return 1;
  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  // Check last name match (most reliable)
  if (aParts.at(-1) === bParts.at(-1)) return 0.9;
  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return 0.8;
  return 0;
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
  // Find matches by this referee (with fuzzy name matching)
  const matches = rows.filter(r => {
    const ref = r["Referee"] || r["referee"] || "";
    return ref && nameScore(ref, name) >= 0.8;
  });

  if (matches.length < 3) return null;

  // Use the most common spelling of the name
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

  // Penalty approximation — many FDCO csvs have HP/AP columns
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

// ── HANDLER ──────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type":                 "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const { name, competition } = event.queryStringParameters || {};
  if (!name) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "name param required" }) };
  }

  // Determine which league CSV(s) to fetch
  const codes = competition ? (LEAGUE_CODES[competition] || []) : [];
  // If no known competition or international, try EPL + other top leagues
  const fetchCodes = codes.length > 0 ? codes : ["E0", "SP1", "D1", "I1", "F1"];

  let allRows = [];
  // Fetch current and previous season for each league code
  const fetches = fetchCodes.flatMap(code => SEASONS.map(s => fetchCSV(code, s)));
  const results = await Promise.allSettled(fetches);

  results.forEach(r => {
    if (r.status === "fulfilled" && r.value) allRows = allRows.concat(r.value);
  });

  if (allRows.length === 0) {
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ success: false, reason: "Could not fetch football-data.co.uk CSV" }),
    };
  }

  const stats = aggregateRefereeStats(allRows, name);
  if (!stats) {
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ success: false, reason: `Referee "${name}" not found or fewer than 3 matches in database` }),
    };
  }

  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({ success: true, data: stats }),
  };
};
