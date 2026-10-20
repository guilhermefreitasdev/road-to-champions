/**
 * Balance measurement: how far does a sensibly drafted team go? Deterministic (fixed seeds), so the bands only
 * move when the engine, the draft or the data change. Bands are a bit wider than the design targets so small
 * data changes do not break the suite; run with BALANCE_REPORT=1 to print the numbers, and BT=12 to play 12
 * Champions per team instead of 4 (3 in ultimate) for less noisy numbers (~3× slower).
 *
 * Design targets (classic mode, automated drafter below):
 * - one map: +10 strength wins ~75–85%, +20 ~90–95%;
 * - median drafted team: playoffs 55–75%, title 8–20%;
 * - top-decile drafted team: title 25–45%;
 * - bottom-decile drafted team: playoffs ≤ 35%.
 * Real pool (VLR + Liquipedia), strength v2 (five dimensions, decision weight 1.0, in-round decision edge 0.5),
 * FORM_SWING 10 and at most 3 elite rosters per field (run.ts), GSL groups + double-elimination playoffs, BT=12:
 * bottom 32% playoffs; median 74% playoffs, 6% title; top decile 46% title. Strength v1 (IGL ±, flat coach, chemistry
 * cap 2, 2 elite rosters) gave 32% / 77% / 5% / 44%. The greedy drafter ignores the IGL, so v2 sorts its deciles by
 * decision too (bottom 0% IGL, median 15%, top 100%): the research weights (1.4 / 0.7) dropped the median to 62% / 1%
 * and lifted the top to 54%; 1.0 / 0.5 plus the third elite roster brought both back. "Playoffs" = qualified from the
 * group (top 2). The median title still sits under 8%: the drafted spread is narrow (p10 78 → p90 86), so more upsets
 * would push the bottom decile past 35% first. Closing it needs a draft change (e.g. showing the IGL), not an engine lever.
 * Agents per map, flex natos and map familiarity (2026-10-20, BT=30): agents and familiarity measured as noise; the
 * flex natos lifted the drafted teams (p90 90.0 → 91.4) and the top decile's titles to ~55%, brought back to 46% by a
 * floor of 2 elite rosters per field (FIELD_ELITE_MIN, run.ts); median 71% / 5%, bottom 34% (docs/design.md).
 *
 * Difficulty ladder (2026-10-20, src/game/difficulty.ts): the old balance sits between Fácil and Normal; Normal is
 * harder at the owner's request. Targets per level (median playoffs / median title / top-decile title): Fácil ~80% /
 * 10% / 55%, Normal ~55% / 2–3% / 25%, Difícil ~35% / 1% / 12%, Lendário ~20% / ≤0.5% / 5%. Measured (classic, BT=30):
 * Fácil 87% / 10% / 55%, Normal 55% / 1% / 26%, Difícil 38% / 0% / 10%, Lendário 17% / 0% / 4% (bottom decile
 * 45% / 18% / 6% / 4%). The bands below are for Normal; DIFF=all prints the whole ladder.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA } from '../data/sample';
import { openSlots } from '../engine/draft';
import { simulateMap } from '../engine/match';
import { createRng } from '../engine/rng';
import { cardFit, teamStrength } from '../engine/team';
import type { Card, Slot } from '../engine/types';
import { aiChooseMap, isVetoComplete } from '../engine/veto';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import {
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  coachOptions,
  createRun,
  draftOptions,
  draftedLineup,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rerollDraft,
  rollDraft,
  startTournament,
  userPendingMatch,
  userRecord,
  vetoLineup,
  type DraftMode,
  type RunState,
} from './run';

/** Print the measured numbers (BALANCE_REPORT=1 npm test). The project has no Node types, hence the cast. */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = !!env.BALANCE_REPORT;

/** Reroll the classic roulette while the best option is worth less than this (OVR × role fit). */
const REROLL_BELOW = 89; // 85 before the +4 OVR shift (cards.ts OVR_FLOOR 63 → 67)

function bestOption(cards: Card[], open: Slot[]): { card: Card; slot: Slot; value: number } | null {
  let best: { card: Card; slot: Slot; value: number } | null = null;
  for (const card of cards) {
    for (const slot of open) {
      const value = card.ovr * cardFit(card, slot);
      if (!best || value > best.value) best = { card, slot, value };
    }
  }
  return best;
}

/**
 * Greedy-but-sensible drafter: each pick takes the best OVR × card fit (natural flexes included) among the options and open slots,
 * rerolling (classic) while that is below REROLL_BELOW; then the coach with the best tactic bonus.
 * It ignores IGL and chemistry, like a player who only looks at the numbers.
 */
function greedyDraft(run: RunState): RunState {
  let r = run;
  while (r.phase === 'draft' && r.draft.phase !== 'coach') {
    if (r.draft.phase === 'roll') r = rollDraft(r);
    let best = bestOption(draftOptions(r), openSlots(r.draft));
    while (r.mode === 'classic' && r.draft.rerollsLeft > 0 && (!best || best.value < REROLL_BELOW)) {
      r = rerollDraft(r);
      best = bestOption(draftOptions(r), openSlots(r.draft));
    }
    if (!best) throw new Error('No card to pick');
    r = pickDraftPlayer(r, best.card.id, best.slot);
  }
  const [coach] = [...coachOptions(r)].sort((a, b) => b.tacticBonus - a.tacticBonus);
  return pickDraftCoach(r, coach!.id);
}

/** Plays the Champions for a drafted run under `seed`; the user vetoes like the AI does. */
function playChampions(drafted: RunState, seed: string): { playoffs: boolean; title: boolean } {
  let r = startTournament({ ...drafted, seed }, 'Bot');
  while (r.phase === 'tournament') {
    r = beginUserVeto(r);
    const { match } = userPendingMatch(r)!;
    const lineups = [vetoLineup(r, match.a), vetoLineup(r, match.b)] as const;
    while (!isVetoComplete(r.veto!.state)) {
      const rng = createRng(`${seed}:user-veto:${match.id}:${r.veto!.state.steps.length}`);
      r = applyUserVeto(r, aiChooseMap(r.veto!.state, [lineups[0], lineups[1]], rng));
    }
    r = playUserMatch(r);
  }
  return { playoffs: userRecord(r).groups.status === 'qualified', title: r.tournament!.champion === USER_ID };
}

interface Group {
  teams: number;
  strength: number;
  playoffs: number;
  title: number;
}

/**
 * Drafts `drafts` teams, splits them by strength (bottom decile, middle fifth around the median, top decile)
 * and plays `tournaments` Champions for each of `perGroup` teams of every group.
 */
function measure(mode: DraftMode, drafts: number, perGroup: number, tournaments: number, difficulty: Difficulty = 'normal') {
  const runs = Array.from({ length: drafts }, (_, i) => {
    const run = greedyDraft(createRun(mode, `balance-${mode}-${i}`, difficulty));
    return { run, strength: teamStrength(draftedLineup(run)).total };
  }).sort((a, b) => a.strength - b.strength);

  const tenth = Math.floor(drafts / 10);
  const mid = Math.floor(drafts / 2);
  const spread = (list: typeof runs) =>
    Array.from({ length: perGroup }, (_, i) => list[Math.floor((i * list.length) / perGroup)]!);
  const groups = {
    bottom: spread(runs.slice(0, tenth)),
    median: spread(runs.slice(mid - tenth, mid + tenth)),
    top: spread(runs.slice(drafts - tenth)),
  };

  const play = (list: typeof runs): Group => {
    let playoffs = 0;
    let title = 0;
    list.forEach(({ run }, i) => {
      for (let t = 0; t < tournaments; t++) {
        const result = playChampions(run, `balance-${mode}-${i}-t${t}`);
        if (result.playoffs) playoffs++;
        if (result.title) title++;
      }
    });
    const n = list.length * tournaments;
    return {
      teams: list.length,
      strength: list.reduce((s, x) => s + x.strength, 0) / list.length,
      playoffs: playoffs / n,
      title: title / n,
    };
  };
  const result = {
    p10: runs[tenth]!.strength,
    p50: runs[mid]!.strength,
    p90: runs[drafts - tenth]!.strength,
    bottom: play(groups.bottom),
    median: play(groups.median),
    top: play(groups.top),
  };
  if (REPORT) {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const row = (name: string, g: Group) =>
      `  ${name.padEnd(6)} str ${g.strength.toFixed(1)}  playoffs ${pct(g.playoffs)}  title ${pct(g.title)}`;
    console.log(
      [
        `${mode} ${difficulty}: drafted p10/p50/p90 ${result.p10.toFixed(1)} / ${result.p50.toFixed(1)} / ${result.p90.toFixed(1)}`,
        row('bottom', result.bottom),
        row('median', result.median),
        row('top', result.top),
      ].join('\n'),
    );
  }
  return result;
}

describe('balance: single map', () => {
  const winRate = (edge: number, maps = 600) => {
    let wins = 0;
    for (let i = 0; i < maps; i++) {
      const rng = createRng(`balance-map-${edge}-${i}`);
      if (simulateMap(SAMPLE_AURORA, SAMPLE_AURORA, rng, { map: 'Ascent', adjust: [edge, 0] }).winner === 0) wins++;
    }
    return wins / maps;
  };

  it('a +10 favourite wins most maps but upsets are common; +20 is a heavy favourite', () => {
    const plus10 = winRate(10);
    const plus20 = winRate(20);
    if (REPORT) console.log(`map: +10 → ${plus10}, +20 → ${plus20}`);
    expect(plus10).toBeGreaterThan(0.72);
    expect(plus10).toBeLessThan(0.88);
    expect(plus20).toBeGreaterThan(0.87);
    expect(plus20).toBeLessThan(0.97);
    expect(winRate(0)).toBeGreaterThan(0.42);
    expect(winRate(0)).toBeLessThan(0.58);
  });
});

describe('balance: Champions runs (Normal)', () => {
  it('classic: drafting well makes you a contender, drafting badly gets you knocked out', () => {
    const { bottom, median, top } = measure('classic', 200, 16, Number(env.BT ?? 4));
    // Normal targets (BT=30): median playoffs ~55%, title ~2–3%; top decile title ~25%; bottom decile ≤ 20%.
    expect(median.playoffs).toBeGreaterThan(0.38);
    expect(median.playoffs).toBeLessThan(0.72);
    expect(bottom.playoffs).toBeLessThan(0.33);
    expect(top.playoffs).toBeGreaterThan(median.playoffs);
    expect(median.playoffs).toBeGreaterThan(bottom.playoffs);
    expect(top.title).toBeGreaterThan(0.1);
    expect(top.title).toBeLessThan(0.45);
    expect(median.title).toBeLessThan(0.09);
    expect(top.title).toBeGreaterThan(median.title);
  }, 600_000);

  it('ultimate: same shape', () => {
    const { bottom, median, top } = measure('ultimate', 100, 8, Number(env.BT ?? 3));
    expect(median.playoffs).toBeGreaterThan(0.3);
    expect(median.playoffs).toBeLessThan(0.8);
    expect(bottom.playoffs).toBeLessThan(median.playoffs);
    expect(top.title).toBeGreaterThanOrEqual(median.title);
    expect(top.title).toBeLessThan(0.4);
    expect(median.title).toBeLessThan(0.15);
  }, 600_000);
});

describe('balance: difficulty ladder', () => {
  it('Fácil is far easier than Lendário for the same drafter', () => {
    const bt = Math.max(2, Math.round(Number(env.BT ?? 4) / 2));
    const easy = measure('classic', 200, 16, bt, 'easy');
    const legend = measure('classic', 200, 16, bt, 'legend');
    // BT=30: easy median playoffs 87%, legend 17%; top-decile titles 55% vs 4%.
    expect(easy.median.playoffs - legend.median.playoffs).toBeGreaterThan(0.4);
    expect(easy.top.title).toBeGreaterThan(legend.top.title + 0.2);
    expect(easy.median.title).toBeGreaterThan(0);
    expect(legend.median.title).toBeLessThan(0.03);
  }, 600_000);
});

// BALANCE_REPORT=1 BT=30 DIFF=hard npx vitest run src/game/balance -t ladder --silent=false: one level of the ladder.
describe.skipIf(!env.DIFF)('balance: difficulty ladder (report)', () => {
  it('ladder', () => {
    const levels = env.DIFF === 'all' ? DIFFICULTIES : (env.DIFF!.split(',') as Difficulty[]);
    const mode = (env.DIFF_MODE ?? 'classic') as DraftMode;
    for (const d of levels) measure(mode, mode === 'classic' ? 200 : 100, mode === 'classic' ? 16 : 8, Number(env.BT ?? 4), d);
  }, 3_600_000);
});
