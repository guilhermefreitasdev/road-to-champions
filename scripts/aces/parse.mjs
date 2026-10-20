// Parsers for the "Acerte o ace" dataset (docs/aces.md): the 5Ks of a VLR match and the round history of each map.
// Pure functions over cached HTML; depend only on cheerio.
//
// - parsePerformance5Ks(html): the Performance tab (`/{matchId}/{slug}/?game=all&tab=performance`). For every map
//   (data-game-id, "all" skipped), the rows of the advanced stats table whose 5K cell is not empty: player handle,
//   team tag, agent icon slug, the rounds of each 5K with the five victims (handle + agent slug), exactly as the
//   cell's popup lists them, and the player's won clutches on that map (1v1…1v5 with their rounds).
// - parseRoundHistory(html): the overview tab (`/{matchId}/{slug}`). For every map, the round strip: per round, the
//   winner (1 = first team of the header, 2 = second), the winner's side ('atk' | 'def', from VLR's mod-t / mod-ct)
//   and the score after the round as VLR writes it in the column title ("7-5", first team first).

import * as cheerio from 'cheerio';

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s);

function agentIconSlug(src) {
  const m = (src ?? '').match(/\/agents\/([a-z0-9_-]+)\.(png|webp|svg)/i);
  return m ? m[1].toLowerCase() : null;
}

/** The handle of an advanced-stats row: the text of the name block without the team tag. */
function rowHandle($, $cell) {
  const $name = $cell.find('.team > div').first().clone();
  const tag = clean($name.find('.team-tag').text()) || null;
  $name.find('.team-tag').remove();
  return { handle: clean($name.text()) || null, tag };
}

/** The 5K column of the advanced stats table (by header text, not position). */
function columnIndex($, $table, label) {
  let at = -1;
  $table
    .find('tr')
    .first()
    .find('th')
    .each((i, th) => {
      if (clean($(th).text()) === label) at = i;
    });
  return at;
}

/** The number in a stats cell and its popup: the rounds, each with the players listed under it (handle + agent slug). */
function cellRounds($, $td) {
  const $cell = $td.find('.stats-sq').first();
  const count = Number(clean($cell.clone().children().remove().end().text())) || 0;
  const rounds = [];
  $cell
    .find('.wf-popable-contents')
    .first()
    .find('div[style*="white-space: nowrap"]')
    .each((_, head) => {
      const round = Number(clean($(head).find('span').first().text()));
      const victims = $(head)
        .siblings('div')
        .map((__, v) => ({ handle: clean($(v).text()) || null, agent: agentIconSlug($(v).find('img').attr('src')) }))
        .get();
      rounds.push({ round: Number.isFinite(round) && round > 0 ? round : null, victims });
    });
  return { count, rounds };
}

export function parsePerformance5Ks(html) {
  const $ = cheerio.load(html);
  const maps = [];
  $('.vm-stats-game').each((_, g) => {
    const gameId = $(g).attr('data-game-id');
    if (!gameId || gameId === 'all') return;
    const $table = $(g).find('table.mod-adv-stats').first();
    if (!$table.length) {
      maps.push({ gameId: Number(gameId), hasTable: false, aces: [] });
      return;
    }
    const col = columnIndex($, $table, '5K');
    const clutchCols = ['1v1', '1v2', '1v3', '1v4', '1v5'].map((label) => ({ label, at: columnIndex($, $table, label) }));
    const aces = [];
    $table
      .find('tr')
      .slice(1)
      .each((__, tr) => {
        const $tds = $(tr).children('td');
        if (col < 0 || $tds.length <= col) return;
        const { handle, tag } = rowHandle($, $tds.eq(0));
        const agent = agentIconSlug($tds.eq(1).find('img').first().attr('src'));
        const cell = cellRounds($, $tds.eq(col));
        if (!cell.count) return;
        const clutches = [];
        for (const c of clutchCols) {
          if (c.at < 0 || $tds.length <= c.at) continue;
          for (const r of cellRounds($, $tds.eq(c.at)).rounds) if (r.round) clutches.push({ kind: c.label, round: r.round });
        }
        aces.push({ handle, tag, agent, count: cell.count, rounds: cell.rounds, clutches });
      });
    maps.push({ gameId: Number(gameId), hasTable: true, aces });
  });
  return { maps };
}

export function parseRoundHistory(html) {
  const $ = cheerio.load(html);
  const maps = [];
  $('.vm-stats-game').each((_, g) => {
    const gameId = $(g).attr('data-game-id');
    if (!gameId || gameId === 'all') return;
    const rounds = [];
    $(g)
      .find('.vlr-rounds-row-col')
      .not('.mod-teams')
      .each((__, col) => {
        const n = Number(clean($(col).find('.rnd-num').text()));
        if (!Number.isFinite(n) || n <= 0) return;
        const sq = $(col).find('.rnd-sq');
        if (sq.length !== 2) return;
        let winner = null;
        let side = null;
        sq.each((i, s) => {
          if ($(s).hasClass('mod-win')) {
            winner = i + 1;
            side = $(s).hasClass('mod-t') ? 'atk' : $(s).hasClass('mod-ct') ? 'def' : null;
          }
        });
        const m = (clean($(col).attr('title')) ?? '').match(/^(\d+)-(\d+)$/);
        rounds.push({ round: n, winner, side, after: m ? [Number(m[1]), Number(m[2])] : null });
      });
    rounds.sort((a, b) => a.round - b.round);
    maps.push({ gameId: Number(gameId), rounds });
  });
  return { maps };
}

/**
 * The state of one round from the strip: the score before it (first team first) and the side of each team
 * (from the winner's side; the loser had the other one). Null when the strip lacks the round or its winner/side.
 */
export function roundContext(history, round) {
  const at = history.findIndex((r) => r.round === round);
  if (at < 0) return null;
  const r = history[at];
  const before = at === 0 ? (round === 1 ? [0, 0] : null) : history[at - 1].after;
  if (!r.winner || !r.side || !before || !r.after) return null;
  // The strip must be consistent: the winner's score went up by one.
  const delta = [r.after[0] - before[0], r.after[1] - before[1]];
  const ok = r.winner === 1 ? delta[0] === 1 && delta[1] === 0 : delta[0] === 0 && delta[1] === 1;
  if (!ok) return null;
  const other = r.side === 'atk' ? 'def' : 'atk';
  return { before, after: r.after, winner: r.winner, sides: r.winner === 1 ? [r.side, other] : [other, r.side] };
}

/** The event title in a match page header (e.g. "Champions Tour 2023: Americas League"), for events outside the snapshot. */
export function parseEventTitle(html) {
  const $ = cheerio.load(html);
  const $ev = $('a.match-header-event').first();
  return clean($ev.find('div[style*="font-weight: 700"]').first().text()) || clean($ev.children('div').first().children('div').first().text()) || null;
}
