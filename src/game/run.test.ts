import { describe, expect, it } from 'vitest';
import { SLOTS, openSlots } from '../engine/draft';
import { roleFit, teamStrength } from '../engine/team';
import { PLAYOFF_BRACKET } from '../engine/tournament';
import { isVetoComplete, nextTurn, remainingMaps } from '../engine/veto';
import { MISSING_ROLE_PENALTY, explainStrength, fitLabel } from './explain';
import {
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  bracket,
  cleanTeamName,
  coachOptions,
  createRun,
  draftOptions,
  draftedLineup,
  involvesUser,
  parseRun,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rollDraft,
  runSummary,
  shareText,
  standings,
  startTournament,
  teamInfo,
  userFinish,
  userPendingMatch,
  userRecord,
  vetoScouting,
  type DraftMode,
  type RunState,
} from './run';

/** Automatic draft: first available card into its own role slot when open, else flex, else any open slot. */
function autoDraft(run: RunState): RunState {
  let r = run;
  while (r.phase === 'draft' && r.draft.phase !== 'coach') {
    if (r.draft.phase === 'roll') r = rollDraft(r);
    const [card] = draftOptions(r);
    if (!card) throw new Error('No card to pick');
    const open = openSlots(r.draft);
    const slot = open.includes(card.role) ? card.role : open.includes('flex') ? 'flex' : open[0]!;
    r = pickDraftPlayer(r, card.id, slot);
  }
  return pickDraftCoach(r, coachOptions(r)[0]!.id);
}

/** One user match: veto with the first remaining map on each user turn, then play. */
function playOne(run: RunState): RunState {
  let r = beginUserVeto(run);
  while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
  return playUserMatch(r);
}

function fullRun(mode: DraftMode, seed: string, onStop?: (r: RunState) => void): RunState {
  let r = startTournament(autoDraft(createRun(mode, seed)), 'Time Teste');
  for (let guard = 0; r.phase === 'tournament'; guard++) {
    if (guard > 30) throw new Error('Run did not finish');
    onStop?.(r);
    r = playOne(r);
  }
  return r;
}

describe('draft glue', () => {
  it('goes draft → team → tournament', () => {
    const r = autoDraft(createRun('classic', 'g1'));
    expect(r.phase).toBe('team');
    expect(r.draft.picks).toHaveLength(SLOTS.length);
    expect(draftedLineup(r).coach).toBeDefined();
    const t = startTournament(r, '  Os   Brabos  ');
    expect(t.teamName).toBe('Os Brabos');
    expect(t.tournament!.entrants).toHaveLength(16);
    expect(t.opponents).toHaveLength(15);
  });

  it('seeds the field by team strength', () => {
    const r = startTournament(autoDraft(createRun('ultimate', 'g2')), 'X');
    const strengths = r.tournament!.entrants.map((e) => teamInfo(r, e.id).strength);
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
    expect(r.tournament!.entrants.map((e) => e.seed)).toEqual([...Array(16).keys()].map((i) => i + 1));
  });

  it('cleans team names', () => {
    expect(cleanTeamName('   ')).toBe('Meu Time');
    expect(cleanTeamName('a'.repeat(40))).toHaveLength(24);
  });

  it('rejects actions in the wrong phase', () => {
    const r = createRun('classic', 'g3');
    expect(() => startTournament(r, 'X')).toThrow(/phase/);
    expect(() => playUserMatch(r)).toThrow();
  });
});

describe('full runs', () => {
  for (const mode of ['classic', 'ultimate'] as const) {
    it(`a ${mode} run with automatic choices reaches 'done' with a champion`, () => {
      const r = fullRun(mode, `full-${mode}`);
      expect(r.phase).toBe('done');
      expect(r.tournament!.phase).toBe('done');
      expect(r.tournament!.champion).toBeDefined();
      expect(userFinish(r)).not.toBeNull();
      const summary = runSummary(r);
      expect(summary.championName).toBeTruthy();
      expect(summary.record.results.length).toBe(Object.keys(r.userSeries).length);
    });
  }

  it('finishes across many seeds in both modes', () => {
    const places = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const r = fullRun(i % 2 ? 'classic' : 'ultimate', `many-${i}`);
      expect(r.phase).toBe('done');
      const finish = userFinish(r)!;
      places.add(finish.place);
      // The user played every match up to elimination or the title.
      const rec = userRecord(r);
      expect(rec.results.every((x) => r.userSeries[x.match.id])).toBe(true);
    }
    expect(places.size).toBeGreaterThan(1);
  });

  it('is deterministic: same seed and choices give the same RunState JSON', () => {
    expect(JSON.stringify(fullRun('classic', 'det'))).toBe(JSON.stringify(fullRun('classic', 'det')));
    expect(JSON.stringify(fullRun('ultimate', 'det'))).toBe(JSON.stringify(fullRun('ultimate', 'det')));
    expect(JSON.stringify(fullRun('classic', 'det'))).not.toBe(JSON.stringify(fullRun('classic', 'det-2')));
  });

  it('never auto-plays the user match and stores series only for the user', () => {
    const r = fullRun('classic', 'never', (stop) => {
      const pending = userPendingMatch(stop);
      expect(pending).not.toBeNull();
      expect(pending!.match.result).toBeUndefined();
      // Nothing scheduled before the user's match is left unplayed.
      const t = stop.tournament!;
      const idx = t.matches.findIndex((m) => m.id === pending!.match.id);
      expect(t.matches.slice(0, idx).every((m) => m.result)).toBe(true);
    });
    for (const m of r.tournament!.matches) {
      expect(!!r.userSeries[m.id]).toBe(involvesUser(m) && !!m.result);
    }
  });

  it('survives a JSON round-trip mid-run', () => {
    let r = startTournament(autoDraft(createRun('classic', 'json')), 'J');
    r = playOne(playOne(r));
    r = beginUserVeto(r);
    const copy = parseRun(JSON.parse(JSON.stringify(r)));
    expect(copy).toEqual(r);
    const finish = (x: RunState) => {
      let y = x;
      while (y.phase === 'tournament') y = playOne(y);
      return JSON.stringify(y);
    };
    expect(finish(copy!)).toBe(finish(r));
  });
});

describe('user veto', () => {
  it('resolves opponent turns automatically and only lets the user act on their turn', () => {
    const r = beginUserVeto(startTournament(autoDraft(createRun('classic', 'veto')), 'V'));
    const { side, match } = userPendingMatch(r)!;
    const turn = nextTurn(r.veto!.state)!;
    expect(turn.team).toBe(side);
    expect(r.veto!.state.firstTeam).toBe(0);
    expect(r.veto!.state.bestOf).toBe(match.bestOf);
    expect(() => applyUserVeto(r, 'Nowhere')).toThrow();
    const after = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
    const next = nextTurn(after.veto!.state);
    expect(next === null || next.team === side).toBe(true);
    expect(beginUserVeto(after)).toBe(after);
  });

  it('refuses to play before the veto is complete', () => {
    const r = beginUserVeto(startTournament(autoDraft(createRun('ultimate', 'veto2')), 'V'));
    expect(() => playUserMatch(r)).toThrow(/veto/);
  });

  it('scouting reveals more with a better coach', () => {
    const r = startTournament(autoDraft(createRun('classic', 'scout')), 'S');
    const opp = r.tournament!.entrants.find((e) => e.id !== USER_ID)!.id;
    const { level, hints } = vetoScouting(r, opp);
    expect(hints.length).toBe(level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 2 : 7);
  });
});

describe('selectors', () => {
  it('standings, bracket and share text', () => {
    const r = fullRun('classic', 'sel');
    const table = standings(r);
    expect(table).toHaveLength(16);
    expect(table.filter((s) => s.isUser)).toHaveLength(1);
    const cells = bracket(r);
    expect(cells).toHaveLength(PLAYOFF_BRACKET.length);
    expect(cells.every((c) => c.match?.result)).toBe(true);
    const text = shareText(r);
    expect(text).toMatch(/^Road to Champions /);
    for (const e of r.tournament!.entrants) expect(text).not.toContain(e.name);
  });

  it('parseRun discards corrupted saves', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun({})).toBeNull();
    expect(parseRun({ version: 2 })).toBeNull();
    const r = startTournament(autoDraft(createRun('classic', 'p')), 'P');
    expect(parseRun({ ...r, opponents: ['nope-nope'], tournament: { ...r.tournament!, entrants: [{ id: 'nope-nope', name: 'x', seed: 1 }] } })).toBeNull();
    expect(parseRun({ ...r, draft: { ...r.draft, picks: [...r.draft.picks.slice(0, 4), { cardId: 'gone', slot: 'flex' }] } })).toBeNull();
  });
});

describe('explainStrength', () => {
  it('explains composition with the same penalties as the engine', () => {
    for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      const lineup = draftedLineup(autoDraft(createRun('classic', seed)));
      // Force some gaps: put everyone in flex/duelist to trigger penalties.
      const odd = { ...lineup, players: lineup.players.map((p, i) => ({ ...p, slot: i < 2 ? p.slot : ('flex' as const) })) };
      for (const l of [lineup, odd]) {
        const { breakdown, parts } = explainStrength(l);
        const missing = (Object.keys(MISSING_ROLE_PENALTY) as (keyof typeof MISSING_ROLE_PENALTY)[]).filter(
          (role) => !l.players.some((p) => p.slot === role),
        );
        expect(0 - missing.reduce((s, role) => s + MISSING_ROLE_PENALTY[role], 0)).toBe(breakdown.composition + 0);
        expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(teamStrength(l).total);
      }
    }
  });

  it('labels role fit', () => {
    expect(fitLabel('duelist', 'duelist')).toBe('100%');
    expect(fitLabel('duelist', 'flex')).toBe('90% flex');
    expect(fitLabel('duelist', 'sentinel')).toBe('75% fora da função');
    expect(roleFit('duelist', 'sentinel')).toBe(0.75);
  });
});
