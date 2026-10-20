/*
 * Road to Champions service worker: installable, offline app. Hand-written, no dependencies.
 *
 * This file is a template: the `pwa` plugin (scripts/pwa-plugin.mjs) fills in __VERSION__, __BASE__ and __PRECACHE__ and
 * emits it as sw.js at the root of dist/ in production builds (never in the claude.ai preview build). Registered by
 * src/ui/sw-register.ts.
 *
 * Caches (all named rtc-*; activate deletes any rtc-* cache not listed in KEEP):
 * - rtc-shell-<version>: the app shell and every built asset of this version (precached on install). Hashed
 *   assets are cache-first; the page itself (navigations) is network-first, falling back to the cached shell
 *   offline or after NAV_TIMEOUT_MS without an answer.
 * - rtc-media-v1: maps, agents, team logos, player photos and the Valdle's minimaps and icons (public/media/), cached on demand,
 *   stale-while-revalidate, trimmed to MEDIA_MAX entries.
 * - rtc-fonts-v1: the Google Fonts stylesheet and font files, stale-while-revalidate.
 *
 * A new version installs in the background and takes over once every tab of the old one is closed (no
 * skipWaiting), so an open game never mixes chunks of two deploys.
 */
const VERSION = '__VERSION__';
const BASE = '__BASE__';
/** Paths relative to BASE. */
const PRECACHE = __PRECACHE__;

const SHELL = `rtc-shell-${VERSION}`;
const MEDIA = 'rtc-media-v1';
const FONTS = 'rtc-fonts-v1';
const KEEP = [SHELL, MEDIA, FONTS];
const MEDIA_MAX = 1500;
const NAV_TIMEOUT_MS = 4000;
const INDEX = `${BASE}index.html`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // no-cache: revalidate with the server, so the shell is never a stale copy from the HTTP cache.
      cache.addAll(PRECACHE.map((path) => new Request(BASE + path, { cache: 'no-cache' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('rtc-') && !KEEP.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Lets a future "Atualizar" button activate a waiting version.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(navigate(event));
      return;
    }
    if (url.pathname.startsWith(`${BASE}media/`)) {
      event.respondWith(staleWhileRevalidate(event, MEDIA, request, MEDIA_MAX));
      return;
    }
    if (url.pathname.startsWith(`${BASE}assets/`) || PRECACHED.has(url.pathname)) {
      event.respondWith(cacheFirst(request));
    }
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, FONTS, request));
  }
});

const PRECACHED = new Set(PRECACHE.map((path) => BASE + path));

/** Network first (fresh deploys show up at once), the cached shell when offline or too slow. */
async function navigate(event) {
  const cache = await caches.open(SHELL);
  const network = fetch(event.request).then((response) => {
    if (response.ok && response.type === 'basic') event.waitUntil(cache.put(INDEX, response.clone()));
    return response;
  });
  network.catch(() => undefined); // handled below; avoids an unhandled rejection when the timeout wins
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    // Too slow: the cached shell if there is one, else keep waiting for the network.
    return (await caches.match(INDEX)) ?? (await network);
  } catch {
    return (await caches.match(INDEX)) ?? Response.error();
  }
}

/** Hashed build assets never change: any cached copy (this version or an older one) is good. */
async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL);
    await cache.put(request, response.clone());
  }
  return response;
}

/** The cached copy right away when there is one, refreshed in the background (cheap: media is long-cached). */
async function staleWhileRevalidate(event, cacheName, request, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request).then(async (response) => {
    // Opaque responses (status 0) are never stored: their size is unknown and padded against the quota.
    if (response.ok) {
      await cache.put(request, response.clone());
      if (max) await trim(cache, max);
    }
    return response;
  });
  if (hit) {
    event.waitUntil(update.catch(() => undefined));
    return hit;
  }
  return update;
}

/** Drops the oldest entries (keys come back in insertion order) beyond `max`. */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
