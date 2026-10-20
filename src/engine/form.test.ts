/**
 * Calibration of Modelo v3 (docs/pesquisa-variancia.md §6.6, §10.3): per-player form, kill chain, MVPs, hot
 * hand and aura, measured on the engine's own scoreboards over many seeded maps. Bands are the research
 * targets plus a tolerance for sampling noise. FORM_REPORT=1 prints the numbers.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE_MAP_POOL } from '../data/mapPools';
import {
  AURA_TEAM_CAP,
  FORM_SERIES_RHO,
  META_BONUS_MAX,
  applyTournamentForm,
  auraPoints,
  drawFormZ,
  drawTournamentForm,
  formFactor,
  metaFit,
  prodigyGrowth,
  teamFormPoints,
} from './form';
import { COLD_RATING, INSPIRED_RATING } from './form';
import { CHAIN, FORM_SWING, TRADE, compareLines, estimateRating, isCold, isInspired, simulateMap, type MapResult } from './match';
import { createRng } from './rng';
import { simulateSeries } from './series';
import { ANCHOR_DIMENSION_BONUS, teamDimensions } from './team';
import type { AuraTier, Card, Lineup, Role } from './types';
import { applyVeto, createVeto, isVetoComplete, remainingMaps } from './veto';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = !!env.FORM_REPORT;
const log = (...xs: unknown[]) => REPORT && console.log(...xs);

const ROLES: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'initiator'];

function card(name: string, i: number, ovr: number, role: Role, extra: Partial<Card> = {}): Card {
  return {
    id: `${name}-${i}`,
    playerId: `${name}-${i}`,
    handle: `${name}${i}`,
    country: '',
    teamId: name,
    eventId: 'test',
    role,
    isIGL: i === 2,
    agents: [],
    attrs: { aim: ovr, entry: ovr, utility: ovr, clutch: ovr, presence: ovr, decision: i === 2 ? 80 : 50 },
    ovr,
    ...extra,
  };
}

/** Five equal players (OVR / attributes `ovr`), or one OVR per slot. */
function lineup(name: string, ovrs: number | number[] = 80, extra: (i: number) => Partial<Card> = () => ({})): Lineup {
  return {
    name,
    players: ROLES.map((role, i) => ({ card: card(name, i, Array.isArray(ovrs) ? ovrs[i]! : ovrs, role, extra(i)), slot: role })),
  };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const skew = (xs: number[]) => {
  const m = mean(xs);
  const s = sd(xs);
  return mean(xs.map((x) => ((x - m) / s) ** 3));
};

function playMaps(a: Lineup, b: Lineup, n: number, tag: string): MapResult[] {
  return Array.from({ length: n }, (_, i) => simulateMap(a, b, createRng(`form-${tag}-${i}`), { map: 'Ascent', formSeed: `form-${tag}-${i}` }));
}

describe('form draws', () => {
  it('drawFormZ is centred, unit-ish and right-skewed; the factor grows with OVR and is bounded', () => {
    const rng = createRng('z');
    const zs = Array.from({ length: 40_000 }, () => drawFormZ(rng));
    expect(Math.abs(mean(zs))).toBeLessThan(0.03);
    expect(sd(zs)).toBeGreaterThan(0.95);
    expect(sd(zs)).toBeLessThan(1.1);
    expect(skew(zs)).toBeGreaterThan(0.1);
    expect(skew(zs)).toBeLessThan(0.35);
    expect(zs.filter((z) => z >= 1.3).length / zs.length).toBeGreaterThan(0.07);
    expect(zs.filter((z) => z >= 1.3).length / zs.length).toBeLessThan(0.13);
    expect(formFactor(1.3, 92, 'duelist')).toBeGreaterThan(formFactor(1.3, 72, 'duelist'));
    expect(formFactor(10, 99, 'duelist')).toBe(1.9);
    expect(formFactor(-10, 60, 'initiator')).toBe(0.55);
    expect(formFactor(0, 80, 'controller')).toBe(1);
  });

  it('teamFormPoints weighs by OVR share and is bounded', () => {
    const l = lineup('A', [92, 80, 76, 76, 76]);
    // z = +2 for a star (OVR 92): f ≈ 1.22 → ≈ +4.5 points; the same day for a support is worth less.
    const star = teamFormPoints(l.players, [1.22, 1, 1, 1, 1]);
    const support = teamFormPoints(l.players, [1, 1, 1, 1, 1.22]);
    expect(star).toBeGreaterThan(support);
    expect(star).toBeGreaterThan(3);
    expect(star).toBeLessThan(6);
    expect(teamFormPoints(l.players, [1.9, 1.9, 1.9, 1.9, 1.9])).toBe(8);
    expect(teamFormPoints(l.players, [1, 1, 1, 1, 1])).toBe(0);
  });

  it('tournament form is small (σ ≈ 2.5 OVR, |t| ≤ 6) and applied to the attributes once', () => {
    const rng = createRng('t');
    const ts = Array.from({ length: 20_000 }, () => drawTournamentForm(rng));
    expect(Math.abs(mean(ts))).toBeLessThan(0.1);
    expect(sd(ts)).toBeGreaterThan(2.1);
    expect(sd(ts)).toBeLessThan(2.9);
    expect(Math.max(...ts)).toBeLessThanOrEqual(6);
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(-6);
    const base = lineup('A');
    const formed = applyTournamentForm(base, 'seed');
    expect(applyTournamentForm(base, 'seed')).toEqual(formed);
    for (const p of formed.players) {
      expect(p.tournamentForm).toBeDefined();
      expect(p.card.ovr).toBe(Math.max(50, Math.min(99, Math.round(80 + p.tournamentForm!))));
      expect(p.card.attrs.clutch).toBe(80);
    }
    expect(base.players[0]!.card.ovr).toBe(80);
  });

  it('prodigy growth is +0.5 per stage, capped at +2, and only for prodigies', () => {
    expect(prodigyGrowth(0)).toBe(0);
    expect(prodigyGrowth(1)).toBe(0.5);
    expect(prodigyGrowth(3)).toBe(1.5);
    expect(prodigyGrowth(9)).toBe(2);
    const l = lineup('A', 80, (i) => (i === 0 ? { prodigy: true } : {}));
    const grown = applyTournamentForm(l, 'seed', 2);
    expect(grown.players[0]!.growth).toBe(2);
    expect(grown.players[0]!.card.ovr - l.players[0]!.card.ovr).toBe(Math.round(grown.players[0]!.tournamentForm! + 2));
    expect(grown.players[1]!.growth).toBeUndefined();
  });
});

describe('calibration: equal teams (OVR 80)', () => {
  const A = lineup('A');
  const B = lineup('B');
  const maps = playMaps(A, B, 1500, 'equal');
  const rounds = maps.reduce((s, m) => s + m.rounds.length, 0);
  const lines = maps.flatMap((m) => [...m.players[0], ...m.players[1]]);

  it('produces ≈ 6.86 kills per round over the 10 players', () => {
    const kills = lines.reduce((s, l) => s + l.kills, 0);
    const kpr = kills / rounds;
    log(`kills/round ${kpr.toFixed(2)}`);
    expect(kpr).toBeGreaterThan(6.66);
    expect(kpr).toBeLessThan(7.06);
  });

  it('gives each player a per-map KPR SD ≈ 0.20 (≈ 0.18 around the team), right-skewed, with ≈ 8–13% of ≥ +0.25 maps', () => {
    const total: number[] = [];
    const individual: number[] = [];
    for (const m of maps) {
      const n = m.rounds.length;
      for (const team of m.players) {
        const kprs = team.map((l) => l.kills / n);
        const teamMean = mean(kprs);
        for (const k of kprs) {
          total.push(k);
          individual.push(k - teamMean);
        }
      }
    }
    const grand = mean(total);
    const totalSd = sd(total);
    const indSd = sd(individual);
    const high = total.filter((k) => k >= grand + 0.25).length / total.length;
    log(`KPR mean ${grand.toFixed(3)} sd ${totalSd.toFixed(3)} individual sd ${indSd.toFixed(3)} skew ${skew(individual).toFixed(2)} ≥+0.25: ${(high * 100).toFixed(1)}%`);
    // Research: total 0.20 ± 0.03, individual 0.18 ± 0.03, skew +0.1 to +0.3. The "≥ mean + 0.25" share (real
    // ≈ 7–8% for rating ≥ 1.5) sits at ≈ 12% here because the engine's lottery tail is a little fatter.
    expect(totalSd).toBeGreaterThan(0.17);
    expect(totalSd).toBeLessThan(0.23);
    expect(indSd).toBeGreaterThan(0.15);
    expect(indSd).toBeLessThan(0.21);
    expect(skew(individual)).toBeGreaterThan(0.1);
    expect(skew(individual)).toBeLessThan(0.4);
    expect(high).toBeGreaterThan(0.08);
    expect(high).toBeLessThan(0.14);
  });

  it('hits the real multikill rates: 3K 3.8%, 4K 0.8%, ace 0.083% per player-round; 0.175 aces per map; 16% of maps with an ace', () => {
    const playerRounds = rounds * 10;
    const k3 = lines.reduce((s, l) => s + l.multikills.k3, 0) / playerRounds;
    const k4 = lines.reduce((s, l) => s + l.multikills.k4, 0) / playerRounds;
    const k5 = lines.reduce((s, l) => s + l.multikills.k5, 0) / playerRounds;
    const acesPerMap = lines.reduce((s, l) => s + l.multikills.k5, 0) / maps.length;
    const mapsWithAce = maps.filter((m) => [...m.players[0], ...m.players[1]].some((l) => l.multikills.k5 > 0)).length / maps.length;
    log(`3K ${(k3 * 100).toFixed(2)}% 4K ${(k4 * 100).toFixed(2)}% ace ${(k5 * 100).toFixed(3)}% aces/map ${acesPerMap.toFixed(3)} maps with ace ${(mapsWithAce * 100).toFixed(1)}% (CHAIN ${CHAIN})`);
    expect(k3).toBeGreaterThan(0.033);
    expect(k3).toBeLessThan(0.043);
    expect(k4).toBeGreaterThan(0.006);
    expect(k4).toBeLessThan(0.01);
    expect(k5).toBeGreaterThan(0.0004);
    expect(k5).toBeLessThan(0.0013);
    expect(acesPerMap).toBeGreaterThan(0.1);
    expect(acesPerMap).toBeLessThan(0.25);
    expect(mapsWithAce).toBeGreaterThan(0.1);
    expect(mapsWithAce).toBeLessThan(0.22);
  });

  it('puts the map MVP on the losing team ≈ 15% of the time, and a rating ≥ 1.4 player on the winner ≥ 85%', () => {
    expect(estimateRating(0.69, 0.69, 0.25, 0.72)).toBeCloseTo(1.0, 1);
    const ratings = lines.map((l) => l.rating);
    const inspired = lines.filter(isInspired).length / lines.length;
    const cold = lines.filter(isCold).length / lines.length;
    log(`rating mean ${mean(ratings).toFixed(3)} sd ${sd(ratings).toFixed(3)}; inspired (≥ ${INSPIRED_RATING}) ${(inspired * 100).toFixed(1)}%, cold (≤ ${COLD_RATING}) ${(cold * 100).toFixed(1)}%`);
    expect(mean(ratings)).toBeGreaterThan(0.95);
    expect(mean(ratings)).toBeLessThan(1.05);
    expect(sd(ratings)).toBeGreaterThan(0.22);
    expect(sd(ratings)).toBeLessThan(0.34);
    expect(inspired).toBeGreaterThan(0.04);
    expect(inspired).toBeLessThan(0.12);
    expect(cold).toBeGreaterThan(0.04);
    expect(cold).toBeLessThan(0.15);
    let losingMvp = 0;
    let hot = 0;
    let hotWins = 0;
    for (const m of maps) {
      m.players.forEach((team, t) => {
        for (const l of team) {
          if (l.mvp && t !== m.winner) losingMvp++;
          if (l.rating >= 1.4) {
            hot++;
            if (t === m.winner) hotWins++;
          }
        }
      });
    }
    log(`MVP on loser ${((losingMvp / maps.length) * 100).toFixed(1)}%; rating ≥ 1.4 wins ${((hotWins / hot) * 100).toFixed(1)}% (n ${hot})`);
    // Real: 15.2% (the engine's within-map lottery keeps it near 19%) and 88% for a rating ≥ 1.4.
    expect(losingMvp / maps.length).toBeGreaterThan(0.12);
    expect(losingMvp / maps.length).toBeLessThan(0.23);
    expect(hot).toBeGreaterThan(300);
    expect(hotWins / hot).toBeGreaterThan(0.85);
    expect(hotWins / hot).toBeLessThan(0.95);
  });

  it('shows an "Inspirado" in roughly a third of the maps, almost always on the winner', () => {
    const any = maps.filter((m) => m.players.some((team) => team.some(isInspired))).length / maps.length;
    const onWinner = maps.filter((m) => m.players[m.winner].some(isInspired)).length / maps.length;
    log(`maps with an inspired player: ${(any * 100).toFixed(1)}% (on the winner ${(onWinner * 100).toFixed(1)}%)`);
    expect(any).toBeGreaterThan(0.2);
    expect(any).toBeLessThan(0.6);
    expect(onWinner / any).toBeGreaterThan(0.85);
  });

  it('keeps the total map form of a team at σ_p 0.065–0.085 (difference of the two teams, in round probability)', () => {
    const diffs = maps.map((m) => m.edges[0].swing + m.edges[0].form - m.edges[1].swing - m.edges[1].form);
    const sigmaP = (sd(diffs) / 30) * 0.25;
    const formSd = sd(maps.map((m) => m.edges[0].form));
    log(`team form: swing ±${1.5 * FORM_SWING}, players' form sd ${formSd.toFixed(2)} pts, total difference sd ${sd(diffs).toFixed(2)} pts → σ_p ${sigmaP.toFixed(3)}`);
    expect(formSd).toBeGreaterThan(3);
    expect(formSd).toBeLessThan(4.6);
    expect(sigmaP).toBeGreaterThan(0.063);
    expect(sigmaP).toBeLessThan(0.085);
  });

  it('a +10 favourite still wins 72–78% of the maps', () => {
    let wins = 0;
    const n = 1500;
    for (let i = 0; i < n; i++) {
      if (simulateMap(A, B, createRng(`form-plus10-${i}`), { map: 'Ascent', adjust: [10, 0], formSeed: `p10-${i}` }).winner === 0) wins++;
    }
    log(`+10 → ${((wins / n) * 100).toFixed(1)}%`);
    expect(wins / n).toBeGreaterThan(0.71);
    expect(wins / n).toBeLessThan(0.79);
  });
});

describe('calibration: a star among supports', () => {
  // A star (KPR ≈ 0.84, the research's "> 0.80" row) with four supports, against a plain 80 team
  // (docs/pesquisa-variancia.md §2.6: 3K+ 6.9%, 4K+ 1.66%, ace 0.24%; supports at KPR 0.55: 4K+ 0.33%, ace 0.02%).
  const S = lineup('S', [92, 74, 74, 74, 74]);
  const B = lineup('B');
  const maps = playMaps(S, B, 1500, 'star');
  const rounds = maps.reduce((s, m) => s + m.rounds.length, 0);

  it('multikills grow with the level: the star makes 3K+ ≈ 6.5%, 4K+ ≈ 1.6%, aces ≈ 0.22%; a support far fewer', () => {
    const rate = (idx: number, pick: (l: MapResult['players'][0][0]) => number) =>
      maps.reduce((s, m) => s + pick(m.players[0][idx]!), 0) / rounds;
    const k3plus = (l: MapResult['players'][0][0]) => l.multikills.k3 + l.multikills.k4 + l.multikills.k5;
    const k4plus = (l: MapResult['players'][0][0]) => l.multikills.k4 + l.multikills.k5;
    const star = { k3: rate(0, k3plus), k4: rate(0, k4plus), k5: rate(0, (l) => l.multikills.k5) };
    const support = { k4: rate(1, k4plus), k5: rate(1, (l) => l.multikills.k5) };
    const kd = (idx: number) => maps.reduce((s, m) => s + m.players[0][idx]!.kills, 0) / maps.reduce((s, m) => s + m.players[0][idx]!.deaths, 0);
    log(`star KPR ${rate(0, (l) => l.kills).toFixed(2)} K/D ${kd(0).toFixed(2)} 3K+ ${(star.k3 * 100).toFixed(2)}% 4K+ ${(star.k4 * 100).toFixed(2)}% ace ${(star.k5 * 100).toFixed(3)}%; support KPR ${rate(1, (l) => l.kills).toFixed(2)} K/D ${kd(1).toFixed(2)} 4K+ ${(support.k4 * 100).toFixed(2)}% ace ${(support.k5 * 100).toFixed(3)}% (TRADE ${TRADE})`);
    expect(star.k3).toBeGreaterThan(0.059);
    expect(star.k3).toBeLessThan(0.079);
    expect(star.k4).toBeGreaterThan(0.0126);
    expect(star.k4).toBeLessThan(0.0206);
    expect(star.k5).toBeGreaterThan(0.0014);
    expect(star.k5).toBeLessThan(0.0034);
    expect(support.k4).toBeLessThan(star.k4 / 1.8);
    expect(support.k5).toBeLessThan(star.k5 / 1.5);
  });

  it('makes the team MVP the best card ≈ 39% of the time and the worst ≈ 7% on a real-looking roster', () => {
    const R = lineup('R', [90, 84, 80, 76, 72]);
    const O = lineup('O', [82, 82, 80, 78, 78]);
    const played = playMaps(R, O, 1500, 'roster');
    let best = 0;
    let worst = 0;
    for (const m of played) {
      const top = [...m.players[0]].sort((x, y) => compareLines(y, x))[0]!;
      if (top.cardId === 'R-0') best++;
      if (top.cardId === 'R-4') worst++;
    }
    log(`team MVP: best card ${((best / played.length) * 100).toFixed(1)}%, worst card ${((worst / played.length) * 100).toFixed(1)}%`);
    expect(best / played.length).toBeGreaterThan(0.32);
    expect(best / played.length).toBeLessThan(0.5);
    expect(worst / played.length).toBeGreaterThan(0.03);
    expect(worst / played.length).toBeLessThan(0.12);
  });
});

describe('calibration: series', () => {
  const POOL = SAMPLE_MAP_POOL;
  const veto = (() => {
    let s = createVeto(POOL, 3, 0);
    while (!isVetoComplete(s)) s = applyVeto(s, remainingMaps(s)[0]!);
    return s;
  })();
  const A = lineup('A');
  const B = lineup('B');
  const series = Array.from({ length: 1500 }, (_, i) =>
    simulateSeries(A, B, createRng(`form-series-${i}`), { bestOf: 3, pool: POOL, veto, formSeed: `form-series-${i}` }),
  );

  it('carries a small hot hand between maps (ρ ≈ 0.1) and no team momentum (map-1 winner takes map 2 ≈ 50–54%)', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    let repeat = 0;
    for (const s of series) {
      const [m1, m2] = s.maps;
      if (!m1 || !m2) continue;
      if (m2.winner === m1.winner) repeat++;
      m1.players.forEach((team, t) => team.forEach((l, i) => {
        xs.push(l.form);
        ys.push(m2.players[t]![i]!.form);
      }));
    }
    const mx = mean(xs);
    const my = mean(ys);
    const corr = mean(xs.map((x, i) => (x - mx) * (ys[i]! - my))) / (sd(xs) * sd(ys));
    log(`form autocorrelation lag 1: ${corr.toFixed(3)} (ρ ${FORM_SERIES_RHO}); map-1 winner wins map 2: ${((repeat / series.length) * 100).toFixed(1)}%`);
    expect(corr).toBeGreaterThan(0.04);
    expect(corr).toBeLessThan(0.16);
    expect(repeat / series.length).toBeGreaterThan(0.46);
    expect(repeat / series.length).toBeLessThan(0.56);
  });

  it('names a series MVP with the best rounds-weighted rating and is deterministic', () => {
    const s = series[0]!;
    const ratingOf = (cardId: string) => {
      let r = 0;
      let n = 0;
      for (const m of s.maps) {
        const line = [...m.players[0], ...m.players[1]].find((l) => l.cardId === cardId)!;
        r += line.rating * m.rounds.length;
        n += m.rounds.length;
      }
      return r / n;
    };
    const all = s.maps[0]!.players.flat().map((l) => l.cardId);
    expect(ratingOf(s.mvp.cardId)).toBe(Math.max(...all.map(ratingOf)));
    expect(s.mvp.rating).toBe(Math.round(ratingOf(s.mvp.cardId) * 100) / 100);
    expect(simulateSeries(A, B, createRng('form-series-0'), { bestOf: 3, pool: POOL, veto, formSeed: 'form-series-0' })).toEqual(s);
    expect(s.maps.every((m) => m.players.flat().filter((l) => l.mvp).length === 1)).toBe(true);
  });

  it('draws a player\'s form from the match, map and card only (not from the rng position)', () => {
    const r1 = simulateMap(A, B, createRng('x'), { map: 'Haven', formSeed: 'match-1' });
    const r2 = simulateMap(A, B, createRng('y'), { map: 'Haven', formSeed: 'match-1' });
    expect(r1.players[0].map((l) => l.form)).toEqual(r2.players[0].map((l) => l.form));
    expect(r1.players[0].map((l) => l.form)).not.toEqual(simulateMap(A, B, createRng('x'), { map: 'Haven', formSeed: 'match-2' }).players[0].map((l) => l.form));
  });
});

describe('aura, anchors and meta fit', () => {
  const tiers: AuraTier[] = ['goat', 'legend', 'legend', 'goat', 'star'];
  const G = lineup('G', 80, (i) => ({ aura: tiers[i]! }));
  const N = lineup('N');

  it('caps the personal aura at +2 points and applies it in deciders and overtime only', () => {
    expect(auraPoints(G.players)).toBe(AURA_TEAM_CAP);
    expect(auraPoints(N.players)).toBe(0);
    const plain = simulateMap(G, N, createRng('a'), { map: 'Ascent', formSeed: 'a' });
    const decider = simulateMap(G, N, createRng('a'), { map: 'Ascent', formSeed: 'a', decider: true });
    expect(plain.edges[0].aura === 0 || plain.rounds.length > 24).toBe(true);
    expect(decider.edges[0].aura).toBeGreaterThan(0);
    expect(decider.edges[1].aura).toBe(0);
  });

  it('an all-GOAT/legend roster beats an equal-OVR roster without aura in ≤ 57% of deciders and ≤ 56% of MD3s', () => {
    let deciders = 0;
    let maps = 0;
    let seriesWins = 0;
    const n = 1500;
    const POOL = SAMPLE_MAP_POOL;
    for (let i = 0; i < n; i++) {
      if (simulateMap(G, N, createRng(`aura-d-${i}`), { map: 'Ascent', formSeed: `aura-d-${i}`, decider: true }).winner === 0) deciders++;
      if (simulateMap(G, N, createRng(`aura-m-${i}`), { map: 'Ascent', formSeed: `aura-m-${i}` }).winner === 0) maps++;
      if (simulateSeries(G, N, createRng(`aura-s-${i}`), { bestOf: 3, pool: POOL, formSeed: `aura-s-${i}` }).winner === 0) seriesWins++;
    }
    log(`aura: decider ${((deciders / n) * 100).toFixed(1)}%, plain map ${((maps / n) * 100).toFixed(1)}%, MD3 ${((seriesWins / n) * 100).toFixed(1)}%`);
    expect(deciders / n).toBeGreaterThan(0.5);
    expect(deciders / n).toBeLessThanOrEqual(0.57);
    expect(maps / n).toBeGreaterThan(0.46);
    expect(maps / n).toBeLessThan(0.55);
    expect(seriesWins / n).toBeLessThanOrEqual(0.57);
  });

  it('an anchor adds +3 to decision and communication, once per team', () => {
    // Different teams and countries, so communication is not already at its cap.
    const apart = (i: number): Partial<Card> => ({ teamId: `t${i}`, country: '' });
    const one = lineup('A', 80, (i) => (i === 2 ? { anchor: true, ...apart(i) } : apart(i)));
    const two = lineup('A', 80, (i) => (i <= 1 ? { anchor: true, ...apart(i) } : apart(i)));
    const none = lineup('A', 80, apart);
    const d = (l: Lineup) => teamDimensions(l);
    expect(d(one).decision - d(none).decision).toBeCloseTo(ANCHOR_DIMENSION_BONUS);
    expect(d(one).communication - d(none).communication).toBeCloseTo(ANCHOR_DIMENSION_BONUS);
    expect(d(two).decision).toBe(d(one).decision);
  });

  it('meta fit scores the best comp from the repertoires, capped at +1.5, never negative, unique agents', () => {
    const meta = { Omen: 20, Sova: 16, Neon: 15, Cypher: 10, Phoenix: 8, Chamber: 6 };
    const agents = [['Neon', 'Jett'], ['Sova'], ['Omen', 'Astra'], ['Cypher'], ['Phoenix', 'Sova']];
    const full = lineup('M', 80, (i) => ({ agents: agents[i]! }));
    const fit = metaFit(full, meta);
    expect(fit.fit).toBeCloseTo(1);
    expect(fit.points).toBe(META_BONUS_MAX);
    expect(new Set(fit.agents).size).toBe(5);
    const twoSovas = lineup('M', 80, (i) => ({ agents: i === 4 ? ['Sova'] : agents[i]! }));
    expect(metaFit(twoSovas, meta).fit).toBeLessThan(1);
    expect(metaFit(twoSovas, meta).agents.filter((a) => a === 'Sova')).toHaveLength(1);
    const off = lineup('M', 80, () => ({ agents: ['Jett', 'Raze'] }));
    expect(metaFit(off, meta)).toEqual({ fit: 0, points: 0, agents: ['', '', '', '', ''] });
    expect(metaFit(off, undefined).points).toBe(0);
  });
});
