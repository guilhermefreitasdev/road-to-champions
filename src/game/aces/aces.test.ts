import { describe, expect, it } from 'vitest';
import { ACES, RAW_ACES, type Ace } from '../../data/real/aces';
import slimJson from '../../data/real/vlr/slim.json';
import agentsJson from '../../data/game/agents.json';
import mapsJson from '../../data/game/maps.json';
import { DAILY_LAUNCH, addDays } from '../daily/calendar';
import {
  ACES_SAVE_VERSION,
  DAILY_MIN_NEUTRAL,
  HINT_AFTER,
  MAX_TRIES,
  WATCH_LABEL,
  acesDailyPuzzle,
  embedSrc,
  embedPlayerVars,
  PLAYER_HOST,
  watchUrl,
  acesStats,
  aceResult,
  createAcesDaily,
  dailyPool,
  emptyAceProgress,
  emptyAcesSave,
  factsFromDaily,
  filterPool,
  freeAcePuzzle,
  giveUp,
  guessAce,
  guessFeedback,
  isAnswer,
  parseAcesSave,
  pickFreeAce,
  playablePool,
  progressFor,
  recordFree,
  revealAce,
  settleAce,
  shareText,
  titleNamesPlayer,
  visibleHints,
  type AceProgress,
  type FactsLookup,
  type PlayerFacts,
} from '.';
import { dailyData } from '../daily';

// --- Fixtures (fictitious ids, real shape) ---------------------------------------------------------------------

function fakeAce(n: number, over: Partial<Ace> = {}): Ace {
  const handle = over.handle ?? `pro${n % 7}`;
  return {
    id: `${1000 + n}-${5000 + n}-${(n % 20) + 1}`,
    video: true,
    vlrPlayerId: 9000 + (n % 7),
    playerId: String(9000 + (n % 7)),
    handle,
    aliases: [],
    team: { vlrId: 1, teamId: 'alpha', name: 'Alpha', tag: 'ALP' },
    opponent: { vlrId: 2, teamId: 'beta', name: 'Beta', tag: null },
    event: { vlrId: 10, eventId: 'champions-2022', name: 'Champions 2022', tier: 'champions', year: 2022 },
    stage: 'Playoffs',
    seriesRound: 'Grand Final',
    date: '2022-09-18',
    match: { vlrId: 1000 + n, url: `https://www.vlr.gg/${1000 + n}/a-vs-b`, bestOf: 5, mapNumber: 1, gameId: 5000 + n },
    map: 'Ascent',
    round: (n % 20) + 1,
    side: 'atk',
    scoreBefore: [3, 4],
    roundWon: true,
    clutch: null,
    mapScore: [13, 9],
    agent: 'Jett',
    victims: [],
    weapon: null,
    description: `${handle} fez um ace.`,
    youtube: {
      url: `https://www.youtube.com/watch?v=abcdefghi${String(n).padStart(2, '0')}`,
      videoId: `abcdefghi${String(n).padStart(2, '0')}`,
      title: n % 3 === 0 ? `${handle} ACE` : 'Insane ACE',
      channel: 'Canal',
      channelUrl: null,
      start: n % 2 ? 42 : null,
      end: n % 2 ? 60 : null,
      embeddable: n % 4 === 0 ? true : null,
      titleRevealsPlayer: n % 3 === 0,
      check: 'web-search',
      checkedAt: '2026-10-20',
    },
    sources: ['https://www.vlr.gg/1/x'],
    verified: { fiveK: 'vlr-performance' },
    ...over,
  };
}

const FAKE = Array.from({ length: 30 }, (_, i) => fakeAce(i));
const facts = (id: string, over: Partial<PlayerFacts> = {}): PlayerFacts => ({
  playerId: id,
  handle: id,
  country: 'br',
  region: 'americas',
  role: 'duelist',
  firstYear: 2021,
  teamsAt: () => [],
  ...over,
});

// --- Dataset integrity -------------------------------------------------------------------------------------------

describe('aces.json (real data)', () => {
  const poolIds = new Set((slimJson as { players: { playerId: number }[] }[]).flatMap((e) => e.players.map((p) => String(p.playerId))));
  const agentNames = new Set((agentsJson as { name: string }[]).map((a) => a.name));
  const mapNames = new Set((mapsJson as { name: string }[]).map((m) => m.name));

  it('has entries, all resolved', () => {
    expect(RAW_ACES.length).toBeGreaterThan(0);
    expect(ACES.length).toBe(RAW_ACES.length);
  });

  it('every entry has sources, a VLR-checked 5K and a checked video', () => {
    for (const a of ACES) {
      expect(a.sources.length, a.id).toBeGreaterThanOrEqual(2);
      expect(a.sources.every((s) => /^https:\/\//.test(s)), a.id).toBe(true);
      expect(a.sources).toContain(a.match.url);
      expect(a.verified.fiveK, a.id).toBe('vlr-performance');
      expect(a.verified.round, a.id).toBe('vlr-performance');
      expect(['youtube-oembed', 'web-search']).toContain(a.verified.video);
      expect(typeof a.verified.videoMatch, a.id).toBe('string');
      expect(a.video).toBe(true);
      expect(a.youtube?.check).toBe(a.verified.video);
      expect(a.description.length, a.id).toBeGreaterThan(20);
    }
  });

  it('YouTube links are well-formed (watch URL + id), with a title, sourced start/end and the embed check', () => {
    for (const a of ACES) {
      const y = a.youtube!;
      expect(y.url, a.id).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
      expect(y.url.endsWith(`=${y.videoId}`)).toBe(true);
      expect([true, false, null]).toContain(y.embeddable);
      if (y.embeddable !== null) expect(a.verified.embeddable).toBe('youtube-oembed');
      if (y.end !== null) {
        expect(y.end).toBeGreaterThan(y.start ?? 0);
        expect(typeof a.verified.end).toBe('string');
      }
      expect(y.title.length, a.id).toBeGreaterThan(0);
      expect(y.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (y.start !== null) {
        expect(Number.isInteger(y.start) && y.start > 0).toBe(true);
        expect(typeof a.verified.start).toBe('string');
      }
      expect(a.sources).toContain(y.url);
    }
  });

  it('titleRevealsPlayer agrees with the rule', () => {
    for (const a of ACES) expect(a.youtube!.titleRevealsPlayer, a.id).toBe(titleNamesPlayer(a.youtube!.title, [a.handle, ...a.aliases]));
  });

  it('VLR facts are well-formed: match URL, round, agent, map, five victims, side and score', () => {
    for (const a of ACES) {
      expect(a.match.url, a.id).toMatch(/^https:\/\/www\.vlr\.gg\/\d+\/[^/?#]+$/);
      expect(a.id).toBe(`${a.match.vlrId}-${a.match.gameId}-${a.round}`);
      expect(a.round).toBeGreaterThanOrEqual(1);
      expect(mapNames.has(a.map!), `${a.id} map ${a.map}`).toBe(true);
      if (a.agent) expect(agentNames.has(a.agent), `${a.id} agent ${a.agent}`).toBe(true);
      expect(a.victims).toHaveLength(5);
      if (a.scoreBefore) {
        expect(a.side).not.toBeNull();
        expect(a.scoreBefore[0] + a.scoreBefore[1]).toBe(a.round - 1);
      }
      if (a.weapon) expect(typeof a.verified.weapon).toBe('string');
    }
  });

  it('player ids, when set, exist in the pool; ids never name the player', () => {
    for (const a of ACES) {
      if (a.playerId !== null) {
        expect(poolIds.has(a.playerId), `${a.id} ${a.handle}`).toBe(true);
        expect(a.playerId).toBe(String(a.vlrPlayerId));
      }
      expect(a.id.toLowerCase()).not.toContain(a.handle.toLowerCase());
    }
  });

  it('has no duplicates (ids, videos)', () => {
    expect(new Set(ACES.map((a) => a.id)).size).toBe(ACES.length);
    expect(new Set(ACES.map((a) => a.youtube!.url)).size).toBe(ACES.length);
  });
});

describe('titleNamesPlayer', () => {
  it('finds handles and aliases as words, folded', () => {
    expect(titleNamesPlayer('OpTic Crashies Frenzy ACE vs LOUD', ['crashies'])).toBe(true);
    expect(titleNamesPlayer('PRX Forsaken Unbelievable 1v5', ['f0rsakeN'])).toBe(true);
    expect(titleNamesPlayer('LOUDaspas ace', ['aspas'])).toBe(true);
    expect(titleNamesPlayer('The best ACE so far at Valorant Champions 2023', ['Dep'])).toBe(false);
    // Conservative on purpose: a name of 4+ letters inside a word counts (a false alarm only demotes a clip).
    expect(titleNamesPlayer('Unless he wins', ['Less'])).toBe(true);
    expect(titleNamesPlayer('Bless you', ['yay'])).toBe(false);
    expect(titleNamesPlayer('LESS ace!', ['Less'])).toBe(true);
  });
});

// --- Puzzles -----------------------------------------------------------------------------------------------------

describe('puzzles: nothing names the pro before the answer', () => {
  it('a puzzle is only the neutral id and the embed (video id, start, end)', () => {
    const p = pickFreeAce(FAKE, 'seed')!;
    expect(Object.keys(p).sort()).toEqual(['aceId', 'embed']);
    expect(Object.keys(p.embed).sort()).toEqual(['end', 'start', 'videoId']);
    const ace = FAKE.find((a) => a.id === p.aceId)!;
    const text = JSON.stringify(p);
    for (const secret of [ace.handle, ace.youtube!.title, ace.youtube!.channel!, ace.description, ace.team.name, ace.youtube!.url]) {
      expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    expect(WATCH_LABEL).toBe('Assistir ao ace');
  });

  it('embed src: youtube-nocookie, start/end only when verified, autoplay only on the click-loaded iframe', () => {
    const withTimes = pickFreeAce([FAKE[1]!], 1)!;
    const plain = pickFreeAce([FAKE[2]!], 1)!;
    expect(embedSrc(withTimes.embed)).toBe('https://www.youtube-nocookie.com/embed/abcdefghi01?start=42&end=60&rel=0&playsinline=1&autoplay=1');
    expect(embedSrc(plain.embed)).toBe('https://www.youtube-nocookie.com/embed/abcdefghi02?rel=0&playsinline=1&autoplay=1');
    expect(watchUrl(FAKE[1]!.youtube!)).toBe(`${FAKE[1]!.youtube!.url}&t=42s`);
  });

  it('player vars: no native chrome, start/end only when verified, resume from a whole second never before start', () => {
    const withTimes = pickFreeAce([FAKE[1]!], 1)!.embed;
    const plain = pickFreeAce([FAKE[2]!], 1)!.embed;
    const base = { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, cc_load_policy: 0, enablejsapi: 1 };
    expect(PLAYER_HOST).toBe('https://www.youtube-nocookie.com');
    expect(embedPlayerVars(plain)).toEqual(base);
    expect(embedPlayerVars(plain, 12.8)).toEqual({ ...base, start: 12 });
    expect(embedPlayerVars(withTimes)).toEqual({ ...base, start: 42, end: 60 });
    expect(embedPlayerVars(withTimes, 50.4)).toEqual({ ...base, start: 50, end: 60 });
    expect(embedPlayerVars(withTimes, 3)).toEqual({ ...base, start: 42, end: 60 });
  });

  it('only checked, embeddable (or unchecked) videos with a pool player are playable', () => {
    const noEmbed = fakeAce(4, { youtube: { ...fakeAce(4).youtube!, embeddable: false } });
    const pool = playablePool([fakeAce(1), fakeAce(2, { playerId: null }), fakeAce(3, { youtube: null, video: false }), noEmbed]);
    expect(pool.map((a) => a.id)).toEqual([fakeAce(1).id]);
  });
});

describe('daily', () => {
  it('prefers neutral titles when there are enough of them', () => {
    const { pool, neutralOnly } = dailyPool(FAKE);
    expect(neutralOnly).toBe(true);
    expect(pool.every((a) => !a.youtube!.titleRevealsPlayer)).toBe(true);
    const few = [...FAKE.filter((a) => a.youtube!.titleRevealsPlayer), ...FAKE.filter((a) => !a.youtube!.titleRevealsPlayer).slice(0, DAILY_MIN_NEUTRAL - 1)];
    const mixed = dailyPool(few);
    expect(mixed.neutralOnly).toBe(false);
    expect(mixed.pool).toHaveLength(few.length);
    // Mixed pools show the neutral clips first in each cycle.
    const d = createAcesDaily(few);
    const firstDays = Array.from({ length: DAILY_MIN_NEUTRAL - 1 }, (_, i) => d.puzzleFor(addDays(DAILY_LAUNCH, i)).aceId);
    const neutralIds = new Set(few.filter((a) => !a.youtube!.titleRevealsPlayer).map((a) => a.id));
    expect(firstDays.filter((id) => neutralIds.has(id)).length).toBeGreaterThanOrEqual(DAILY_MIN_NEUTRAL - 3);
  });

  it('is the same for a date, numbered from the launch, and never repeats within a cycle', () => {
    const d = createAcesDaily(FAKE);
    const n = d.pool.length;
    const days = Array.from({ length: 365 }, (_, i) => d.puzzleFor(addDays(DAILY_LAUNCH, i)));
    expect(days[0]!.number).toBe(1);
    expect(days[9]!.number).toBe(10);
    expect(createAcesDaily(FAKE).puzzleFor(addDays(DAILY_LAUNCH, 40)).aceId).toBe(days[40]!.aceId);
    for (let c = 0; c * n < 365; c++) {
      const ids = days.slice(c * n, (c + 1) * n).map((p) => p.aceId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const player = (id: string) => FAKE.find((a) => a.id === id)!.playerId;
    let adjacent = 0;
    for (let i = 1; i < days.length; i++) if (player(days[i]!.aceId) === player(days[i - 1]!.aceId)) adjacent++;
    expect(adjacent).toBe(0);
  });

  it('rejects days before the launch', () => {
    expect(() => createAcesDaily(FAKE).puzzleFor(addDays(DAILY_LAUNCH, -1))).toThrow();
  });

  it('works over the real data for a year', () => {
    if (!playablePool(ACES).length) return;
    const days = Array.from({ length: 365 }, (_, i) => acesDailyPuzzle(addDays(DAILY_LAUNCH, i)));
    const pro = (id: string) => ACES.find((a) => a.id === id)!.playerId;
    for (let i = 1; i < days.length; i++) expect(pro(days[i]!.aceId), days[i]!.date).not.toBe(pro(days[i - 1]!.aceId));
    const n = dailyPool(ACES).pool.length;
    const firstCycle = days.slice(0, Math.min(n, 365)).map((p) => p.aceId);
    expect(new Set(firstCycle).size).toBe(firstCycle.length);
    for (const p of days) {
      const ace = ACES.find((a) => a.id === p.aceId)!;
      expect(p.embed.videoId).toBe(ace.youtube!.videoId);
      expect(ace.youtube!.embeddable).not.toBe(false);
    }
  });
});

describe('free mode', () => {
  it('is seeded, filters and avoids recent ids', () => {
    expect(pickFreeAce(FAKE, 'x')).toEqual(pickFreeAce(FAKE, 'x'));
    const neutral = filterPool(FAKE, { neutralOnly: true });
    expect(neutral.every((a) => !a.youtube!.titleRevealsPlayer)).toBe(true);
    expect(filterPool(FAKE, { yearFrom: 2023 })).toHaveLength(0);
    expect(pickFreeAce(FAKE, 'x', { yearFrom: 2023 })).toBeNull();
    const all = FAKE.map((a) => a.id);
    const keep = all[5]!;
    expect(pickFreeAce(FAKE, 'x', { exclude: all.filter((id) => id !== keep) })!.aceId).toBe(keep);
    // Excluding everything falls back to the whole filtered pool.
    expect(pickFreeAce(FAKE, 'x', { exclude: all })).not.toBeNull();
  });

  it('real data: a seeded pick, when there are aces', () => {
    if (playablePool(ACES).length) expect(freeAcePuzzle('seed')).not.toBeNull();
  });
});

// --- Playing -----------------------------------------------------------------------------------------------------

describe('guessing and scoring', () => {
  const ace = fakeAce(4, { handle: 'f0rsakeN', aliases: ['Forsaken'], playerId: '9004', vlrPlayerId: 9004 });

  it('checks by id, or by handle/alias (case and accents ignored)', () => {
    expect(isAnswer(ace, { playerId: '9004', handle: 'whatever' })).toBe(true);
    expect(isAnswer(ace, { playerId: '1', handle: 'f0rsakeN' })).toBe(false);
    expect(isAnswer(ace, { playerId: null, handle: ' F0RSAKEN ' })).toBe(true);
    expect(isAnswer(ace, { playerId: null, handle: 'forsakén' })).toBe(true);
    expect(isAnswer(ace, { playerId: null, handle: 'jinggg' })).toBe(false);
  });

  it('scores by the try that got it, ignores repeats, ends after MAX_TRIES', () => {
    let s = emptyAceProgress();
    const miss = (h: string) => ({ playerId: `x-${h}`, handle: h });
    s = guessAce(s, ace, miss('a')).state;
    expect(guessAce(s, ace, miss('a')).outcome).toBe('repeat');
    expect(visibleHints(s, ace)).toHaveLength(0);
    s = guessAce(s, ace, miss('b')).state;
    expect(visibleHints(s, ace).map((h) => h.kind)).toEqual(['event']);
    expect(visibleHints(s, ace)[0]!.text).toBe('Champions 2022 · Playoffs · Grande final');
    const hit = guessAce(s, ace, { playerId: '9004', handle: 'f0rsakeN' });
    expect(hit.outcome).toBe('hit');
    expect(hit.state.done).toBe(true);
    expect(aceResult(hit.state, ace)).toEqual({ solved: true, tries: 3, points: 3 });
    expect(guessAce(hit.state, ace, miss('c')).outcome).toBe('over');

    let lost = emptyAceProgress();
    for (let i = 0; i < MAX_TRIES; i++) lost = guessAce(lost, ace, miss(String(i))).state;
    expect(lost.done).toBe(true);
    expect(visibleHints(lost, ace)).toHaveLength(2);
    expect(aceResult(lost, ace)).toEqual({ solved: false, tries: null, points: 0 });
    expect(HINT_AFTER.team).toBeLessThan(MAX_TRIES);

    expect(aceResult(guessAce(emptyAceProgress(), ace, { playerId: '9004', handle: '' }).state, ace).points).toBe(5);
    expect(giveUp(emptyAceProgress())).toMatchObject({ done: true, gaveUp: true });
  });

  it('wrong guesses compare the guessed pro with the answer', () => {
    const lookup: FactsLookup = (id) =>
      id === '9004'
        ? facts(id, { country: 'id', region: 'pacific', role: 'duelist', firstYear: 2022 })
        : id === 'g1'
          ? facts(id, { country: 'id', region: 'pacific', role: 'initiator', firstYear: 2021, teamsAt: (e) => (e === 'champions-2022' ? ['alpha'] : []) })
          : undefined;
    let s = emptyAceProgress();
    s = guessAce(s, ace, { playerId: 'g1', handle: 'g1' }).state;
    s = guessAce(s, ace, { playerId: null, handle: 'someone' }).state;
    s = guessAce(s, ace, { playerId: '9004', handle: 'f0rsakeN' }).state;
    const fb = guessFeedback(s, ace, lookup);
    expect(fb[0]!.comparison).toEqual({ country: 'same', region: 'same', role: 'diff', debut: 'later', teammate: true });
    expect(fb[1]!.comparison).toEqual({ country: 'unknown', region: 'unknown', role: 'unknown', debut: 'unknown', teammate: null });
    expect(fb[2]).toMatchObject({ correct: true, comparison: null });
  });

  it('reveals only after the round, with title, channel, description and sources', () => {
    const open = emptyAceProgress();
    expect(revealAce(open, ace)).toBeNull();
    const r = revealAce(giveUp(open), ace)!;
    expect(r.video.title).toBe(ace.youtube!.title);
    expect(r.description).toBe(ace.description);
    expect(r.vlrUrl).toBe(ace.match.url);
  });

  it('share text: plain words, no emoji, no spoiler', () => {
    let s: AceProgress = guessAce(emptyAceProgress(), ace, { playerId: 'x', handle: 'x' }).state;
    s = guessAce(s, ace, { playerId: '9004', handle: 'f0rsakeN' }).state;
    s = settleAce(s, ace, '2026-10-05');
    const text = shareText({ number: 5, date: '2026-10-05' }, s, ace);
    expect(text).toBe('Road to Champions · Acerte o ace #5 · 4/5 pts\nacertei na 2ª tentativa · erro, acerto');
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text.toLowerCase()).not.toContain('forsaken');
    const late = settleAce(giveUp(emptyAceProgress()), ace, '2026-10-09');
    expect(shareText({ number: 5, date: '2026-10-05' }, late, ace)).toBe('Road to Champions · Acerte o ace #5 (arquivo) · 0/5 pts\nnão acertei · desisti');
  });
});

describe('save and stats', () => {
  const ace = fakeAce(1);
  const win = (day: string, tries = 1): AceProgress => {
    let s = emptyAceProgress();
    for (let i = 1; i < tries; i++) s = guessAce(s, ace, { playerId: `m${i}`, handle: `m${i}` }).state;
    s = guessAce(s, ace, { playerId: ace.playerId, handle: ace.handle }).state;
    return settleAce(s, ace, day);
  };

  it('progressFor resumes the same ace and restarts when the day now has another one', () => {
    const p = { ...guessAce(emptyAceProgress(ace.id), ace, { playerId: 'x', handle: 'x' }).state };
    expect(progressFor(p, ace.id).guesses).toHaveLength(1);
    expect(progressFor(p, 'other-id')).toEqual(emptyAceProgress('other-id'));
    expect(progressFor(undefined, ace.id)).toEqual(emptyAceProgress(ace.id));
    expect(parseAcesSave({ v: ACES_SAVE_VERSION, days: { '2026-10-02': p } }).days['2026-10-02']!.aceId).toBe(ace.id);
  });

  it('round-trips and drops malformed parts', () => {
    const save = emptyAcesSave();
    save.days['2026-10-02'] = win('2026-10-02', 2);
    const rec = recordFree(save, ace.id, { solved: true, tries: 1, points: 5 });
    expect(rec.free).toMatchObject({ played: 1, solved: 1, points: 5, recent: [ace.id], current: null });
    expect(parseAcesSave(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
    expect(parseAcesSave({ v: 99, days: {} })).toEqual(emptyAcesSave());
    expect(parseAcesSave('nope')).toEqual(emptyAcesSave());
    const bad = parseAcesSave({ v: ACES_SAVE_VERSION, days: { 'not-a-day': {}, '2026-10-03': { guesses: [1, { handle: 'a' }], done: true } }, free: { played: -3 } });
    expect(Object.keys(bad.days)).toEqual(['2026-10-03']);
    expect(bad.days['2026-10-03']!.guesses).toEqual([{ playerId: null, handle: 'a' }]);
    expect(bad.free.played).toBe(0);
  });

  it('counts streaks of days solved on their own day', () => {
    const save = emptyAcesSave();
    save.days['2026-10-02'] = win('2026-10-02');
    save.days['2026-10-03'] = win('2026-10-03', 3);
    save.days['2026-10-04'] = win('2026-10-06'); // archive: not on time
    save.days['2026-10-05'] = win('2026-10-05');
    save.days['2026-10-06'] = settleAce(giveUp(emptyAceProgress()), ace, '2026-10-06');
    const st = acesStats(save, '2026-10-06');
    expect(st.played).toBe(5);
    expect(st.solved).toBe(4);
    expect(st.streak).toBe(0); // today (10-06) was lost
    expect(st.bestStreak).toBe(2);
    expect(st.byTry).toEqual([3, 0, 1, 0, 0, 1]);
    expect(acesStats(save, '2026-10-05').streak).toBe(1);
  });
});

describe('facts over the real pool', () => {
  it('reads country, role, first year and teams of a real player', () => {
    const data = dailyData();
    const lookup = factsFromDaily(data);
    const p = data.playerList[0]!;
    const f = lookup(p.playerId)!;
    expect(f.handle).toBe(p.handle);
    expect(f.firstYear).toBe(p.firstYear);
    const m = data.byPlayer.get(p.playerId)?.[0];
    if (m) expect(f.teamsAt(m.eventId)).toContain(m.teamId);
    expect(lookup('no-such-player')).toBeUndefined();
  });
});
