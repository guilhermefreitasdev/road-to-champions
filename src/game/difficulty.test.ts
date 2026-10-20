import { describe, expect, it } from 'vitest';
import { openSlots } from '../engine/draft';
import { rosterKey } from '../engine/roster';
import { isVetoComplete, remainingMaps } from '../engine/veto';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  DIFFICULTY_SETTINGS,
  aiAdjust,
  difficultyBlurb,
  scoutingLevel,
} from './difficulty';
import { CAREER_DIFFICULTY } from './career/constants';
import { formatMoney } from './explain';
import {
  USER_ID,
  applyUserVeto,
  beginUserVeto,
  coachOptions,
  createRun,
  draftOptions,
  isEliteRoster,
  parseRun,
  pickDraftCoach,
  pickDraftPlayer,
  pickField,
  playUserMatch,
  rollDraft,
  RUN_POOL,
  startTournament,
  teamInfo,
  userPendingMatch,
  vetoScouting,
  type RunState,
} from './run';
import { chooseRegion, createSeason, parseSeason } from './season';

function autoDraft(run: RunState): RunState {
  let r = run;
  while (r.phase === 'draft' && r.draft.phase !== 'coach') {
    if (r.draft.phase === 'roll') r = rollDraft(r);
    const [card] = draftOptions(r);
    const open = openSlots(r.draft);
    r = pickDraftPlayer(r, card!.id, open.includes(card!.role) ? card!.role : open.includes('flex') ? 'flex' : open[0]!);
  }
  return pickDraftCoach(r, coachOptions(r)[0]!.id);
}

describe('difficulty settings', () => {
  it('has four levels in order, with pt-BR names and a blurb each', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard', 'legend']);
    expect(DIFFICULTIES.map((d) => DIFFICULTY_LABELS[d].name)).toEqual(['Fácil', 'Normal', 'Difícil', 'Lendário']);
    for (const d of DIFFICULTIES) expect(DIFFICULTY_LABELS[d].blurb).toMatch(/reroll/);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('describes the career with its own levers, never the run ones', () => {
    for (const d of DIFFICULTIES) {
      const text = difficultyBlurb(d, 'career');
      expect(difficultyBlurb(d)).toBe(DIFFICULTY_LABELS[d].blurb);
      expect(text).not.toMatch(/reroll|favorito|Champions/i);
      expect(text).toContain(formatMoney(CAREER_DIFFICULTY[d].money));
      expect(text).toContain(`reputação ${CAREER_DIFFICULTY[d].reputation}`);
      expect(text).toMatch(/scrims/);
    }
    // A player asks (OVR − 83) × 5 reputation: Normal starts at 20 → up to OVR 87.
    expect(difficultyBlurb('normal', 'career')).toContain('até OVR 87');
    expect(difficultyBlurb('legend', 'career')).toContain('até OVR 83');
  });

  it('gets harder on every lever, level by level', () => {
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      const a = DIFFICULTY_SETTINGS[DIFFICULTIES[i - 1]!];
      const b = DIFFICULTY_SETTINGS[DIFFICULTIES[i]!];
      expect(b.aiBonus).toBeGreaterThan(a.aiBonus);
      expect(b.rerolls).toBeLessThan(a.rerolls);
      expect(b.eliteMin).toBeGreaterThanOrEqual(a.eliteMin);
      expect(b.eliteCap).toBeGreaterThanOrEqual(a.eliteCap);
      expect(b.vetoNoise).toBeLessThanOrEqual(a.vetoNoise);
    }
    expect(DIFFICULTY_SETTINGS.legend.scouting).toBeNull();
  });

  it('gives the AI bonus only to the side facing the user', () => {
    const bonus = DIFFICULTY_SETTINGS.hard.aiBonus;
    expect(aiAdjust(USER_ID, 'x', USER_ID, 'hard')).toEqual([0, bonus]);
    expect(aiAdjust('x', USER_ID, USER_ID, 'hard')).toEqual([bonus, 0]);
    expect(aiAdjust('x', 'y', USER_ID, 'hard')).toBeUndefined();
    expect(scoutingLevel(3, 'legend')).toBe(0);
    expect(scoutingLevel(0, 'easy')).toBe(1);
    expect(scoutingLevel(3, 'easy')).toBe(3);
    expect(scoutingLevel(1, 'hard')).toBe(0);
  });
});

describe('difficulty in the main mode', () => {
  it('sets the rerolls and is stored in the run (default normal)', () => {
    expect(createRun('classic', 'd').difficulty).toBe('normal');
    for (const d of DIFFICULTIES) {
      const r = createRun('classic', 'd', d);
      expect(r.difficulty).toBe(d);
      expect(r.draft.rerollsLeft).toBe(DIFFICULTY_SETTINGS[d].rerolls);
      expect(createRun('ultimate', 'd', d).draft.rerollsLeft).toBe(0);
    }
    expect(() => createRun('classic', 'd', 'insane' as never)).toThrow(/difficulty/);
  });

  it('builds fields within each level’s elite floor and cap', () => {
    const user = autoDraft(createRun('classic', 'field'));
    const players = user.draft.picks.map((p) => p.cardId);
    for (const d of DIFFICULTIES) {
      const { eliteMin, eliteCap } = DIFFICULTY_SETTINGS[d];
      for (let i = 0; i < 10; i++) {
        const keys = pickField(`fd-${d}-${i}`, players, d);
        expect(keys).toHaveLength(15);
        const n = keys.map((k) => RUN_POOL.find((e) => rosterKey(e) === k)!).filter(isEliteRoster).length;
        expect(n).toBeGreaterThanOrEqual(Math.min(eliteMin, 15));
        expect(n).toBeLessThanOrEqual(eliteCap);
      }
    }
  });

  it('shows the AI bonus in the opponents’ strength and hides scouting on Lendário', () => {
    const base = startTournament(autoDraft(createRun('classic', 'bonus', 'normal')), 'N');
    const legend = startTournament(autoDraft(createRun('classic', 'bonus', 'legend')), 'L');
    const opp = userPendingMatch(legend)!.match;
    const id = opp.a === USER_ID ? opp.b : opp.a;
    const plain = teamInfo({ ...legend, difficulty: 'normal' }, id).strength;
    expect(teamInfo(legend, id).strength).toBeCloseTo(plain + DIFFICULTY_SETTINGS.legend.aiBonus - DIFFICULTY_SETTINGS.normal.aiBonus, 6);
    expect(teamInfo(legend, USER_ID).strength).toBeCloseTo(teamInfo({ ...legend, difficulty: 'normal' }, USER_ID).strength, 6);
    expect(vetoScouting(legend, id).hints).toEqual([]);
    expect(base.difficulty).toBe('normal');
  });

  it('plays deterministically and round-trips saves; rejects a save without a valid difficulty', () => {
    const play = () => {
      let r = startTournament(autoDraft(createRun('classic', 'det', 'hard')), 'H');
      r = beginUserVeto(r);
      while (!isVetoComplete(r.veto!.state)) r = applyUserVeto(r, remainingMaps(r.veto!.state)[0]!);
      return playUserMatch(r);
    };
    const a = play();
    expect(JSON.stringify(play())).toBe(JSON.stringify(a));
    expect(parseRun(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(parseRun({ ...a, difficulty: 'x' })).toBeNull();
    const old: Record<string, unknown> = { ...a };
    delete old.boxScores;
    expect(parseRun(old)).toBeNull();
  });
});

describe('difficulty in Complete Trials', () => {
  it('accepts createSeason(seed, difficulty, field) and the older createSeason(seed, field)', () => {
    expect(createSeason('s').difficulty).toBe('normal');
    expect(createSeason('s', 'legend')).toMatchObject({ difficulty: 'legend', field: 'current' });
    expect(createSeason('s', 'prime')).toMatchObject({ difficulty: 'normal', field: 'prime' });
    expect(createSeason('s', 'hard', 'prime')).toMatchObject({ difficulty: 'hard', field: 'prime' });
    expect(() => createSeason('s', 'x' as never)).toThrow();
    const s = chooseRegion(createSeason('s', 'easy'), 'emea');
    expect(s.draft!.rerollsLeft).toBe(DIFFICULTY_SETTINGS.easy.rerolls);
    expect(parseSeason(s)).toEqual(s);
    expect(parseSeason({ ...s, difficulty: undefined })).toBeNull();
  });
});
