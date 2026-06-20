/**
 * FootballIQ v5 — /api/odds (Vercel Function)
 * Proxies The Odds API (server-side key, no CORS issues)
 * Reads opening-line snapshots from the GitHub repo (written every 2h by
 * .github/workflows/snap-odds.yml) to calculate line movement — no
 * database needed, since Vercel KV has been sunset as a product.
 */

"use strict";

// ── COMPETITION → ODDS API SPORT KEY ────────────────────────────────
const SPORT_MAP = {
  "Premier League":           "soccer_epl",
  "Championship":             "soccer_epl_championship",
  "La Liga":                  "soccer_spain_la_liga",
  "Serie A":                  "soccer_italy_serie_a",
  "Bundesliga":               "soccer_germany_bundesliga",
  "Ligue 1":                  "soccer_france_ligue_one",
  "Eredivisie":               "soccer_netherlands_eredivisie",
  "Primeira Liga":            "soccer_portugal_primeira_liga",
  "UEFA Champions League":    "soccer_uefa_champs_league",
  "UEFA Europa League":       "soccer_uefa_europa_league",
  "UEFA Conference League":   "soccer_uefa_europa_conference_league",
  "MLS":                      "soccer_usa_mls",
  "Liga MX":                  "soccer_mexico_ligamx",
  "Saudi Pro League":         "soccer_saudi_professional_league",
  "Argentine Primera":        "soccer_argentina_primera_division",
  "Serie A (Brazil)":         "soccer_brazil_campeonato",
  "Turkish Süper Lig":        "soccer_turkey_super_league",
  "Scottish Premiership":     "soccer_scotland_premiership",
  "Belgian Pro League":       "soccer_belgium_first_div",
  "J-League":                 "soccer_japan_j_league",
  "K-League":                 "soccer_korea_kleague1",
  "A-League (Australia)":     "soccer_australia_aleague",
};

// ── CORS HEADERS ─────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// GitHub repo where snap-odds.yml writes opening-line JSON snapshots
const GH_RAW_BASE = "https://raw.githubusercontent.com/Kealvin1/footballiq_v5/main/data/opening-lines";

// ── OPENING LINE READ (from GitHub repo, written by GitHub Actions) ──
async function getOpeningLine(sportKey, today) {
  try {
    const url = `${GH_RAW_BASE}/${sportKey}-${today}.json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null; // file doesn't exist yet today — normal, not an error
    return await resp.json();
  } catch { return null; }
}

// ── ODDS FETCH ────────────────────────────────────────────────────────
async function fetchOdds(sportKey, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`);
  url.searchParams.set("apiKey",      apiKey);
  url.searchParams.set("regions",     "eu,uk");
  url.searchParams.set("markets",     "h2h,totals,btts");
  url.searchParams.set("oddsFormat",  "decimal");
  url.searchParams.set("dateFormat",  "iso");

  const resp = await fetch(url.toString(), {
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Odds API ${resp.status}: ${text.slice(0, 100)}`);
  }
  return resp.json();
}

// ── COMPUTE LINE MOVEMENT ─────────────────────────────────────────────
function computeMovement(current, opening) {
  if (!opening || !current) return null;
  const movement = [];
  for (const game of current) {
    const opener = opening.find(g =>
      g.home_team === game.home_team && g.away_team === game.away_team
    );
    if (!opener) continue;

    const getH2H = (bookmakers, outcome) => {
      for (const b of bookmakers) {
        const mkt = b.markets?.find(m => m.key === "h2h");
        const o   = mkt?.outcomes?.find(o => o.name === outcome);
        if (o) return o.price;
      }
      return null;
    };

    const curW1  = getH2H(game.bookmakers,   game.home_team);
    const openW1 = getH2H(opener.bookmakers, game.home_team);
    const curW2  = getH2H(game.bookmakers,   game.away_team);
    const openW2 = getH2H(opener.bookmakers, game.away_team);

    if (!curW1 || !openW1) continue;

    const moveW1 = openW1 - curW1; // positive = shortened (money on home)
    movement.push({
      home_team:  game.home_team,
      away_team:  game.away_team,
      commence:   game.commence_time,
      open_w1:    openW1,  current_w1: curW1,  move_w1: +moveW1.toFixed(2),
      open_w2:    openW2,  current_w2: curW2,
      signal: moveW1 > 0.2  ? `Sharp money on ${game.home_team} — line shortened from ${openW1} → ${curW1}`
            : moveW1 < -0.2 ? `Money drifting from ${game.home_team} — line drifted from ${openW1} → ${curW1}`
            : "Normal market drift — no clear sharp signal",
    });
  }
  return movement;
}

// ── HANDLER ──────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { competition } = req.query || {};
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    res.status(200).json({ success: false, reason: "ODDS_API_KEY not configured in Vercel environment variables" });
    return;
  }

  const sportKey = SPORT_MAP[competition];
  if (!sportKey) {
    res.status(200).json({ success: false, reason: `${competition} not supported by The Odds API` });
    return;
  }

  try {
    const today   = new Date().toISOString().split("T")[0];
    const current = await fetchOdds(sportKey, apiKey);

    // Opening line is READ-ONLY here — it's written separately by the
    // GitHub Actions snap-odds workflow every 2 hours, not by this function.
    const opening = await getOpeningLine(sportKey, today);

    const movement = computeMovement(current, opening || current);

    res.status(200).json({ success: true, games: current, movement });
  } catch (e) {
    res.status(200).json({ success: false, reason: e.message });
  }
};
