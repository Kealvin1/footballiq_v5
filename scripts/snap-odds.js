/**
 * FootballIQ v5 — scripts/snap-odds.js
 * Run by GitHub Actions (.github/workflows/snap-odds.yml).
 * NOT a Vercel function — this is a plain Node.js script.
 *
 * SMART SCHEDULING:
 * - Runs every 15 minutes (via GitHub Actions cron: every 15 min during
 *   the active window, standard 2h otherwise)
 * - Outside the active window (2h before first kickoff today): takes one
 *   opening-line snapshot and exits, same as before
 * - Inside the active window (within 2h of ANY fixture today): runs the
 *   full snapshot to capture sharp-money line movement at high resolution
 *   — this is where the real signal lives
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const TOP_SPORTS = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_usa_mls",
];

// Only take high-resolution active-window snapshots for the top 3 by commercial
// importance — cuts active-window Odds API calls from 8→3 per run, bringing
// monthly usage from ~2160 → ~720 calls, well within the 500/month free tier
// on quiet months and only slightly over on busy ones. Opening lines are still
// saved for all 8 sports once per day (8 calls/day = 240/month — always fine).
const HIGH_RES_SPORTS = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_uefa_champs_league",
];

const OUT_DIR  = path.join(__dirname, "..", "data", "opening-lines");
const MOVE_DIR = path.join(__dirname, "..", "data", "line-movement");

async function fetchOdds(sportKey, apiKey) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

// Check if now is within 2 hours of any fixture in a sport's odds data
function hasImminent(data) {
  if (!data?.length) return false;
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  return data.some(g => {
    const kick = new Date(g.commence_time).getTime();
    return kick > now && (kick - now) < twoHours;
  });
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) { console.log("snap-odds: ODDS_API_KEY not set — skipping"); return; }

  [OUT_DIR, MOVE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) });

  const today = new Date().toISOString().split("T")[0];
  const ts    = Date.now();
  let snapped = 0, movement = 0;

  const results = await Promise.allSettled(
    TOP_SPORTS.map(async (sport) => {
      const data = await fetchOdds(sport, apiKey);
      if (!data || !data.length) return { sport, snapped: false, reason: "no data" };

      // OPENING LINE — save once per sport per day (unchanged logic)
      const openPath = path.join(OUT_DIR, `${sport}-${today}.json`);
      if (!fs.existsSync(openPath)) {
        fs.writeFileSync(openPath, JSON.stringify(data));
        snapped++;
        console.log(`snap-odds: ${sport} — opening line saved (${data.length} games)`);
      }

      // HIGH-RESOLUTION MOVEMENT SNAPSHOT — only during the active window
      // Saves timestamped snapshots so the odds.js function can compare
      // current price against the opening line at fine resolution.
      if (hasImminent(data) && HIGH_RES_SPORTS.includes(sport)) {
        const movePath = path.join(MOVE_DIR, `${sport}-${today}-${ts}.json`);
        fs.writeFileSync(movePath, JSON.stringify({ ts, sport, data }));
        movement++;
        console.log(`snap-odds: ${sport} — active window snapshot saved (${data.length} games)`);

        // Prune old movement snapshots (keep only last 24h to avoid repo bloat)
        const cutoff = ts - 24 * 60 * 60 * 1000;
        fs.readdirSync(MOVE_DIR)
          .filter(f => f.startsWith(sport) && f.endsWith(".json"))
          .forEach(f => {
            const fts = parseInt(f.split("-").at(-1));
            if (!isNaN(fts) && fts < cutoff) {
              fs.unlinkSync(path.join(MOVE_DIR, f));
            }
          });
      }

      return { sport, snapped: true };
    })
  );

  results.forEach(r => {
    if (r.status === "rejected") console.log("snap-odds: rejected:", r.reason);
  });

  console.log(`snap-odds: done. ${snapped} new opening lines, ${movement} active-window snapshots.`);
}

main().catch(e => { console.error("snap-odds: fatal:", e.message); process.exit(1); });
