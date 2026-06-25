/**
 * FootballIQ v5 — /api/results (Vercel Function)
 * Auto-settles bet history entries by looking up real match results
 * via api-football.com (free tier: 100 calls/day).
 *
 * Called from the History tab's auto-check button with the bet details.
 * Returns: {found:bool, homeScore, awayScore, winner:"home"|"draw"|"away", status:"FT"|"NS"|...}
 */

"use strict";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Map competition names to api-football.com league IDs (top competitions)
const LEAGUE_IDS = {
  "Premier League":           39,
  "La Liga":                  140,
  "Serie A":                  135,
  "Bundesliga":               78,
  "Ligue 1":                  61,
  "UEFA Champions League":    2,
  "UEFA Europa League":       3,
  "UEFA Conference League":   848,
  "World Cup":                1,
  "AFCON":                    6,
  "Copa America":             9,
  "Euros":                    4,
  "MLS":                      253,
  "Liga MX":                  262,
  "Eredivisie":               88,
  "Primeira Liga":            94,
  "Scottish Premiership":     179,
  "Brazilian Serie A":        71,
  "Argentine Primera":        128,
  "Saudi Pro League":         307,
};

// Fuzzy team name matching — handles prefixes (FC, RCD, CF, AS, SS, SC etc.)
// and abbreviations (Man City / Manchester City) without false positives.
// Strategy:
//   1. Strip common organisation prefixes from both names
//   2. If either name is fully contained in the other → match
//   3. Last meaningful word must match AND first meaningful word prefix-matches
//      BUT require at least 2 characters of prefix match on the first word
//      to prevent "West Ham" matching "West Brom" (both start "West")
const IGNORE_PREFIXES = new Set(["fc","af","ac","as","sc","ss","cd","rcd","ud","sd",
  "cf","bk","sk","fk","nk","afc","cfc","utd","if","il","al","ij"]);

function stripPrefixes(words) {
  while (words.length > 1 && IGNORE_PREFIXES.has(words[0])) words = words.slice(1);
  return words;
}

function teamMatches(apiName, searchName) {
  if (!apiName || !searchName) return false;
  const norm = s => s.toLowerCase().replace(/[^a-z\s]/g,"").trim();
  const aN = norm(apiName), bN = norm(searchName);
  if (aN === bN) return true;
  const aW = stripPrefixes(aN.split(/\s+/).filter(Boolean));
  const bW = stripPrefixes(bN.split(/\s+/).filter(Boolean));
  if (!aW.length || !bW.length) return false;
  // Full containment check after prefix stripping
  const aJoined = aW.join(" "), bJoined = bW.join(" ");
  if (aJoined.includes(bJoined) || bJoined.includes(aJoined)) return true;
  // Last word must match exactly
  if (aW.at(-1) !== bW.at(-1)) return false;
  // First word: must prefix-match AND share at least 3 chars
  const aFirst = aW[0], bFirst = bW[0];
  const prefixMatch = aFirst.startsWith(bFirst) || bFirst.startsWith(aFirst);
  const sharedLen = Math.min(aFirst.length, bFirst.length);
  if (!prefixMatch || sharedLen < 3) return false;
  // Multi-word teams where the last word is generic (United, City, Town, etc.):
  // also require the second word to prefix-match, preventing
  // "West Ham United" matching "West Bromwich United" (second words: ham ≠ bromwich)
  if (aW.length >= 3 && bW.length >= 3) {
    const a2 = aW[1], b2 = bW[1];
    const second = a2 === b2 || a2.startsWith(b2) || b2.startsWith(a2);
    if (!second) return false;
  }
  return true;
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { team1, team2, competition, date } = req.query || {};
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    res.status(200).json({ found: false, reason: "API_FOOTBALL_KEY not configured" });
    return;
  }
  if (!team1 || !team2) {
    res.status(400).json({ found: false, reason: "team1 and team2 required" });
    return;
  }

  const leagueId = competition ? LEAGUE_IDS[competition] : null;

  // Search window: the date the bet was placed ±2 days
  const betDate = date ? new Date(date) : new Date();
  const fromDate = new Date(betDate); fromDate.setDate(fromDate.getDate() - 1);
  const toDate   = new Date(betDate); toDate.setDate(toDate.getDate() + 2);
  const fmt = d => d.toISOString().split("T")[0];

  try {
    // Build search URL — use league if known, else broader search
    const params = new URLSearchParams({
      team: team1,
      from: fmt(fromDate),
      to:   fmt(toDate),
      ...(leagueId ? { league: leagueId, season: new Date().getFullYear() } : {}),
    });

    const resp = await fetch(
      `https://v3.football.api-sports.io/fixtures?${params}`,
      {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) {
      res.status(200).json({ found: false, reason: `api-football returned ${resp.status}` });
      return;
    }

    const data = await resp.json();
    const fixtures = data.response || [];

    // Find the fixture matching both teams
    const match = fixtures.find(f => {
      const home = f.teams?.home?.name || "";
      const away = f.teams?.away?.name || "";
      return (
        (teamMatches(home, team1) && teamMatches(away, team2)) ||
        (teamMatches(home, team2) && teamMatches(away, team1))
      );
    });

    if (!match) {
      res.status(200).json({ found: false, reason: "Match not found in api-football database for this date range" });
      return;
    }

    const status  = match.fixture?.status?.short; // FT, NS, 1H, 2H, HT, etc.
    const homeGoals = match.goals?.home;
    const awayGoals = match.goals?.away;
    const homeTeam  = match.teams?.home?.name;
    const awayTeam  = match.teams?.away?.name;

    // Only settle if match is finished
    if (status !== "FT" && status !== "AET" && status !== "PEN") {
      res.status(200).json({
        found: true,
        settled: false,
        status,
        homeTeam, awayTeam,
        reason: `Match not yet finished (status: ${status})`,
      });
      return;
    }

    // Determine winner for 1X2 market settlement
    let winner = "draw";
    if (homeGoals > awayGoals) winner = "home";
    if (awayGoals > homeGoals) winner = "away";

    res.status(200).json({
      found:      true,
      settled:    true,
      status,
      homeTeam,  awayTeam,
      homeScore: homeGoals,
      awayScore: awayGoals,
      winner,
      // Return the original team order so frontend can map correctly
      team1IsHome: teamMatches(homeTeam, team1),
    });

  } catch (e) {
    res.status(200).json({ found: false, reason: e.message });
  }
};
