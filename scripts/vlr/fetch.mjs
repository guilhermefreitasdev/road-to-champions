// Polite HTTP client for vlr.gg with an on-disk cache.
// - sequential requests, at least MIN_INTERVAL_MS between network requests
// - identifies itself with a fan-project User-Agent
// - retries 429/5xx with exponential backoff (max 3 retries)
// - aborts after MAX_CONSECUTIVE_FAILURES failed URLs in a row
// - re-reads robots.txt at startup and refuses disallowed paths
// - caches every page at .cache/vlr/<url-path>.html; cached pages are never re-fetched unless refresh=true

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'https://www.vlr.gg';
export const USER_AGENT = 'RoadToChampions/0.1 (fan project; github.com/guilhermefreitasdev/road-to-champions)';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = join(ROOT, '.cache', 'vlr');

const MIN_INTERVAL_MS = 2500;
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Maps a vlr.gg path (with optional query) to its cache file. Query params are sorted for stability. */
export function cachePathFor(pathWithQuery) {
  const url = new URL(pathWithQuery, BASE);
  let p = url.pathname.replace(/\/+$/, '') || '/index';
  const params = [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (params.length) p += `__${params.map(([k, v]) => `${k}=${v}`).join('&')}`;
  p = p.replace(/[^A-Za-z0-9/_\-=&.]/g, '_');
  return join(CACHE_DIR, `${p}.html`);
}

/** Parses the `User-agent: *` group of a robots.txt into a list of Disallow prefixes. */
export function parseRobots(text) {
  const disallow = [];
  let applies = false;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (sawRule) {
        applies = false;
        sawRule = false;
      }
      if (value === '*' || /roadtochampions/i.test(value)) applies = true;
    } else {
      sawRule = true;
      if (applies && key === 'disallow' && value) disallow.push(value);
    }
  }
  return disallow;
}

export class VlrClient {
  constructor({ refresh = false, offline = false, log = console.log } = {}) {
    this.refresh = refresh;
    this.offline = offline;
    this.log = log;
    this.disallow = null;
    this.lastRequestAt = 0;
    this.consecutiveFailures = 0;
    this.requests = 0;
    this.cacheHits = 0;
  }

  /** Re-reads robots.txt (always from the network unless offline). */
  async init() {
    if (this.offline) {
      try {
        this.disallow = parseRobots(await readFile(join(CACHE_DIR, 'robots.txt'), 'utf8'));
      } catch {
        this.disallow = ['/search/auto', '/rr/'];
      }
      return;
    }
    const text = await this.#network('/robots.txt');
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(join(CACHE_DIR, 'robots.txt'), text, 'utf8');
    this.disallow = parseRobots(text);
    this.log(`robots.txt: disallow ${this.disallow.join(', ') || '(nothing)'}`);
  }

  isAllowed(pathWithQuery) {
    const url = new URL(pathWithQuery, BASE);
    const p = url.pathname + url.search;
    return !(this.disallow ?? []).some((rule) => p.startsWith(rule));
  }

  /** Returns the HTML of a vlr.gg page, from cache when possible. */
  async get(pathWithQuery) {
    if (!this.disallow) throw new Error('VlrClient.init() must be called first');
    if (!this.isAllowed(pathWithQuery)) throw new Error(`robots.txt disallows ${pathWithQuery}`);
    const file = cachePathFor(pathWithQuery);
    if (!this.refresh || this.offline) {
      try {
        const html = await readFile(file, 'utf8');
        this.cacheHits++;
        return html;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        if (this.offline) throw new Error(`offline: ${pathWithQuery} is not cached (${file})`);
      }
    }
    const html = await this.#network(pathWithQuery);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html, 'utf8');
    return html;
  }

  /** Is this page in the cache? (no network) */
  async isCached(pathWithQuery) {
    try {
      await readFile(cachePathFor(pathWithQuery));
      return true;
    } catch {
      return false;
    }
  }

  async #network(pathWithQuery) {
    const url = new URL(pathWithQuery, BASE).toString();
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      this.requests++;
      let status = 0;
      let error = null;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip',
          },
          redirect: 'follow',
        });
        status = res.status;
        if (status === 200) {
          const text = await res.text();
          this.consecutiveFailures = 0;
          this.log(`GET ${url} 200 (${text.length} chars)`);
          return text;
        }
        await res.body?.cancel();
      } catch (err) {
        error = err;
      }
      const retriable = error || status === 429 || status >= 500;
      if (retriable && attempt < MAX_RETRIES) {
        const backoff = MIN_INTERVAL_MS * 2 ** (attempt + 1);
        this.log(`GET ${url} ${error ? error.message : `HTTP ${status}`}; retry ${attempt + 1}/${MAX_RETRIES} in ${backoff} ms`);
        await sleep(backoff);
        continue;
      }
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(`aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures (last: ${url})`);
      }
      const e = new Error(`GET ${url} failed: ${error ? error.message : `HTTP ${status}`}`, { cause: error ?? undefined });
      e.status = status;
      throw e;
    }
  }
}

export function proxyHint() {
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    return 'hint: behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node >= 22.21) so fetch honors HTTPS_PROXY';
  }
  return null;
}
