// /api/team-stats.js
// Returns team goal averages for the Poisson model when Understat xG is unavailable (Tier 2/3)
// Deploy in /api/ alongside xg.js, odds.js, referee.js, results.js

const fetch = require('node-fetch');
const API_BASE = 'https://v3.football.api-sports.io';
const KEY = process.env.API_FOOTBALL_KEY;
const HEADERS = { 'x-apisports-key': KEY };

// Competition name → API-Football league ID + season
function leagueInfo(comp) {
  const c = (comp || '').toLowerCase();
  if (c.includes('world cup'))                                return { id: 1,   season: 2026 };
  if (c.includes('champions league'))                         return { id: 2,   season: 2025 };
  if (c.includes('europa league'))                            return { id: 3,   season: 2025 };
  if (c.includes('conference league'))                        return { id: 848, season: 2025 };
  if (c.includes('premier league'))                           return { id: 39,  season: 2025 };
  if (c.includes('la liga'))                                  return { id: 140, season: 2025 };
  if (c.includes('bundesliga'))                               return { id: 78,  season: 2025 };
  if (c.includes('serie a'))                                  return { id: 135, season: 2025 };
  if (c.includes('ligue 1'))                                  return { id: 61,  season: 2025 };
  if (c.includes('mls'))                                      return { id: 253, season: 2025 };
  if (c.includes('chinese super league') || c.includes('csl')) return { id: 169, season: 2025 };
  if (c.includes('j1') || c.includes('j-league'))            return { id: 98,  season: 2025 };
  if (c.includes('eredivisie'))                               return { id: 88,  season: 2025 };
  if (c.includes('primeira liga') || c.includes('portugal')) return { id: 94,  season: 2025 };
  if (c.includes('nations league'))                           return { id: 8,   season: 2024 };
  if (c.includes('euro ') || c.includes('european championship')) return { id: 4, season: 2024 };
  if (c.includes('copa america'))                             return { id: 9,   season: 2024 };
  if (c.includes('afcon') || c.includes('african cup'))      return { id: 6,   season: 2025 };
  return { id: 1, season: 2026 }; // default: World Cup 2026
}

// Search for team ID — league-scoped first (reliable), global fallback (risky, last resort)
async function findTeamId(name, li) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nName = norm(name);

  // ── Strategy 1: search within the specific league (most reliable) ──
  const r1 = await fetch(
    `${API_BASE}/teams?league=${li.id}&season=${li.season}&search=${encodeURIComponent(name)}`,
    { headers: HEADERS }
  );
  const d1 = await r1.json();
  if (d1.response?.length) return d1.response[0].team.id;

  // ── Strategy 2: exact name match across all teams in that league ──
  const r2 = await fetch(
    `${API_BASE}/teams?league=${li.id}&season=${li.season}`,
    { headers: HEADERS }
  );
  const d2 = await r2.json();
  const teams = d2.response || [];

  // Exact normalized match first
  const exact = teams.find(t => norm(t.team.name) === nName);
  if (exact) return exact.team.id;

  // Partial match: one name must contain the other (min 4 chars to avoid false positives)
  if (nName.length >= 4) {
    const partial = teams.find(t => {
      const tn = norm(t.team.name);
      return (tn.includes(nName) || nName.includes(tn)) && Math.min(tn.length, nName.length) >= 4;
    });
    if (partial) return partial.team.id;
  }

  // ── Strategy 3: global name search (last resort — risk of wrong team) ──
  const r3 = await fetch(
    `${API_BASE}/teams?name=${encodeURIComponent(name)}`,
    { headers: HEADERS }
  );
  const d3 = await r3.json();
  // Only trust global result if name is a very close match
  const globalMatch = (d3.response || []).find(t => norm(t.team.name) === nName);
  return globalMatch?.team.id || null;
}

async function getTeamStats(teamName, li) {
  try {
    const teamId = await findTeamId(teamName, li);
    if (!teamId) return null;

    const r = await fetch(
      `${API_BASE}/teams/statistics?team=${teamId}&league=${li.id}&season=${li.season}`,
      { headers: HEADERS }
    );
    const d = await r.json();
    const s = d.response;
    if (!s) return null;

    const gh = s.fixtures?.played?.home || 0;
    const ga = s.fixtures?.played?.away || 0;
    const gfh = s.goals?.for?.total?.home || 0;
    const gfa = s.goals?.for?.total?.away || 0;
    const gah = s.goals?.against?.total?.home || 0;
    const gaa = s.goals?.against?.total?.away || 0;

    // Need minimum 3 games to be meaningful
    if (gh + ga < 3) return null;

    return {
      teamId,
      teamName: s.team?.name || teamName,
      gamesHome: gh,
      gamesAway: ga,
      home_goals_for_avg:     gh > 0 ? +(gfh / gh).toFixed(2) : null,
      away_goals_for_avg:     ga > 0 ? +(gfa / ga).toFixed(2) : null,
      home_goals_against_avg: gh > 0 ? +(gah / gh).toFixed(2) : null,
      away_goals_against_avg: ga > 0 ? +(gaa / ga).toFixed(2) : null,
      form: s.form?.slice(-10) || null,  // last 10 results e.g. "WDLWW..."
    };
  } catch (e) {
    console.error('getTeamStats error for', teamName, ':', e.message);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600'); // cache 1 hour in CDN

  const { team1, team2, comp } = req.query;
  if (!team1 || !team2) return res.status(400).json({ error: 'Missing team1 or team2' });
  if (!KEY) return res.status(500).json({ error: 'API_FOOTBALL_KEY not configured' });

  try {
    const li = leagueInfo(comp);
    // Fetch both teams in parallel to minimize latency
    const [s1, s2] = await Promise.all([
      getTeamStats(team1, li),
      getTeamStats(team2, li),
    ]);
    res.json({ team1: s1, team2: s2, league: li });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
