/**
 * FootballIQ v5 — scripts/snap-odds.js
 * Run by GitHub Actions every 2 hours (.github/workflows/snap-odds.yml).
 * NOT a Vercel function — this is a plain Node.js script that fetches
 * opening-line odds and writes them directly into the repo as JSON files
 * under data/opening-lines/. The workflow then commits and pushes them.
 *
 * This replaces the old Netlify-Blobs-based snap-odds.js function —
 * no database needed, the GitHub repo itself is the storage.
 */

"use strict";

const fs = require("fs");
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

const OUT_DIR = path.join(__dirname, "..", "data", "opening-lines");

async function fetchOdds(sportKey, apiKey) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log("snap-odds: ODDS_API_KEY not set — skipping snapshot");
    return;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const today = new Date().toISOString().split("T")[0];
  let snapped = 0;

  // Run all sports in parallel — GitHub Actions runners aren't time-limited
  // the way Netlify free-tier functions were, but parallel is still faster.
  const results = await Promise.allSettled(
    TOP_SPORTS.map(async (sport) => {
      const filePath = path.join(OUT_DIR, `${sport}-${today}.json`);
      if (fs.existsSync(filePath)) {
        return { sport, snapped: false, reason: "already have opening line today" };
      }
      const data = await fetchOdds(sport, apiKey);
      if (data && data.length > 0) {
        fs.writeFileSync(filePath, JSON.stringify(data));
        return { sport, snapped: true, count: data.length };
      }
      return { sport, snapped: false, reason: "no data returned" };
    })
  );

  results.forEach(r => {
    const v = r.status === "fulfilled" ? r.value : { snapped: false, reason: "rejected" };
    if (v.snapped) snapped++;
    console.log(`snap-odds: ${v.sport || "?"} — ${v.snapped ? `saved (${v.count} games)` : v.reason}`);
  });

  console.log(`snap-odds: done. ${snapped}/${TOP_SPORTS.length} new snapshots saved.`);
}

main().catch(e => {
  console.error("snap-odds: fatal error:", e.message);
  process.exit(1);
});
