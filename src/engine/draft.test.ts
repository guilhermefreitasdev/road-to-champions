import { describe, expect, it } from 'vitest';
import { SAMPLE_ROSTERS } from '../data/sample';
import {
  SLOTS,
  availableCards,
  createDraft,
  draftLineup,
  openSlots,
  pickCoach,
  pickPlayer,
  reroll,
  roll,
  ultimateOptions,
  type DraftState,
} from './draft';
import { findCard } from './roster';
import { teamStrength } from './team';

const pool = SAMPLE_ROSTERS;

/** Plays a full classic draft: each pick takes the first available card into the first open slot. */
function runClassic(seed: string, useRerolls = false): DraftState {
  let s = createDraft(pool, 'classic', seed);
  while (s.phase !== 'coach') {
    s = roll(s, pool);
    if (useRerolls && s.rerollsLeft > 0) s = reroll(s, pool);
    s = pickPlayer(s, pool, availableCards(s, pool)[0]!.id, openSlots(s)[0]!);
  }
  return pickCoach(s, pool, s.coachOptions![0]!);
}

function runUltimate(seed: string): DraftState {
  let s = createDraft(pool, 'ultimate', seed);
  while (s.phase === 'pick') s = pickPlayer(s, pool, s.options![s.picks.length % 5]!, openSlots(s)[0]!);
  return pickCoach(s, pool, s.coachOptions![1]!);
}

describe('classic draft', () => {
  it('starts in the roll phase with 3 rerolls', () => {
    const s = createDraft(pool, 'classic', 'a');
    expect(s).toMatchObject({ mode: 'classic', phase: 'roll', rerollsLeft: 3, rollCount: 0, picks: [] });
    expect(openSlots(s)).toEqual([...SLOTS]);
    expect(availableCards(s, pool)).toEqual([]);
  });

  it('rolls a roster deterministically from the seed', () => {
    const a = roll(createDraft(pool, 'classic', 'seed'), pool);
    const b = roll(createDraft(pool, 'classic', 'seed'), pool);
    expect(a.phase).toBe('pick');
    expect(a.rollCount).toBe(1);
    expect(a.current).toEqual(b.current);
    const currents = ['1', '2', '3', '4', '5', '6'].map((x) => JSON.stringify(roll(createDraft(pool, 'classic', x), pool).current));
    expect(new Set(currents).size).toBeGreaterThan(1);
    expect(availableCards(a, pool)).toHaveLength(5);
  });

  it('rerolls to a different roster until rerolls run out', () => {
    let s = roll(createDraft(pool, 'classic', 'r'), pool);
    for (let i = 3; i > 0; i--) {
      const before = s.current;
      s = reroll(s, pool);
      expect(s.rerollsLeft).toBe(i - 1);
      expect(s.current).not.toEqual(before);
    }
    expect(s.rollCount).toBe(4);
    expect(() => reroll(s, pool)).toThrow(/No rerolls left/);
  });

  it('enforces phases', () => {
    const s = createDraft(pool, 'classic', 'p');
    expect(() => reroll(s, pool)).toThrow(/phase/);
    expect(() => pickPlayer(s, pool, pool[0]!.cards[0]!.id, 'flex')).toThrow(/phase/);
    const rolled = roll(s, pool);
    expect(() => roll(rolled, pool)).toThrow(/phase/);
    expect(() => pickCoach(rolled, pool, 'x')).toThrow(/phase/);
  });

  it('validates slots and cards', () => {
    let s = roll(createDraft(pool, 'classic', 'v'), pool);
    const [first, second] = availableCards(s, pool);
    expect(() => pickPlayer(s, pool, 'unknown@x-y', 'flex')).toThrow(/not available/);
    const other = pool.find((r) => r.teamId !== s.current!.teamId)!.cards[0]!;
    expect(() => pickPlayer(s, pool, other.id, 'flex')).toThrow(/not available/);
    s = pickPlayer(s, pool, first!.id, 'controller');
    expect(s.phase).toBe('roll');
    expect(s.current).toBeUndefined();
    expect(openSlots(s)).toEqual(['duelist', 'initiator', 'sentinel', 'flex']);
    // Force the same roster again to test slot reuse.
    const again: DraftState = { ...s, phase: 'pick', current: { teamId: first!.teamId, eventId: first!.eventId } };
    expect(availableCards(again, pool).map((c) => c.id)).not.toContain(first!.id);
    expect(() => pickPlayer(again, pool, second!.id, 'controller')).toThrow(/already filled/);
    expect(() => pickPlayer(again, pool, first!.id, 'flex')).toThrow(/already in the lineup/);
  });

  it('blocks the same player from a different event', () => {
    // falcao exists at several events; pick him once, then roll his other roster.
    const versions = pool.flatMap((r) => r.cards).filter((c) => c.playerId === 'falcao');
    expect(versions.length).toBeGreaterThan(1);
    const [a, b] = versions;
    const s: DraftState = { ...createDraft(pool, 'classic', 'f'), phase: 'pick', picks: [{ cardId: a!.id, slot: 'duelist' }], current: { teamId: b!.teamId, eventId: b!.eventId } };
    expect(availableCards(s, pool).map((c) => c.playerId)).not.toContain('falcao');
    expect(() => pickPlayer(s, pool, b!.id, 'flex')).toThrow(/already in the lineup/);
  });

  it('never rolls a roster with no available players', () => {
    // Two-roster pool where every player of roster A is already picked: every roll must land on B.
    const [a, b] = [pool[0]!, pool[2]!];
    const picks = a.cards.map((c, i) => ({ cardId: c.id, slot: SLOTS[i]! }));
    for (let i = 0; i < 20; i++) {
      const s: DraftState = { ...createDraft([a, b], 'classic', `t${i}`), picks };
      expect(roll(s, [a, b]).current).toEqual({ teamId: b.teamId, eventId: b.eventId });
    }
    const exhausted: DraftState = { ...createDraft([a], 'classic', 't'), picks };
    expect(() => roll(exhausted, [a])).toThrow(/No roster/);
  });

  it('moves to coach after 5 picks, then done, and builds a valid lineup', () => {
    for (const seed of ['run-1', 'run-2', 'run-3']) {
      for (const useRerolls of [false, true]) {
        const s = runClassic(seed, useRerolls);
        expect(s.phase).toBe('done');
        expect(s.picks).toHaveLength(5);
        expect(new Set(s.picks.map((p) => p.slot))).toEqual(new Set(SLOTS));
        const players = s.picks.map((p) => findCard(pool, p.cardId)!.playerId);
        expect(new Set(players).size).toBe(5);
        const lineup = draftLineup(s, pool, 'Meu Time');
        expect(lineup.players).toHaveLength(5);
        expect(lineup.coach?.id).toBe(s.coachId);
        expect(() => teamStrength(lineup)).not.toThrow();
        expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      }
    }
    expect(runClassic('same', true)).toEqual(runClassic('same', true));
  });

  it('offers 3 distinct coaches and validates the choice', () => {
    let s = createDraft(pool, 'classic', 'c');
    while (s.phase !== 'coach') {
      s = roll(s, pool);
      s = pickPlayer(s, pool, availableCards(s, pool)[0]!.id, openSlots(s)[0]!);
    }
    expect(s.coachOptions).toHaveLength(3);
    expect(new Set(s.coachOptions).size).toBe(3);
    expect(() => pickCoach(s, pool, 'not-a-coach')).toThrow(/not one of the options/);
    const unoffered = pool.map((r) => r.coach!.id).find((id) => !s.coachOptions!.includes(id))!;
    expect(() => pickCoach(s, pool, unoffered)).toThrow(/not one of the options/);
    expect(() => draftLineup(createDraft(pool, 'classic', 'c'), pool, 'x')).toThrow(/needs 5/);
  });

  it('does not mutate the previous state', () => {
    const s = createDraft(pool, 'classic', 'imm');
    const copy = structuredClone(s);
    const r = roll(s, pool);
    const rCopy = structuredClone(r);
    pickPlayer(r, pool, availableCards(r, pool)[0]!.id, 'flex');
    reroll(r, pool);
    expect(s).toEqual(copy);
    expect(r).toEqual(rCopy);
  });

  it('rejects classic-only actions in ultimate mode', () => {
    const s = createDraft(pool, 'ultimate', 'u');
    expect(() => roll(s, pool)).toThrow(/classic/);
    expect(() => reroll(s, pool)).toThrow(/classic/);
  });
});

describe('ultimate draft', () => {
  it('starts in pick with 5 options and no rerolls', () => {
    const s = createDraft(pool, 'ultimate', 'u1');
    expect(s).toMatchObject({ mode: 'ultimate', phase: 'pick', rerollsLeft: 0 });
    expect(s.options).toHaveLength(5);
    expect(availableCards(s, pool).map((c) => c.id)).toEqual(s.options);
  });

  it('fixes every pick’s options from the seed', () => {
    const all = ultimateOptions(pool, 'fixed');
    expect(all).toHaveLength(5);
    expect(ultimateOptions(pool, 'fixed')).toEqual(all);
    expect(ultimateOptions(pool, 'other')).not.toEqual(all);

    // Whatever the user picks, pick N always offers the same options.
    let a = createDraft(pool, 'ultimate', 'fixed');
    let b = createDraft(pool, 'ultimate', 'fixed');
    for (let i = 0; i < 5; i++) {
      expect(a.options).toEqual(all[i]);
      expect(b.options).toEqual(all[i]);
      if (i === 4) break;
      a = pickPlayer(a, pool, a.options![0]!, openSlots(a)[0]!);
      b = pickPlayer(b, pool, b.options![4]!, openSlots(b).at(-1)!);
    }
  });

  it('offers cards from distinct rosters with no repeated player in the run', () => {
    for (const seed of ['d1', 'd2', 'd3', 'd4', 'd5']) {
      const all = ultimateOptions(pool, seed);
      const players = all.flat().map((id) => findCard(pool, id)!.playerId);
      expect(new Set(players).size).toBe(25);
      for (const options of all) {
        const rosters = options.map((id) => {
          const c = findCard(pool, id)!;
          return `${c.teamId}-${c.eventId}`;
        });
        expect(new Set(rosters).size).toBe(5);
      }
    }
  });

  it('throws when the pool is too small', () => {
    expect(() => createDraft(pool.slice(0, 4), 'ultimate', 'x')).toThrow(/too small/);
  });

  it('runs to a valid lineup, deterministically', () => {
    const s = runUltimate('full');
    expect(s.phase).toBe('done');
    expect(s.options).toBeUndefined();
    const lineup = draftLineup(s, pool, 'Ultimate');
    expect(lineup.players).toHaveLength(5);
    expect(new Set(lineup.players.map((p) => p.slot)).size).toBe(5);
    expect(() => teamStrength(lineup)).not.toThrow();
    expect(runUltimate('full')).toEqual(s);
  });

  it('rejects cards that are not among the options', () => {
    const s = createDraft(pool, 'ultimate', 'opt');
    const outside = pool.flatMap((r) => r.cards).find((c) => !s.options!.includes(c.id))!;
    expect(() => pickPlayer(s, pool, outside.id, 'flex')).toThrow(/not available/);
  });
});
