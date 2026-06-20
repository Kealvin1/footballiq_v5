/**
 * FootballIQ v5 — /netlify/functions/snap-odds
 * Triggered every 2 hours by GitHub Actions (.github/workflows/snap-odds.yml)
 * via a simple HTTP GET — NOT a Netlify-billed scheduled function.
 * Snapshots current odds for major competitions to build
 * opening-line movement data over time.
 *
 * IMPORTANT: all sports are fetched in PARALLEL (not sequential) to stay
 * well under Netlify's free-tier 10-second function execution timeout.
 * The previous sequential version (8 sports x up to 8s timeout + delay)
 * could take up to ~66s worst case, causing HTTP 502 timeouts.
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
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

async function processSport(sport, apiKey, store, today, ts) {
  const openingKey = `opening:${sport}:${today}`;
  try {
    const existing = await store.get(openingKey).catch(() => null);
    if (existing) return { sport, snapped: false, reason: "already have opening line today" };

    const data = await fetchOdds(sport, apiKey);
    if (data && data.length > 0) {
      await store.set(openingKey, JSON.stringify(data), { metadata: { ts, sport, today } });
      return { sport, snapped: true, count: data.length };
    }
    return { sport, snapped: false, reason: "no data returned" };
  } catch (e) {
    return { sport, snapped: false, reason: e.message };
  }
}

exports.handler = async () => {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log("snap-odds: ODDS_API_KEY not set — skipping snapshot");
    return { statusCode: 200, body: "no key" };
  }

  const store = getStore("fiq-odds-snapshots");
  const today = new Date().toISOString().split("T")[0];
  const ts = Date.now();

  // Run ALL sports in parallel — total time ≈ slowest single fetch (~5s max),
  // not the sum of all 8 fetches. This is what keeps us under the timeout.
  const settled = await Promise.allSettled(
    TOP_SPORTS.map(sport => processSport(sport, apiKey, store, today, ts))
  );

  const results = settled.map(r => r.status === "fulfilled" ? r.value : { snapped: false, reason: "rejected" });
  const snapped = results.filter(r => r.snapped).length;

  console.log("snap-odds results:", JSON.stringify(results));

  return {
    statusCode: 200,
    body: JSON.stringify({ snapped, ts, sports: TOP_SPORTS.length, details: results }),
  };
};
