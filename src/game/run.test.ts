import { describe, expect, it } from 'vitest';
import { SLOTS, openSlots } from '../engine/draft';
import { roleFit, teamStrength } from '../engine/team';
import { PLAYOFF_BRACKET } from '../engine/tournament';
import { isVetoComplete, nextTurn, remainingMaps } from '../engine/veto';
import { MISSING_ROLE_PENALTY, explainStrength, fitLabel, formatStat, placementLabel } from './explain';
import {
  FIELD_ELITE_CAP,
  OPPONENT_COUNT,
  RUN_MAP_POOL,
  RUN_POOL,
  RUN_VERSION,
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  bracket,
  cleanTeamName,
  entrantTeam,
  groupViews,
  coachOptions,
  createRun,
  draftOptions,
  draftedLineup,
  involvesUser,
  lineupOf,
  isEliteRoster,
  parseRun,
  pickField,
  pickDraftCoach,
  pickDraftPlayer,
  playUserMatch,
  rollDraft,
  rolledRoster,
  rosterOf,
  runSummary,
  shareText,
  standings,
  startTournament,
  teamInfo,
  userFinish,
  userPendingMatch,
  userGroup,
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

describe('real pool', () => {
  it('plays on the real rosters and the 7-map pool', () => {
    expect(RUN_POOL.length).toBeGreaterThanOrEqual(240);
    expect(RUN_MAP_POOL).toHaveLength(7);
    const r = rollDraft(createRun('classic', 'real'));
    const roster = rolledRoster(r)!;
    expect(roster.cards).toHaveLength(5);
    expect(roster.cards.every((c) => c.stats && c.stats.rounds >= 30)).toBe(true);
    expect(rosterOf(roster.teamId, roster.eventId)).toBe(roster);
  });

  it('builds a field of 15 distinct teams with at most FIELD_ELITE_CAP elite rosters, avoiding the user', () => {
    const userPlayers = RUN_POOL[0]!.cards.map((c) => c.playerId);
    let elites = 0;
    for (let i = 0; i < 40; i++) {
      const keys = pickField(`field-${i}`, userPlayers);
      expect(keys).toHaveLength(OPPONENT_COUNT);
      const entries = keys.map((k) => RUN_POOL.find((e) => `${e.teamId}-${e.eventId}` === k)!);
      expect(new Set(entries.map((e) => e.teamId)).size).toBe(OPPONENT_COUNT);
      const n = entries.filter(isEliteRoster).length;
      expect(n).toBeLessThanOrEqual(FIELD_ELITE_CAP);
      elites += n;
      for (const e of entries) expect(e.cards.some((c) => userPlayers.includes(c.playerId))).toBe(false);
      expect(pickField(`field-${i}`, userPlayers)).toEqual(keys);
    }
    // The cap trims the field, it does not empty it of favourites.
    expect(elites / 40).toBeGreaterThan(1);
  });
});

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
  it('standings, groups, bracket and share text', () => {
    const r = fullRun('classic', 'sel');
    const table = standings(r);
    expect(table).toHaveLength(16);
    expect(table.filter((s) => s.isUser)).toHaveLength(1);
    const views = groupViews(r);
    expect(views.map((v) => v.group).sort()).toEqual(['A', 'B', 'C', 'D']);
    // The user's group comes first.
    expect(views[0]!.hasUser).toBe(true);
    expect(views[0]!.group).toBe(userGroup(r));
    for (const v of views) {
      expect(v.cells).toHaveLength(5);
      expect(v.cells.every((c) => c.match?.result)).toBe(true);
      expect(v.rows.map((row) => row.place)).toEqual([1, 2, 3, 4]);
    }
    const cells = bracket(r);
    expect(cells).toHaveLength(PLAYOFF_BRACKET.length);
    expect(cells.every((c) => c.match?.result)).toBe(true);
    const text = shareText(r);
    expect(text).toMatch(/^Road to Champions /);
    expect(text).toMatch(/\nGrupos \d-\d /);
    for (const e of r.tournament!.entrants) expect(text).not.toContain(e.name);
    const opp = r.opponents![0]!;
    const team = entrantTeam(r, opp);
    expect(`${team.teamId}-${team.eventId}`).toBe(opp);
    expect(entrantTeam(r, USER_ID).teamId).toBe(USER_ID);
  });

  it('parseRun discards corrupted saves', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun({})).toBeNull();
    expect(parseRun({ version: RUN_VERSION })).toBeNull();
    // Saves from the fictional pool (v1) and from the Swiss format (v2) are discarded.
    const v1 = autoDraft(createRun('classic', 'old'));
    expect(parseRun(v1)).not.toBeNull();
    expect(parseRun({ ...v1, version: 1 })).toBeNull();
    expect(parseRun({ ...v1, version: 2 })).toBeNull();
    const r = startTournament(autoDraft(createRun('classic', 'p')), 'P');
    // A Swiss-era tournament (no groups) is discarded even under the current run version.
    const swissEra: Record<string, unknown> = { ...r.tournament!, version: 1 };
    delete swissEra.groups;
    expect(parseRun({ ...r, tournament: swissEra })).toBeNull();
    expect(parseRun({ ...r, opponents: ['nope-nope'], tournament: { ...r.tournament!, entrants: [{ id: 'nope-nope', name: 'x', seed: 1 }] } })).toBeNull();
    expect(parseRun({ ...r, draft: { ...r.draft, picks: [...r.draft.picks.slice(0, 4), { cardId: 'gone', slot: 'flex' }] } })).toBeNull();
    // A tournament without its match list would crash the hub.
    const noMatches: Record<string, unknown> = { ...r.tournament! };
    delete noMatches.matches;
    expect(parseRun({ ...r, tournament: noMatches })).toBeNull();
    // Naming the team needs the full lineup.
    const team = autoDraft(createRun('classic', 'p2'));
    expect(parseRun(team)).not.toBeNull();
    expect(parseRun({ ...team, draft: { ...team.draft, picks: team.draft.picks.slice(0, 4) } })).toBeNull();
    expect(parseRun({ ...team, draft: { ...team.draft, phase: 'coach' } })).toBeNull();
  });

  it('places group eliminations by group place', () => {
    const seen = new Map<number, string>();
    for (let i = 0; i < 80 && seen.size < 2; i++) {
      const r = fullRun(i % 2 ? 'classic' : 'ultimate', `groups-out-${i}`);
      const rec = userRecord(r);
      if (rec.groups.status !== 'eliminated') continue;
      const finish = userFinish(r)!;
      seen.set(rec.groups.place!, finish.place);
      expect(rec.groups.losses).toBe(2);
      expect(rec.groups.wins).toBe(rec.groups.place === 3 ? 1 : 0);
      expect(finish.label).toBe(`Eliminado no Grupo ${rec.groups.group} (${rec.groups.wins}-2)`);
      // Eliminated in the groups: no playoff match.
      expect(rec.results.every((x) => x.match.stage === 'groups')).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(0);
    const expected: Record<number, string> = { 3: '9º–12º', 4: '13º–16º' };
    for (const [place, label] of seen) expect(label).toBe(expected[place]);
  });

  it('maps every finish to the furthest stage reached', () => {
    const expected: Record<string, string> = {
      '1º': 'champion',
      '2º': 'final',
      '3º': 'top4',
      '4º': 'top4',
      '5º–6º': 'playoffs',
      '7º–8º': 'playoffs',
      '9º–12º': 'groups',
      '13º–16º': 'groups',
    };
    const stages = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const finish = userFinish(fullRun(i % 2 ? 'classic' : 'ultimate', `stage-${i}`))!;
      expect(finish.stage).toBe(expected[finish.place]);
      expect(finish.champion).toBe(finish.stage === 'champion');
      stages.add(finish.stage);
    }
    expect(stages.size).toBeGreaterThan(1);
  });
});

describe('explainStrength', () => {
  it('explains composition with the same penalties as the engine', () => {
    for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      const lineup = draftedLineup(autoDraft(createRun('classic', seed)));
      // Force some gaps: put everyone in flex/duelist to trigger penalties.
      const odd = { ...lineup, players: lineup.players.map((p, i) => ({ ...p, slot: i < 2 ? p.slot : ('flex' as const) })) };
      for (const l of [lineup, odd]) {
        const { breakdown, parts, dimensions } = explainStrength(l);
        const missing = (Object.keys(MISSING_ROLE_PENALTY) as (keyof typeof MISSING_ROLE_PENALTY)[]).filter(
          (role) => !l.players.some((p) => p.slot === role),
        );
        expect(0 - missing.reduce((s, role) => s + MISSING_ROLE_PENALTY[role], 0)).toBe(breakdown.composition + 0);
        expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(teamStrength(l).total);
        expect(dimensions.map((d) => d.key)).toEqual(['mechanics', 'utility', 'decision', 'communication', 'clutch']);
        for (const d of dimensions) {
          expect(d.level).toBe(breakdown.dimensions[d.key]);
          expect(d.value).toBe(breakdown.points[d.key]);
          expect(d.notes.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('formats placements and stats in pt-BR', () => {
    expect(placementLabel('1st')).toBe('1º');
    expect(placementLabel('3rd–4th')).toBe('3º–4º');
    expect(placementLabel('17th–32nd')).toBe('17º–32º');
    expect(formatStat(1.2, 2)).toBe('1,20');
    expect(formatStat(null)).toBe('—');
  });

  it('does not penalise an opponent whose IGL is unknown', () => {
    const r = startTournament(autoDraft(createRun('classic', 'igl')), 'I');
    const unknown = r.opponents!.map((id) => lineupOf(r, id)).find((l) => l.iglKnown === false);
    if (unknown) {
      expect(teamStrength(unknown).igl).toBe('unknown');
      const { dimensions, warnings } = explainStrength(unknown);
      expect(dimensions.find((d) => d.key === 'decision')!.notes[0]).toMatch(/não consta/);
      expect(warnings.some((w) => w.startsWith('Sem IGL'))).toBe(false);
    }
  });

  it('spells out what a missing IGL costs, and names the IGL when there is one', () => {
    const lineup = draftedLineup(autoDraft(createRun('classic', 'igl-explain')));
    const noIgl = { ...lineup, players: lineup.players.map((p) => ({ ...p, card: { ...p.card, isIGL: false } })) };
    const without = explainStrength(noIgl);
    expect(without.breakdown.igl).toBe('none');
    expect(without.warnings.some((w) => /^Sem IGL: Tomada de decisão −25% \(máx\. 55\) — força ≈ −/.test(w))).toBe(true);
    expect(without.dimensions.find((d) => d.key === 'decision')!.level).toBeLessThanOrEqual(55);
    const igl = lineup.players.find((p) => p.card.isIGL);
    if (igl) {
      const withIgl = explainStrength(lineup);
      expect(withIgl.dimensions.find((d) => d.key === 'decision')!.notes[0]).toContain(`IGL: ${igl.card.handle}`);
      expect(withIgl.dimensions.find((d) => d.key === 'decision')!.notes[0]).toMatch(/fonte: /);
      expect(withIgl.breakdown.total).toBeGreaterThan(without.breakdown.total);
    }
    if (lineup.coach) {
      expect(without.dimensions.find((d) => d.key === 'decision')!.notes.join(' ')).toContain('coach cobre parte da tática');
    }
  });

  it('labels role fit', () => {
    expect(fitLabel('duelist', 'duelist')).toBe('100%');
    expect(fitLabel('duelist', 'flex')).toBe('90% flex');
    expect(fitLabel('duelist', 'sentinel')).toBe('75% fora da função');
    expect(roleFit('duelist', 'sentinel')).toBe(0.75);
  });
});
