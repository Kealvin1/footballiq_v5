/**
 * FootballIQ v5 — /netlify/functions/snap-odds
 * Scheduled: runs every 2 hours (cron: "0 * /2 * * *")
 * Snapshots current odds for major competitions to build
 * opening-line movement data over time
 */

"use strict";

const { getStore } = require("@netlify/blobs");

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

async function fetchOdds(sportKey, apiKey) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

exports.handler = async () => {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log("snap-odds: ODDS_API_KEY not set — skipping snapshot");
    return { statusCode: 200, body: "no key" };
  }

  const store  = getStore("fiq-odds-snapshots");
  const today  = new Date().toISOString().split("T")[0];
  const ts     = Date.now();
  let snapped  = 0;

  for (const sport of TOP_SPORTS) {
    // Only save the FIRST snapshot each day — this becomes the opening line
    const openingKey = `opening:${sport}:${today}`;
    try {
      const existing = await store.get(openingKey).catch(() => null);
      if (!existing) {
        const data = await fetchOdds(sport, apiKey);
        if (data && data.length > 0) {
          await store.set(openingKey, JSON.stringify(data), { metadata: { ts, sport, today } });
          snapped++;
          console.log(`snap-odds: stored opening line for ${sport} (${data.length} games)`);
        }
      }
    } catch (e) {
      console.error(`snap-odds: error for ${sport}:`, e.message);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ snapped, ts, sports: TOP_SPORTS.length }),
  };
};
