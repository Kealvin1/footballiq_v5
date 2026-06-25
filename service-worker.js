/**
 * FootballIQ v5 — service-worker.js
 * PWA service worker for:
 * 1. Offline cache of the last loaded analysis (read-only)
 * 2. Background fixture monitoring — checks shortlisted matches
 *    and fires push notifications when lineups drop or edge
 *    crosses the user's alert threshold
 */

const CACHE_NAME = "footballiq-v5-shell";
const SHELL_URLS = ["/", "/index.html"];

// ── INSTALL: cache the app shell ─────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: serve shell from cache when offline ────────────────────────
self.addEventListener("fetch", e => {
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    );
    return;
  }
  // API calls always go to network (never serve stale data)
  if (e.request.url.includes("/api/")) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── BACKGROUND SYNC: fixture monitoring ──────────────────────────────
// Triggered by the main thread via postMessage({type:'CHECK_ALERTS'})
self.addEventListener("message", async e => {
  if (e.data?.type !== "CHECK_ALERTS") return;

  const { shortlist, thresholds } = e.data;
  if (!shortlist?.length) return;

  const now = Date.now();
  const alerts = [];

  for (const item of shortlist) {
    try {
      // Only check fixtures within the next 2h window
      const kickoff = new Date(item.kickoff).getTime();
      if (kickoff - now > 2 * 60 * 60 * 1000) continue;
      if (kickoff < now) continue; // already kicked off

      // Lightweight check: has lineup status changed?
      const mins = Math.round((kickoff - now) / 60000);
      if (mins <= 90 && item.lineupStatus !== "verified" && item.lineupStatus !== "confirmed") {
        alerts.push({
          title: `⏰ ${item.team1} vs ${item.team2}`,
          body:  `Kickoff in ${mins} min — check if lineups have dropped`,
          tag:   `lineup-${item.team1}-${item.team2}`,
        });
      }
    } catch (err) {
      console.warn("SW: alert check error", err.message);
    }
  }

  // Fire notifications for any alerts found
  for (const alert of alerts) {
    const existing = await self.registration.getNotifications({ tag: alert.tag });
    if (existing.length) continue; // already notified for this match
    await self.registration.showNotification(alert.title, {
      body:    alert.body,
      icon:    "/favicon.ico",
      badge:   "/favicon.ico",
      tag:     alert.tag,
      renotify: false,
      data:    { url: "/" },
    });
  }
});

// ── NOTIFICATION CLICK: open the app ─────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
