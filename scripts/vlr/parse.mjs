// Pure parsers for vlr.gg HTML pages (no I/O). Every function takes an HTML string and returns
// plain data; anything not visible on the page is returned as null, never guessed.

import * as cheerio from 'cheerio';

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s);

/** "1.31" -> 1.31, "77%" -> 77, "" / "-" -> null. */
export function num(text) {
  const t = clean(text ?? '').replace(/%$/, '').replace(/,/g, '');
  if (t === '' || t === '-' || t === '—') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "/team/6961/loud" -> { id: 6961, slug: 'loud' }. */
export function idFromHref(href, kind) {
  const m = (href ?? '').match(new RegExp(`/${kind}/(\\d+)(?:/([^/?#]*))?`));
  return m ? { id: Number(m[1]), slug: m[2] ?? null } : null;
}

/** <i class="flag mod-cl"> -> "cl"; unknown ("un") or missing -> null. */
function flagCode($el) {
  const cls = $el?.attr('class') ?? '';
  const m = cls.match(/\bmod-([a-z]{2,3})\b/);
  if (!m || m[1] === 'un') return null;
  return m[1];
}

/** Our English agent name for a VLR agent slug (e.g. "kayo" -> "KAY/O"). */
export function agentSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------------------------
// Event listing (/events?tier=60&page=N)

export function parseEventListing(html) {
  const $ = cheerio.load(html);
  const events = [];
  $('a.event-item').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const m = href.match(/^\/event\/(\d+)\/([^/?#]+)/);
    if (!m) return;
    events.push({
      id: Number(m[1]),
      path: `/event/${m[1]}/${m[2]}`,
      title: clean($(a).find('.event-item-title').text()),
      status: clean($(a).find('.event-item-desc-item-status').text()) || null,
    });
  });
  const pages = new Set();
  $('a[href*="page="]').each((_, a) => {
    const m = ($(a).attr('href') ?? '').match(/[?&]page=(\d+)/);
    if (m) pages.add(Number(m[1]));
  });
  return { events, pages: [...pages].sort((a, b) => a - b) };
}

/**
 * Classifies a listing title as an international VCT event.
 * Masters: "Valorant Champions Tour Stage N: Masters X", "Champions Tour YYYY: Masters X",
 * "Champions Tour 2023: LOCK//IN São Paulo", "Valorant Masters X YYYY".
 * Champions: "Valorant Champions YYYY". Regional "Champions Tour <Region> Stage 1: Masters" is excluded.
 */
export function classifyEventTitle(title) {
  const t = clean(title);
  if (/^Valorant Champions \d{4}$/.test(t)) return 'champions';
  if (/^Valorant Champions Tour Stage \d: Masters \S/.test(t)) return 'masters';
  if (/^Champions Tour \d{4}: (Masters \S|LOCK\/\/IN)/.test(t)) return 'masters';
  if (/^Valorant Masters \S.* \d{4}$/.test(t)) return 'masters';
  return null;
}

/** Short display name, e.g. "Masters Reykjavík 2021", "LOCK//IN São Paulo 2023", "Champions 2022". */
export function shortEventName(title, tier, year) {
  const t = clean(title);
  if (tier === 'champions') return `Champions ${year}`;
  const lockin = t.match(/LOCK\/\/IN\s+(.+)$/);
  if (lockin) return `LOCK//IN ${lockin[1].replace(/\s+\d{4}$/, '')} ${year}`;
  const m = t.match(/Masters\s+(.+)$/);
  const city = m ? m[1].replace(/\s+\d{4}$/, '') : t;
  return `Masters ${city} ${year}`;
}

export function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------------------------
// Dates: "Aug 31 – Sep 19, 2022", "May 24 – 30, 2021", "Dec 1, 2021 – Jan 2, 2022"

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function parseDateRange(text) {
  const t = clean(text ?? '');
  if (!t) return { start: null, end: null };
  const parts = t.split(/\s*[–—-]\s*/);
  const parsePart = (p) => {
    const m = p.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
    if (m) return { month: MONTHS[m[1].toLowerCase()], day: Number(m[2]), year: m[3] ? Number(m[3]) : null };
    const d = p.match(/^(\d{1,2})(?:,\s*(\d{4}))?$/);
    if (d) return { month: null, day: Number(d[1]), year: d[2] ? Number(d[2]) : null };
    return null;
  };
  if (parts.length === 1) {
    const a = parsePart(parts[0]);
    if (!a?.month || !a.year) return { start: null, end: null };
    return { start: iso(a.year, a.month, a.day), end: iso(a.year, a.month, a.day) };
  }
  if (parts.length !== 2) return { start: null, end: null };
  const a = parsePart(parts[0]);
  const b = parsePart(parts[1]);
  if (!a || !b || !a.month) return { start: null, end: null };
  const endMonth = b.month ?? a.month;
  const endYear = b.year ?? a.year;
  if (!endYear) return { start: null, end: null };
  const startYear = a.year ?? (endMonth < a.month ? endYear - 1 : endYear);
  return { start: iso(startYear, a.month, a.day), end: iso(endYear, endMonth, b.day) };
}

// ---------------------------------------------------------------------------------------------
// Event page (/event/{id}/{slug}[/{stage}]): header meta, stage tabs, standings, rosters

/** "5th–6th" -> { min: 5, max: 6 }, "1st" -> { min: 1, max: 1 }. */
export function parsePlacement(text) {
  const nums = clean(text ?? '').match(/\d+/g);
  if (!nums) return null;
  const min = Number(nums[0]);
  const max = Number(nums[nums.length - 1]);
  return { min, max };
}

export function parseEventPage(html) {
  const $ = cheerio.load(html);
  const meta = {};
  $('.event-header-main-meta .label').each((_, el) => {
    const label = clean($(el).text()).toLowerCase();
    const $value = $(el).next('.value');
    meta[label] = { text: clean($value.text()) || null, flag: flagCode($value.find('i.flag')) };
  });
  const title = clean($('h1.event-header-main-title').text()) || null;

  const stages = [];
  $('a.wf-subnav-item').each((_, a) => {
    stages.push({
      path: $(a).attr('href'),
      title: clean($(a).find('.wf-subnav-item-title').text()),
      active: $(a).hasClass('mod-active'),
    });
  });

  const standings = [];
  $('.wf-ptable--standings .row').each((i, row) => {
    const $a = $(row).find('.cell.mod-team a').first();
    const team = idFromHref($a.attr('href'), 'team');
    if (!team) return;
    const placeText = clean($(row).find('.cell').first().text());
    const $name = $a.find('.text-of').first().clone();
    const country = clean($name.find('.ge-text-light').text()) || null;
    $name.find('.ge-text-light').remove();
    standings.push({
      placeText,
      place: parsePlacement(placeText),
      teamId: team.id,
      teamSlug: team.slug,
      name: clean($name.text()),
      country,
    });
  });

  const rosters = [];
  $('.wf-card.event-team').each((_, card) => {
    const $name = $(card).find('a.event-team-name');
    const team = idFromHref($name.attr('href'), 'team');
    const players = [];
    $(card)
      .find('a.event-team-players-item')
      .each((__, p) => {
        const pl = idFromHref($(p).attr('href'), 'player');
        if (!pl) return;
        players.push({ id: pl.id, handle: clean($(p).text()), country: flagCode($(p).find('i.flag')) });
      });
    rosters.push({ teamId: team?.id ?? null, teamSlug: team?.slug ?? null, name: clean($name.text()) || null, players });
  });

  return {
    title,
    datesText: meta.dates?.text ?? null,
    prize: meta.prize?.text ?? null,
    location: meta.location?.text ?? null,
    locationCountry: meta.location?.flag ?? null,
    stages,
    standings,
    rosters,
  };
}

// ---------------------------------------------------------------------------------------------
// Event stats (/event/stats/{id}?min_rounds=0)

/**
 * Parses the player stats table. `agentNameBySlug` maps VLR agent slugs (from the icon file name)
 * to our English agent names; unknown slugs are kept as `unknown:<slug>` so validation can flag them.
 */
export function parseStatsPage(html, agentNameBySlug = {}) {
  const $ = cheerio.load(html);
  const headers = $('#st-table thead th')
    .map((_, th) => $(th).attr('data-col') ?? $(th).attr('class') ?? '')
    .get();
  if (!headers.includes('rnd') || !headers.includes('rating2')) {
    throw new Error(`stats table not found or has unexpected columns: ${headers.join(',')}`);
  }
  const rows = [];
  $('#st-table tbody tr').each((_, tr) => {
    const $tr = $(tr);
    const $a = $tr.find('td.mod-player a').first();
    const player = idFromHref($a.attr('href'), 'player');
    if (!player) return;
    const col = (name) => $tr.find(`td[data-col="${name}"]`).first();
    const val = (name) => num(col(name).text());
    const agents = [];
    col('agents')
      .find('.st-agent')
      .each((__, s) => {
        const src = $(s).find('img').attr('src') ?? '';
        const m = src.match(/\/agents\/([a-z0-9_-]+)\.(png|webp|svg)/i);
        if (!m) return;
        const slug = m[1].toLowerCase();
        agents.push({ agent: agentNameBySlug[slug] ?? `unknown:${slug}`, pct: num($(s).find('.st-agent-n').text()) });
      });
    const moreText = clean(col('agents').find('.st-agent-more').text());
    const agentsHidden = moreText ? Number(moreText.replace(/\D/g, '')) || 0 : 0;
    const $cl = col('cl');
    const clutchWon = num($cl.find('.st-cl-x').text());
    const clutchPlayed = num($cl.find('.st-cl-y').text());
    rows.push({
      playerId: player.id,
      playerSlug: player.slug,
      handle: clean($a.find('.st-pl-name').text()),
      teamTag: clean($a.find('.st-pl-country').text()) || null,
      country: flagCode($a.find('i.flag')),
      agents,
      agentsHidden,
      maps: val('maps'),
      rounds: val('rnd'),
      rating: val('rating2'),
      acs: val('acs'),
      kd: val('kd'),
      kast: val('kast'),
      adr: val('adr'),
      kpr: val('kpr'),
      apr: val('apr'),
      fkfd: val('fkfd'),
      fkPct: val('fbpr'),
      fdPct: val('fdpr'),
      hsPct: val('hsp'),
      clutchPct: val('clp'),
      clutches: clutchWon === null && clutchPlayed === null ? null : `${clutchWon ?? ''}/${clutchPlayed ?? ''}`,
      clutchesWon: clutchWon,
      clutchesPlayed: clutchPlayed,
      kmax: val('kmax'),
      k: val('k'),
      d: val('d'),
      a: val('a'),
      fk: val('fk'),
      fd: val('fd'),
    });
  });
  return rows;
}

/**
 * Stage groups of the stats page filter ("Playoffs", "Swiss Stage", "Showmatch"...), each with the
 * stage values that VLR's own filter puts in `?exclude=<v1>.<v2>` when a stage is unchecked.
 */
export function parseStatsStageGroups(html) {
  const $ = cheerio.load(html);
  return $('.st-ss-group')
    .map((_, g) => ({
      label: clean($(g).find('.st-ss-lbl span').first().text()),
      values: $(g)
        .find('input.st-ss')
        .map((__, i) => $(i).attr('value'))
        .get()
        .filter(Boolean),
    }))
    .get();
}

export const isShowmatch = (text) => /show\s*-?\s*match/i.test(text ?? '');

// ---------------------------------------------------------------------------------------------
// Event agents page (/event/agents/{id}): the maps played at the event and how often

export function parseAgentsPageMaps(html) {
  const $ = cheerio.load(html);
  const maps = [];
  $('tr.pr-global-row').each((_, tr) => {
    if ($(tr).hasClass('mod-all')) return;
    const $first = $(tr).find('td').first().clone();
    $first.find('.map-pseudo-icon').remove();
    const map = clean($first.text());
    const played = num($(tr).find('td').eq(1).text());
    if (map) maps.push({ map, played });
  });
  return maps;
}

// ---------------------------------------------------------------------------------------------
// Event matches list (/event/matches/{id}/?series_id=all)

export function parseMatchList(html) {
  const $ = cheerio.load(html);
  const matches = [];
  $('a.match-item').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const m = href.match(/^\/(\d+)\/([^/?#]+)/);
    if (!m) return;
    matches.push({
      id: Number(m[1]),
      path: `/${m[1]}/${m[2]}`,
      teams: $(a)
        .find('.match-item-vs-team-name')
        .map((__, t) => clean($(t).text()))
        .get(),
      status: clean($(a).find('.ml-status').text()) || null,
      series: clean($(a).find('.match-item-event-series').text()) || null,
    });
  });
  return matches;
}

// ---------------------------------------------------------------------------------------------
// Match page (/{matchId}/{slug}): teams, series score, maps played, veto note

/** Splits a VLR veto note ("A ban X; B pick Y; Z remains") into trimmed steps; null if it is not a veto. */
export function splitVeto(note) {
  const t = clean(note ?? '');
  if (!t || !/\b(ban|pick|remains)\b/i.test(t)) return null;
  return t
    .split(';')
    .map((s) => clean(s))
    .filter(Boolean);
}

export function parseMatchPage(html) {
  const $ = cheerio.load(html);
  const teams = [1, 2].map((n) => {
    const $a = $(`.match-header-vs a.match-header-link.mod-${n}`).first();
    const team = idFromHref($a.attr('href'), 'team');
    return { id: team?.id ?? null, name: clean($a.find('.wf-title-med').text()) || null };
  });
  const scoreSpans = $('.match-header-vs-score .sp-hide span').filter(
    (_, s) => !$(s).hasClass('match-header-vs-score-colon'),
  );
  const score = scoreSpans.length === 2 ? scoreSpans.map((_, s) => num($(s).text())).get() : [null, null];
  const ts = $('.match-header-date .moment-tz-convert').first().attr('data-utc-ts') ?? null;
  const patchMatch = clean($('.match-header-date').text()).match(/Patch\s+([\d.]+)/i);
  const notes = $('.match-header-note')
    .map((_, n) => clean($(n).text()))
    .get();
  const vetoRaw = notes.find((n) => splitVeto(n)) ?? null;

  const maps = [];
  $('.vm-stats-game').each((_, g) => {
    const gameId = $(g).attr('data-game-id');
    if (!gameId || gameId === 'all') return;
    const $header = $(g).find('.vm-stats-game-header').first();
    const $name = $header.find('.map .map-name').first().clone();
    const pickedClass = $name.find('.picked').attr('class') ?? '';
    $name.find('.picked').remove();
    const map = clean($name.text()) || null;
    const scores = $header
      .find('.team .score')
      .map((__, s) => num($(s).text()))
      .get();
    const pickedBy = /\bmod-1\b/.test(pickedClass) ? 1 : /\bmod-2\b/.test(pickedClass) ? 2 : null;
    maps.push({ gameId: Number(gameId), map, score: scores.length === 2 ? scores : [null, null], pickedBy });
  });

  return {
    date: ts ? ts.slice(0, 10) : null,
    patch: patchMatch ? patchMatch[1] : null,
    teams,
    score,
    maps,
    vetoRaw,
    veto: splitVeto(vetoRaw),
  };
}
