// Liquipedia MediaWiki API client: rate limited, disk cached, terms-compliant.
// Terms (https://liquipedia.net/api-terms-of-use):
//   - MediaWiki API only (never rendered HTML pages)
//   - <= 1 request per 2 s (action=parse: 1 per 30 s, so we never use it)
//   - custom User-Agent with contact, gzip support, re-use the HTTP client (fetch keeps connections alive)
//   - cache results as long as possible, never repeat requests that return the same data
// Node 22+, no dependencies. Behind a proxy, run with NODE_USE_ENV_PROXY=1.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_URL = 'https://liquipedia.net/valorant/api.php';
/** Other Liquipedia wikis we read (same terms, same shared rate limit). `commons` hosts team templates and image files. */
const apiUrlFor = (wiki = 'valorant') => `https://liquipedia.net/${wiki}/api.php`;
export const USER_AGENT = 'RoadToChampions/0.1 (fan project; github.com/guilhermefreitasdev/road-to-champions)';
export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'liquipedia');

/** Minimum gap between two HTTP requests (terms: 1 per 2 s). A little slack on top. */
const MIN_GAP_MS = 2100;
/** Max titles per prop=revisions request (MediaWiki limit for anonymous clients). */
export const MAX_TITLES = 50;
/** Gap for Lua-rendering requests (action=expandtemplates), treated like action=parse (terms: <= 1 per 30 s).
 * 65 s because the server answered 429 to some of these calls when they were 30 s apart. */
const HEAVY_GAP_MS = 65_000;
/** Shared across processes so back-to-back runs also respect the limit. */
const LAST_REQUEST_FILE = join(CACHE_DIR, '.last-request');
const LAST_HEAVY_FILE = join(CACHE_DIR, '.last-heavy-request');

export const stats = { requests: 0, cacheHits: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readStamp(file) {
  try {
    return Number(await readFile(file, 'utf8')) || 0;
  } catch {
    return 0;
  }
}

async function waitForSlot(heavy) {
  const now = Date.now();
  let wait = (await readStamp(LAST_REQUEST_FILE)) + MIN_GAP_MS - now;
  if (heavy) wait = Math.max(wait, (await readStamp(LAST_HEAVY_FILE)) + HEAVY_GAP_MS - now);
  if (wait > 0) await sleep(wait);
  await mkdir(CACHE_DIR, { recursive: true });
  const stamp = String(Date.now());
  await writeFile(LAST_REQUEST_FILE, stamp);
  if (heavy) await writeFile(LAST_HEAVY_FILE, stamp);
}

/** One GET to api.php. Never called for action=parse. Retries politely on 429/5xx. */
async function apiGet(params, wiki = 'valorant') {
  if (params.action === 'parse') throw new Error('action=parse is not used by this client (30 s rate limit)');
  const heavy = params.action === 'expandtemplates';
  const search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  // Long wikitext snippets go in a POST body instead of the URL.
  const post = heavy;
  const base = apiUrlFor(wiki);
  const url = post ? base : `${base}?${search}`;
  for (let attempt = 1; ; attempt++) {
    await waitForSlot(heavy);
    stats.requests++;
    const res = await fetch(url, {
      method: post ? 'POST' : 'GET',
      body: post ? search : undefined,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip', Accept: 'application/json' },
    });
    if (res.status === 200) {
      const body = await res.json();
      if (body.error) throw new Error(`API error ${body.error.code}: ${body.error.info}`);
      return body;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
      const backoff = Math.max(retryAfter, 60_000 * attempt);
      console.warn(`HTTP ${res.status} for ${url}; waiting ${backoff / 1000}s before retry ${attempt}`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`GET ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
}

const pageFile = (title, wiki = 'valorant') => {
  const safe = title.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  const hash = createHash('sha1').update(title).digest('hex').slice(0, 8);
  // The valorant wiki keeps the original layout; other wikis get their own folder.
  return join(CACHE_DIR, wiki === 'valorant' ? 'pages' : `pages-${wiki}`, `${safe}.${hash}.json`);
};

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data)}\n`, 'utf8');
}

/**
 * Wikitext of many pages, batched (<= 50 titles per request) and cached per requested title.
 * Follows redirects. Returns Map<requestedTitle, { title, pageid, revid, timestamp, content } | { title, missing: true }>.
 * offline: only the cache is used; uncached titles come back as { title, uncached: true }.
 */
export async function getPages(titles, { refresh = false, offline = false, wiki = 'valorant' } = {}) {
  const out = new Map();
  const todo = [];
  for (const t of [...new Set(titles)]) {
    const cached = refresh ? undefined : await readJson(pageFile(t, wiki));
    if (cached) {
      stats.cacheHits++;
      out.set(t, cached);
    } else if (offline) {
      out.set(t, { title: t, uncached: true });
    } else {
      todo.push(t);
    }
  }
  for (let i = 0; i < todo.length; i += MAX_TITLES) {
    const batch = todo.slice(i, i + MAX_TITLES);
    const body = await apiGet({
      action: 'query',
      prop: 'revisions',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
      redirects: '1',
      titles: batch.join('|'),
    }, wiki);
    const q = body.query ?? {};
    // requested -> normalized -> redirect target
    const resolve = (t) => {
      let cur = t;
      for (const n of q.normalized ?? []) if (n.from === cur) cur = n.to;
      for (const r of q.redirects ?? []) if (r.from === cur) cur = r.to;
      return cur;
    };
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
    let done = 0;
    for (const t of batch) {
      const p = byTitle.get(resolve(t));
      // Response size cap reached: the page exists but its content was deferred to a continuation.
      if (p && !p.missing && !p.invalid && !p.revisions?.length && body.continue) {
        todo.push(t);
        continue;
      }
      done++;
      let entry;
      if (!p || p.missing || p.invalid || !p.revisions?.length) {
        entry = { title: resolve(t), missing: true };
      } else {
        const rev = p.revisions[0];
        entry = {
          title: p.title,
          pageid: p.pageid,
          revid: rev.revid,
          timestamp: rev.timestamp,
          content: rev.slots?.main?.content ?? '',
        };
        if (p.title !== t) entry.requestedTitle = t;
      }
      await writeJson(pageFile(t, wiki), entry);
      out.set(t, entry);
    }
    if (done === 0) throw new Error(`no progress fetching ${batch.length} titles (response size limit?)`);
  }
  return out;
}

export async function getPage(title, opts) {
  return (await getPages([title], opts)).get(title);
}

/** Any other read-only query (e.g. list=search, list=allpages), cached by its parameters. */
export async function query(params, { refresh = false, offline = false, wiki = 'valorant' } = {}) {
  const key = createHash('sha1').update(JSON.stringify(wiki === 'valorant' ? params : { wiki, ...params })).digest('hex');
  const file = join(CACHE_DIR, 'queries', `${key}.json`);
  if (!refresh) {
    const cached = await readJson(file);
    if (cached) {
      stats.cacheHits++;
      return cached.body;
    }
  }
  if (offline) throw new Error(`offline and not cached: ${JSON.stringify(params)}`);
  const body = await apiGet({ action: 'query', ...params }, wiki);
  await writeJson(file, { params, wiki, body });
  return body;
}

/**
 * Expands a wikitext snippet in the context of a page (runs Lua modules server side). Same cost class as
 * action=parse, so it gets the 30 s gap. Used only for TeamParticipants opponents with import=true, whose
 * players come from Liquipedia's database and are absent from the page wikitext. Cached by (title, revid, text).
 */
export async function expand(title, revid, text, { refresh = false, offline = false } = {}) {
  const key = createHash('sha1').update(`${title}\n${revid}\n${text}`).digest('hex');
  const file = join(CACHE_DIR, 'expanded', `${key}.json`);
  if (!refresh) {
    const cached = await readJson(file);
    if (cached) {
      stats.cacheHits++;
      return cached.wikitext;
    }
  }
  if (offline) return undefined;
  const body = await apiGet({ action: 'expandtemplates', prop: 'wikitext', title, revid: String(revid), text });
  const wikitext = body.expandtemplates?.wikitext ?? '';
  await writeJson(file, { title, revid, wikitext });
  return wikitext;
}

/**
 * Image info (file URL, size, MIME, upload date, uploader-facing description URL) for many `File:` titles,
 * batched (<= 50 per request) and cached per title. `width` asks for a server-side thumbnail URL too.
 * Returns Map<requestedTitle, { title, url, thumburl?, width, height, mime, timestamp, descriptionurl } | { title, missing: true }>.
 */
export async function imageInfo(titles, { refresh = false, offline = false, wiki = 'valorant', width } = {}) {
  const out = new Map();
  const todo = [];
  const fileOf = (t) =>
    join(CACHE_DIR, 'imageinfo', `${createHash('sha1').update(`v2\n${wiki}\n${width ?? ''}\n${t}`).digest('hex')}.json`);
  for (const t of [...new Set(titles)]) {
    const cached = refresh ? undefined : await readJson(fileOf(t));
    if (cached) {
      stats.cacheHits++;
      out.set(t, cached);
    } else if (offline) {
      out.set(t, { title: t, uncached: true });
    } else {
      todo.push(t);
    }
  }
  for (let i = 0; i < todo.length; i += MAX_TITLES) {
    const batch = todo.slice(i, i + MAX_TITLES);
    const params = {
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|timestamp|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|Artist|Credit',
      redirects: '1',
      titles: batch.join('|'),
    };
    if (width) params.iiurlwidth = String(width);
    const body = await apiGet(params, wiki);
    const q = body.query ?? {};
    const resolve = (t) => {
      let cur = t;
      for (const n of q.normalized ?? []) if (n.from === cur) cur = n.to;
      for (const r of q.redirects ?? []) if (r.from === cur) cur = r.to;
      return cur;
    };
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      const p = byTitle.get(resolve(t));
      const ii = p?.imageinfo?.[0];
      const entry = ii
        ? {
            title: p.title,
            url: ii.url,
            thumburl: ii.thumburl,
            width: ii.width,
            height: ii.height,
            mime: ii.mime,
            timestamp: ii.timestamp,
            descriptionurl: ii.descriptionurl,
            license: ii.extmetadata?.LicenseShortName?.value ?? null,
            artist: ii.extmetadata?.Artist?.value ?? null,
            credit: ii.extmetadata?.Credit?.value ?? null,
          }
        : { title: resolve(t), missing: true };
      await writeJson(fileOf(t), entry);
      out.set(t, entry);
    }
  }
  return out;
}

/**
 * Downloads one image file served by liquipedia.net (an imageinfo URL), through the same shared 1-per-2-s
 * limiter as the API. Cached by URL in .cache/liquipedia/files/; never downloaded twice unless refresh.
 * Returns a Buffer, or undefined when offline and not cached.
 */
export async function getFile(url, { refresh = false, offline = false } = {}) {
  if (!/^https:\/\/liquipedia\.net\//.test(url)) throw new Error(`not a liquipedia.net file: ${url}`);
  const ext = (url.match(/\.(png|jpe?g|webp|svg|gif)(?:$|\?)/i)?.[1] ?? 'bin').toLowerCase();
  const file = join(CACHE_DIR, 'files', `${createHash('sha1').update(url).digest('hex')}.${ext}`);
  if (!refresh) {
    try {
      const buf = await readFile(file);
      stats.cacheHits++;
      return buf;
    } catch {
      // not cached
    }
  }
  if (offline) return undefined;
  for (let attempt = 1; ; attempt++) {
    await waitForSlot(false);
    stats.requests++;
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip', Accept: 'image/*' } });
    } catch (err) {
      // Transient network error (proxy hiccup, reset): retried like a 5xx.
      if (attempt >= 4) throw err;
      console.warn(`${err.message} for ${url}; waiting 30s before retry ${attempt}`);
      await sleep(30_000);
      continue;
    }
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, buf);
      return buf;
    }
    await res.body?.cancel();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
      const backoff = Math.max(retryAfter, 60_000 * attempt);
      console.warn(`HTTP ${res.status} for ${url}; waiting ${backoff / 1000}s before retry ${attempt}`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`GET ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
}
