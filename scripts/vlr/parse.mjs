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

const REGION_BY_LABEL = { Americas: 'americas', EMEA: 'emea', Pacific: 'pacific', China: 'china' };
const STAGE_BY_LABEL = { League: 'league', Kickoff: 'kickoff', 'Stage 1': 'stage1', 'Stage 2': 'stage2' };
const REGION_LABEL = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };
const STAGE_LABEL = { league: 'League', kickoff: 'Kickoff', stage1: 'Stage 1', stage2: 'Stage 2' };

/**
 * Classifies a listing title as a VCT regional league stage (franchising era, 2023+):
 * "Champions Tour 2023: Americas League", "Champions Tour 2024: EMEA Kickoff", "VCT 2025: Pacific Stage 2".
 * Qualifiers, LCQs, Challengers, Ascension and the China Evolution Series are not league stages (null).
 */
export function classifyRegionalTitle(title) {
  const t = clean(title);
  const m = t.match(/^(?:Champions Tour|VCT) (\d{4}): (Americas|EMEA|Pacific|China) (League|Kickoff|Stage [12])$/);
  if (!m) return null;
  return { year: Number(m[1]), region: REGION_BY_LABEL[m[2]], stage: STAGE_BY_LABEL[m[3]] };
}

/** Tier + region/stage of a listing title: international (masters/champions), regional, or null. */
export function classifyEvent(title) {
  const intl = classifyEventTitle(title);
  if (intl) return { tier: intl, region: null, stage: null };
  const regional = classifyRegionalTitle(title);
  return regional ? { tier: 'regional', region: regional.region, stage: regional.stage } : null;
}

/** Short display name, e.g. "Masters Reykjavík 2021", "LOCK//IN São Paulo 2023", "Champions 2022", "Americas Kickoff 2024". */
export function shortEventName(title, tier, year, regional = null) {
  const t = clean(title);
  if (tier === 'regional' && regional) return `${REGION_LABEL[regional.region]} ${STAGE_LABEL[regional.stage]} ${year}`;
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

  // Scoreboard of the whole series ("all" tab, or the first map): one .ovw-table per team, in header order.
  // Gives each team's player ids and the tag VLR uses for them, which the event stats page also uses.
  const $board = $('.vm-stats-game[data-game-id="all"]').first().length
    ? $('.vm-stats-game[data-game-id="all"]').first()
    : $('.vm-stats-game').first();
  $board.find('.ovw-table').each((i, table) => {
    if (i > 1) return;
    const players = [];
    $(table)
      .find('.ovw-row')
      .not('.mod-head')
      .each((_, row) => {
        const $a = $(row).find('a[href^="/player/"]').first();
        const pl = idFromHref($a.attr('href'), 'player');
        if (!pl) return;
        players.push({
          id: pl.id,
          handle: clean($a.find('.ovw-player-name').text()),
          tag: clean($a.find('.ovw-player-tag').text()) || null,
        });
      });
    teams[i].players = players;
  });
  for (const t of teams) t.players ??= [];

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

// ---------------------------------------------------------------------------------------------
// Match page, per-map scoreboards: who played which agent on each map, with that map's numbers

/** VLR agent slug from an agent icon (`/img/vlr/game/agents/kayo.png` -> "kayo"); null when it is not one. */
function agentIconSlug(src) {
  const m = (src ?? '').match(/\/agents\/([a-z0-9_-]+)\.(png|webp|svg)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Per-map scoreboards of a match page (`/{matchId}/{slug}`, the default overview tab). For every map that
 * was played (the "all" tab is skipped): map name, rounds (sum of the two scores, null when a score is
 * missing) and, per player, the side (1 = first team in the header, 2 = second), the agent (null when the
 * row shows no icon or more than one) and the map's "both sides" numbers: Rating 2.0, ACS, K, D, A.
 * Unknown agent slugs become `unknown:<slug>`; a missing number is null.
 */
export function parseMatchMapStats(html, agentNameBySlug = {}) {
  const $ = cheerio.load(html);
  const event = idFromHref($('a.match-header-event').first().attr('href'), 'event');
  const ts = $('.match-header-date .moment-tz-convert').first().attr('data-utc-ts') ?? null;
  const maps = [];
  $('.vm-stats-game').each((_, g) => {
    const gameId = $(g).attr('data-game-id');
    if (!gameId || gameId === 'all') return;
    const $name = $(g).find('.vm-stats-game-header .map .map-name').first().clone();
    $name.find('.picked').remove();
    const scores = $(g)
      .find('.vm-stats-game-header .team .score')
      .map((__, s) => num($(s).text()))
      .get();
    const rounds = scores.length === 2 && scores.every((s) => s !== null) ? scores[0] + scores[1] : null;
    const players = [];
    $(g)
      .find('.ovw-table')
      .each((side, table) => {
        if (side > 1) return;
        $(table)
          .find('.ovw-row')
          .not('.mod-head')
          .each((__, row) => {
            const $row = $(row);
            const $a = $row.find('.ovw-cell.mod-player a[href^="/player/"]').first();
            const pl = idFromHref($a.attr('href'), 'player');
            if (!pl) return;
            const slugs = $row
              .find('.ovw-cell.mod-agents img')
              .map((___, img) => agentIconSlug($(img).attr('src')))
              .get()
              .filter(Boolean);
            const both = (sel) => num($row.find(`${sel} .side.mod-both`).first().text());
            players.push({
              playerId: pl.id,
              handle: clean($a.find('.ovw-player-name').text()),
              side: side + 1,
              agent: slugs.length === 1 ? (agentNameBySlug[slugs[0]] ?? `unknown:${slugs[0]}`) : null,
              rating: both('.ovw-cell[data-col="rating2"]'),
              acs: both('.ovw-cell[data-col="acs"]'),
              k: both('.ovw-kda-stat[data-col="kills"]'),
              d: both('.ovw-kda-stat[data-col="deaths"]'),
              a: both('.ovw-kda-stat[data-col="assists"]'),
            });
          });
      });
    maps.push({ gameId: Number(gameId), map: clean($name.text()) || null, rounds, players });
  });
  return { eventId: event?.id ?? null, date: ts ? ts.slice(0, 10) : null, maps };
}

/** One agent cell of a player-year: maps, rounds, round-weighted Rating 2.0 and ACS, total kills and deaths. */
function emptyCell() {
  return { maps: 0, rounds: 0, ratingRounds: 0, ratingSum: 0, acsRounds: 0, acsSum: 0, k: 0, d: 0, kdMaps: 0 };
}

/**
 * Aggregates parsed match pages into playerId → year → agent → {maps, rounds, rating, acs, k, d}.
 * `matches` is a list of `{ year, maps }` (maps as returned by parseMatchMapStats). Rows without a known agent
 * are skipped; `keep(playerId)` filters players. Rating and ACS are averaged weighted by the map's rounds, over
 * the maps that have them (null when none does); k and d are summed over the maps that have both (null when
 * none does). Agents are ordered by maps desc, then name; ids and years ascending.
 */
export function aggregateAgentStats(matches, keep = () => true) {
  const acc = new Map();
  for (const { year, maps } of matches) {
    for (const g of maps) {
      for (const p of g.players) {
        if (!p.agent || p.agent.startsWith('unknown:') || !keep(p.playerId)) continue;
        const byYear = acc.get(p.playerId) ?? new Map();
        acc.set(p.playerId, byYear);
        const byAgent = byYear.get(year) ?? new Map();
        byYear.set(year, byAgent);
        const c = byAgent.get(p.agent) ?? emptyCell();
        byAgent.set(p.agent, c);
        const w = g.rounds ?? 0;
        c.maps++;
        c.rounds += w;
        if (p.rating !== null && w > 0) {
          c.ratingRounds += w;
          c.ratingSum += p.rating * w;
        }
        if (p.acs !== null && w > 0) {
          c.acsRounds += w;
          c.acsSum += p.acs * w;
        }
        if (p.k !== null && p.d !== null) {
          c.k += p.k;
          c.d += p.d;
          c.kdMaps++;
        }
      }
    }
  }
  const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;
  const out = {};
  for (const id of [...acc.keys()].sort((a, b) => a - b)) {
    const years = {};
    for (const year of [...acc.get(id).keys()].sort((a, b) => a - b)) {
      const cells = [...acc.get(id).get(year).entries()].sort((a, b) => b[1].maps - a[1].maps || (a[0] < b[0] ? -1 : 1));
      years[year] = Object.fromEntries(
        cells.map(([agent, c]) => [
          agent,
          {
            maps: c.maps,
            rounds: c.rounds,
            rating: c.ratingRounds > 0 ? round(c.ratingSum / c.ratingRounds, 2) : null,
            acs: c.acsRounds > 0 ? round(c.acsSum / c.acsRounds, 1) : null,
            k: c.kdMaps > 0 ? c.k : null,
            d: c.kdMaps > 0 ? c.d : null,
          },
        ]),
      );
    }
    out[id] = years;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Slim event (what the game bundles)

/**
 * The subset of an event file that the card builder reads (src/data/real/cards.ts, `VlrEventData`): the 5
 * main players' stats, the teams, the map pool and the vetoes. The game bundles only this (vlr/slim.json);
 * the full files stay as the source of truth for the tests and for anything new.
 */
export function slimEvent(e) {
  const mains = new Set(e.teams.flatMap((t) => t.players.filter((p) => p.main).map((p) => p.playerId)));
  return {
    slug: e.slug,
    shortName: e.shortName,
    year: e.year,
    tier: e.tier,
    region: e.region ?? null,
    stage: e.stage ?? null,
    startDate: e.startDate,
    endDate: e.endDate,
    mapPool: e.mapPool,
    teams: e.teams.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      tag: t.tag,
      countryName: t.countryName ?? null,
      placement: t.placement,
      played: t.played,
      players: t.players.map((p) => ({ playerId: p.playerId, main: p.main })),
    })),
    players: e.players
      .filter((p) => mains.has(p.playerId))
      .map((p) => ({
        playerId: p.playerId,
        playerSlug: p.playerSlug,
        handle: p.handle,
        country: p.country,
        teamId: p.teamId,
        agents: p.agents,
        rounds: p.rounds,
        rating: p.rating,
        acs: p.acs,
        kast: p.kast,
        adr: p.adr,
        kpr: p.kpr,
        apr: p.apr,
        fkPct: p.fkPct,
        fdPct: p.fdPct,
        hsPct: p.hsPct,
        clutchesWon: p.clutchesWon,
        clutchesPlayed: p.clutchesPlayed,
      })),
    matches: e.matches.map((m) => ({
      teams: m.teams.map((t) => ({ id: t.id })),
      maps: m.maps.map((g) => ({ map: g.map, pickedBy: g.pickedBy })),
      veto: m.veto,
    })),
  };
}
