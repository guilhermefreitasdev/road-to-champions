#!/usr/bin/env node
// Checks every YouTube link of scripts/aces/curated.json with YouTube's oEmbed endpoint
// (https://www.youtube.com/oembed?url=<video>&format=json: title and channel, no API key, no download) and, with
// --write, records the result in the curated file (title, channel, channelUrl, embeddable, check "youtube-oembed",
// checkedAt). oEmbed answers 200 for an embeddable video, 401/403 when embedding is disabled or the video is private
// (embeddable: false, the modes skip it) and 404/400 for a removed one (reported: remove that entry). Rebuild
// src/data/real/aces.json afterwards (scripts/aces/build.mjs). One request every 2.5 s, fan-project User-Agent.
//
// Usage:
//   NODE_USE_ENV_PROXY=1 node scripts/aces/check-videos.mjs           # report only
//   NODE_USE_ENV_PROXY=1 node scripts/aces/check-videos.mjs --write   # report and update curated.json
//
// A title that changed is reported, never accepted silently: re-read it and make sure the video still shows
// the same ace before writing.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_AGENT, proxyHint } from '../vlr/fetch.mjs';

const CURATED = join(dirname(fileURLToPath(import.meta.url)), 'curated.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const write = process.argv.includes('--write');
  const file = JSON.parse(await readFile(CURATED, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  let changed = 0;
  let failed = 0;
  for (const [i, c] of file.aces.entries()) {
    if (i > 0) await sleep(2500);
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(c.youtube.url)}&format=json`;
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (err) {
      console.log(`FAIL ${c.key}: ${err.message}`);
      failed++;
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      console.log(`NOEM ${c.key}: not embeddable or private (oEmbed HTTP ${res.status}) for ${c.youtube.url}`);
      if (write && c.youtube.embeddable !== false) {
        c.youtube = { ...c.youtube, embeddable: false };
        changed++;
      }
      continue;
    }
    if (res.status !== 200) {
      console.log(`GONE ${c.key}: oEmbed HTTP ${res.status} for ${c.youtube.url}`);
      failed++;
      continue;
    }
    const o = await res.json();
    const sameTitle = o.title === c.youtube.title;
    console.log(`${sameTitle ? 'ok  ' : 'DIFF'} ${c.key}: "${o.title}" by ${o.author_name}${sameTitle ? '' : ` (curated: "${c.youtube.title}")`}`);
    if (write && sameTitle) {
      c.youtube = { ...c.youtube, channel: o.author_name, channelUrl: o.author_url, embeddable: true, check: 'youtube-oembed', checkedAt: today };
      changed++;
    }
  }
  if (write && changed) await writeFile(CURATED, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`${file.aces.length} links, ${failed} failed${write ? `, ${changed} updated` : ''}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`check-videos: ${err.message}`);
  const hint = proxyHint();
  if (hint) console.error(hint);
  process.exit(1);
});
