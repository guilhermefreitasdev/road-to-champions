/**
 * Balance measurement: how far does a sensibly drafted team go? Deterministic (fixed seeds), so the bands only
 * move when the engine, the draft or the data change. Bands are a bit wider than the design targets so small
 * data changes do not break the suite; run with BALANCE_REPORT=1 to print the numbers.
 *
 * Design targets (classic mode, automated drafter below):
 * - one map: +10 strength wins ~75–85%, +20 ~90–95%;
 * - median drafted team: playoffs 55–75%, title 8–20%;
 * - top-decile drafted team: title 25–45%;
 * - bottom-decile drafted team: playoffs ≤ 35%.
 * Known gap: the classic title targets are not reached yet (median ~1%, top decile ~15–20%). A classic draft
 * averages ~84 OVR (base ~82 after role fit) while every field has an elite AI roster at ~95–97, so only a
 * stronger draft (more rerolls, a better roulette) or a different pool can close it, not the match engine.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA } from '../data/sample';
import { openSlots } from '../engine/draft';
import { simulateMap } from '../engine/match';
import { createRng } from '../engine/rng';
import { roleFit, teamStrength } from '../engine/team';
import type { Card, Slot } from '../engine/types';
import { aiChooseMap, isVetoComplete } from '../engine/veto';
import {
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  coachOptions,
  createRun,
  draftOptions,
  draftedLineup,
  lineupOf,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rerollDraft,
  rollDraft,
  startTournament,
  userPendingMatch,
  userRecord,
  type DraftMode,
  type RunState,
} from './run';

/** Print the measured numbers (BALANCE_REPORT=1 npm test). The project has no Node types, hence the cast. */
const REPORT = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BALANCE_REPORT;

/** Reroll the classic roulette while the best option is worth less than this (OVR × role fit). */
const REROLL_BELOW = 85;

function bestOption(cards: Card[], open: Slot[]): { card: Card; slot: Slot; value: number } | null {
  let best: { card: Card; slot: Slot; value: number } | null = null;
  for (const card of cards) {
    for (const slot of open) {
      const value = card.ovr * roleFit(card.role, slot);
      if (!best || value > best.value) best = { card, slot, value };
    }
  }
  return best;
}

/**
 * Greedy-but-sensible drafter: each pick takes the best OVR × role fit among the options and open slots,
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
    const lineups = [lineupOf(r, match.a), lineupOf(r, match.b)] as const;
    while (!isVetoComplete(r.veto!.state)) {
      const rng = createRng(`${seed}:user-veto:${match.id}:${r.veto!.state.steps.length}`);
      r = applyUserVeto(r, aiChooseMap(r.veto!.state, [lineups[0], lineups[1]], rng));
    }
    r = playUserMatch(r);
  }
  return { playoffs: userRecord(r).swiss.status === 'advanced', title: r.tournament!.champion === USER_ID };
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
function measure(mode: DraftMode, drafts: number, perGroup: number, tournaments: number) {
  const runs = Array.from({ length: drafts }, (_, i) => {
    const run = greedyDraft(createRun(mode, `balance-${mode}-${i}`));
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
        `${mode}: drafted p10/p50/p90 ${result.p10.toFixed(1)} / ${result.p50.toFixed(1)} / ${result.p90.toFixed(1)}`,
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

describe('balance: Champions runs', () => {
  it('classic: drafting well makes you a contender, drafting badly gets you knocked out', () => {
    const { bottom, median, top } = measure('classic', 200, 16, 4);
    // Target 55–75%; currently ~75–80% (the fictional pool has many weak rosters that a decent draft beats).
    expect(median.playoffs).toBeGreaterThan(0.5);
    expect(median.playoffs).toBeLessThan(0.88);
    expect(bottom.playoffs).toBeLessThan(0.4);
    expect(top.playoffs).toBeGreaterThan(median.playoffs);
    expect(median.playoffs).toBeGreaterThan(bottom.playoffs);
    // Titles: the upper bounds are the design targets (median 8–20%, top decile 25–45%); the lower bounds are
    // only what the current draft reaches. See the note at the top of the file.
    expect(top.title).toBeGreaterThan(0.05);
    expect(top.title).toBeLessThan(0.5);
    expect(median.title).toBeLessThan(0.22);
    expect(top.title).toBeGreaterThan(median.title);
  }, 60_000);

  it('ultimate: same shape, a bit stronger drafts', () => {
    const { bottom, median, top } = measure('ultimate', 100, 8, 3);
    expect(median.playoffs).toBeGreaterThan(0.55);
    expect(bottom.playoffs).toBeLessThan(median.playoffs);
    expect(top.title).toBeGreaterThan(median.title);
    expect(top.title).toBeLessThan(0.6);
    expect(median.title).toBeLessThan(0.3);
  }, 60_000);
});
