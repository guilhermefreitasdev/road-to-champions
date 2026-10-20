#!/usr/bin/env node
// VALORANT Wiki pipeline (wiki.playvalorant.com, MediaWiki API only; no HTML scraping). Two jobs for the Valdle:
//   places: the wiki's "Category:Map Images" screenshots whose file name is exactly "<Map> <Callout>" for a callout of
//           src/data/game/maps.json (e.g. "Ascent B Main.png"). Each one is resized to WebP under
//           public/media/places/<map>/ and listed in src/data/game/places.json with its file page (credit/removal).
//           Anything without an exact, unique match is left out and listed in scripts/wiki/out/places-unmatched.json.
//   sounds: lists every audio file under "Category:Audio Files" whose category or title names a weapon, with URL, type
//           and size, in scripts/wiki/out/weapon-audio-candidates.json. Nothing is downloaded: the single-shot files of
//           the default weapons are picked by a person from that list first (docs/data.md, "VALORANT Wiki").
//
// Usage: npm run data:wiki -- [--only=places,sounds] [--refresh]
// The sandbox the game is built in cannot reach the wiki, so this runs on a normal machine. Polite: one request every
// 2 s, a descriptive User-Agent, retries with back-off on 429/5xx, and every API answer cached in .cache/wiki.
// Media from the wiki are Riot Games IP (used under Riot's "Legal Jibber Jabber" fan policy) collected by the
// VALORANT Wiki; the game credits both and removes any file on request.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, '.cache', 'wiki');
const OUT = join(ROOT, 'scripts', 'wiki', 'out');
const PLACES_DIR = join(ROOT, 'public', 'media', 'places');
const GAME_DIR = join(ROOT, 'src', 'data', 'game');

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const refresh = args.includes('--refresh');
const only = new Set((opt('only') ?? 'places,sounds').split(','));

const SITE = 'https://wiki.playvalorant.com';
const UA = 'RoadToChampions/0.1 (fan project; github.com/guilhermefreitasdev/road-to-champions)';
const GAP_MS = 2000;
const CREDIT = 'VALORANT Wiki (wiki.playvalorant.com); imagens e sons da Riot Games';

let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const backoff = Number(res.headers.get('retry-after')) * 1000 || GAP_MS * 2 ** (attempt + 1);
      console.warn(`  ${res.status} on ${url}, retrying in ${Math.round(backoff / 1000)} s`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, data) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`wrote ${file}`);
};

/** The wiki's api.php: WIKI_API when set, else the first candidate path that answers siteinfo. */
async function findApi() {
  const candidates = process.env.WIKI_API
    ? [process.env.WIKI_API]
    : [`${SITE}/api.php`, `${SITE}/w/api.php`, `${SITE}/en-us/api.php`, `${SITE}/en-us/w/api.php`];
  for (const url of candidates) {
    try {
      const res = await politeFetch(`${url}?action=query&meta=siteinfo&format=json&formatversion=2`);
      const json = await res.json();
      if (json?.query?.general) {
        console.log(`API: ${url} (${json.query.general.sitename})`);
        return url;
      }
    } catch (e) {
      console.warn(`  no API at ${url}: ${e.message}`);
    }
  }
  throw new Error('MediaWiki API not found; set WIKI_API=https://.../api.php');
}

let API;
/** One cached API query (params without format), returning the parsed JSON. */
async function api(params) {
  const qs = new URLSearchParams({ ...params, format: 'json', formatversion: '2' }).toString();
  const file = join(CACHE, `${createHash('sha1').update(qs).digest('hex')}.json`);
  if (!refresh) {
    try {
      return await readJson(file);
    } catch {
      /* not cached */
    }
  }
  const json = await (await politeFetch(`${API}?${qs}`)).json();
  if (json.error) throw new Error(`API error ${json.error.code}: ${json.error.info}`);
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(json), 'utf8');
  return json;
}

/** Every member (files and subcategories) of a category, following continuation. */
async function categoryMembers(category) {
  const out = [];
  let cont = {};
  do {
    const json = await api({ action: 'query', list: 'categorymembers', cmtitle: category, cmtype: 'file|subcat', cmlimit: '500', ...cont });
    out.push(...json.query.categorymembers);
    cont = json.continue ?? null;
  } while (cont);
  return out;
}

/** Files under a category and its subcategories (down to `depth`), each with the category path it was found in. */
async function filesUnder(category, depth, keepSubcat = () => true, path = []) {
  const files = [];
  for (const m of await categoryMembers(category)) {
    if (m.ns === 6) files.push({ title: m.title, path: [...path, category] });
    else if (m.ns === 14 && depth > 0 && keepSubcat(m.title)) files.push(...(await filesUnder(m.title, depth - 1, keepSubcat, [...path, category])));
  }
  return files;
}

/** imageinfo (url, size, mime, thumb of `width`) for up to 50 titles per request. */
async function imageInfo(titles, width) {
  const info = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const json = await api({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      ...(width ? { iiurlwidth: String(width) } : {}),
      titles: titles.slice(i, i + 50).join('|'),
    });
    for (const p of json.query.pages) if (p.imageinfo?.[0]) info.set(p.title, p.imageinfo[0]);
  }
  return info;
}

const norm = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const slug = (s) => norm(s).replace(/ /g, '-');

async function places() {
  const maps = await readJson(join(GAME_DIR, 'maps.json'));
  const files = await filesUnder('Category:Map Images', 2);
  const matched = [];
  const unmatched = [];
  for (const f of files) {
    const name = f.title.replace(/^File:/, '').replace(/\.(png|jpe?g|webp)$/i, '');
    const map = maps.find((m) => norm(name).startsWith(`${norm(m.displayName)} `));
    if (!map || !/\.(png|jpe?g|webp)$/i.test(f.title)) {
      unmatched.push({ title: f.title, reason: map ? 'not an image' : 'no map name' });
      continue;
    }
    const rest = norm(name).slice(norm(map.displayName).length + 1);
    // Exact name only: "<super> <region>" (e.g. "B Main", "Mid Courtyard") or the bare region when it is unique.
    const hits = (map.callouts ?? []).filter(
      (c) => rest === norm(`${c.superRegionNameEn} ${c.regionNameEn}`) || rest === norm(c.regionNameEn),
    );
    const unique = [...new Map(hits.map((c) => [`${c.superRegionNameEn}|${c.regionNameEn}`, c])).values()];
    if (unique.length !== 1) {
      unmatched.push({ title: f.title, reason: unique.length ? 'ambiguous callout' : 'no exact callout' });
      continue;
    }
    matched.push({ title: f.title, map, callout: unique[0] });
  }
  const info = await imageInfo(
    matched.map((m) => m.title),
    1280,
  );
  const entries = [];
  for (const m of matched) {
    const ii = info.get(m.title);
    if (!ii) {
      unmatched.push({ title: m.title, reason: 'no imageinfo' });
      continue;
    }
    const rel = `media/places/${slug(m.map.displayName)}/${slug(`${m.callout.superRegionNameEn} ${m.callout.regionNameEn}`)}.webp`;
    const buf = Buffer.from(await (await politeFetch(ii.thumburl ?? ii.url)).arrayBuffer());
    await mkdir(dirname(join(ROOT, 'public', rel)), { recursive: true });
    await sharp(buf).resize(960, 540, { fit: 'cover' }).webp({ quality: 78 }).toFile(join(ROOT, 'public', rel));
    entries.push({
      map: m.map.displayName,
      superRegionEn: m.callout.superRegionNameEn,
      regionEn: m.callout.regionNameEn,
      file: rel,
      title: m.title,
      source: ii.descriptionurl,
    });
    console.log(`  ${m.title} -> ${rel}`);
  }
  entries.sort((a, b) => a.file.localeCompare(b.file));
  await writeJson(join(GAME_DIR, 'places.json'), { credit: CREDIT, generatedAt: new Date().toISOString().slice(0, 10), places: entries });
  await writeJson(join(OUT, 'places-unmatched.json'), unmatched);
  console.log(`places: ${entries.length} matched, ${unmatched.length} left out (see scripts/wiki/out/places-unmatched.json)`);
  console.log(`(the images are written under ${PLACES_DIR})`);
}

async function sounds() {
  const weapons = (await readJson(join(GAME_DIR, 'weapons.json'))).map((w) => w.displayName ?? w.name);
  const weaponIn = (s) => weapons.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(s));
  const keep = (cat) => Boolean(weaponIn(cat)) || /weapon|gun|firearm/i.test(cat);
  const files = await filesUnder('Category:Audio Files', 3, keep);
  const audio = files.filter((f) => /\.(mp3|ogg|oga|wav|flac|m4a)$/i.test(f.title));
  const info = await imageInfo(audio.map((f) => f.title));
  const rows = audio
    .map((f) => {
      const ii = info.get(f.title);
      return {
        weapon: weaponIn(f.title) ?? weaponIn(f.path.join(' ')) ?? null,
        title: f.title,
        categories: f.path,
        url: ii?.url ?? null,
        source: ii?.descriptionurl ?? null,
        mime: ii?.mime ?? null,
        bytes: ii?.size ?? null,
      };
    })
    .filter((r) => r.weapon)
    .sort((a, b) => a.weapon.localeCompare(b.weapon) || a.title.localeCompare(b.title));
  await writeJson(join(OUT, 'weapon-audio-candidates.json'), { credit: CREDIT, generatedAt: new Date().toISOString().slice(0, 10), files: rows });
  const per = Object.fromEntries(weapons.map((w) => [w, rows.filter((r) => r.weapon === w).length]));
  console.log(`sounds: ${rows.length} audio files that name a weapon`, per);
}

API = await findApi();
if (only.has('places')) await places();
if (only.has('sounds')) await sounds();
