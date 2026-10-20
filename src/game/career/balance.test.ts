/**
 * Career balance, measured with the greedy manager (autopilot.ts) over 5-season careers.
 *
 *   CAREER_REPORT=1 CAREER_N=40 npx vitest run src/game/career/balance --silent=false
 *
 * prints, per difficulty and season: Masters / Champions reached, league / Masters / Champions titles, cash (median),
 * reputation, strength, bankruptcies; then the OVR trajectories of young players and veterans and the league's AI
 * strength by season. `CAREER_DIFF=normal` limits the difficulties; `CAREER_RESERVE=-300` makes the manager use the
 * credit line (bankruptcy risk). Without CAREER_REPORT a small run checks that the loop holds over 3 seasons.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Difficulty } from '../difficulty';
import { teamStrength } from '../../engine/team';
import { advanceToNextSeason, createCareer, lineupOf, type CareerState } from './career';
import { autoSeason } from './autopilot';
import { CAREER_START_YEAR, PLAYERS, currentTeamsOf, experience, sceneShift, worldOvr } from './world';
import { REGIONS } from '../../engine/types';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.CAREER_REPORT === '1';
const N = Number(env.CAREER_N ?? 20);
const SEASONS = Number(env.CAREER_SEASONS ?? 5);
const RESERVE = Number(env.CAREER_RESERVE ?? 0);
const DIFFS: readonly Difficulty[] = env.CAREER_DIFF ? [env.CAREER_DIFF as Difficulty] : DIFFICULTIES;

interface SeasonRow {
  masters: number;
  champions: number;
  league1: number;
  masters1: number;
  champions1: number;
  anyTitle: number;
  money: number[];
  rep: number[];
  strength: number[];
  bankrupt: number;
  played: number;
  aiStrength: number[];
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function runCareer(seed: string, difficulty: Difficulty, region = REGIONS[Number.parseInt(seed.slice(-2), 36) % 4]!): CareerState[] {
  let c = createCareer({ name: 'Bal', region, difficulty, seed });
  const out: CareerState[] = [];
  for (let s = 0; s < SEASONS; s++) {
    c = autoSeason(c, { reserve: RESERVE });
    out.push(c);
    if (c.phase !== 'report') break;
    c = advanceToNextSeason(c);
  }
  return out;
}

describe('career balance', () => {
  it('a greedy manager runs 3 seasons without breaking the invariants', () => {
    const seasons = runCareer('bal-smoke-0', 'normal', 'emea').slice(0, 3);
    expect(seasons.length).toBeGreaterThanOrEqual(2);
    for (const c of seasons) {
      expect(['report', 'over']).toContain(c.phase);
      const last = c.history[c.history.length - 1]!;
      expect(last.league).not.toBeNull();
      expect(c.players.filter((p) => p.status === 'starter').length).toBeLessThanOrEqual(5);
      expect(c.players.filter((p) => p.status !== 'academy').length).toBeLessThanOrEqual(7);
    }
  });

  it.runIf(REPORT)('report', () => {
    const lines: string[] = [];
    for (const diff of DIFFS) {
      const rows: SeasonRow[] = Array.from({ length: SEASONS }, () => ({ masters: 0, champions: 0, league1: 0, masters1: 0, champions1: 0, anyTitle: 0, money: [], rep: [], strength: [], bankrupt: 0, played: 0, aiStrength: [] }));
      let firstTitle: number[] = [];
      for (let i = 0; i < N; i++) {
        const careers = runCareer(`bal-${diff}-${i.toString(36).padStart(2, '0')}`, diff);
        let titled = -1;
        careers.forEach((c, s) => {
          const h = c.history[c.history.length - 1]!;
          const r = rows[s]!;
          r.played++;
          if (h.masters) r.masters++;
          if (h.champions) r.champions++;
          if (h.league?.rank === 1) r.league1++;
          if (h.masters?.rank === 1) r.masters1++;
          if (h.champions?.rank === 1) r.champions1++;
          if (h.titles.length > 0) {
            r.anyTitle++;
            if (titled < 0) titled = s + 1;
          }
          r.money.push(c.money);
          r.rep.push(c.reputation);
          r.strength.push(h.strength);
          if (h.bankrupt) r.bankrupt++;
          r.aiStrength.push(mean(c.aiTeams.map((t) => teamStrength(lineupOf(c, t.id, 'league')).total)));
        });
        if (titled > 0) firstTitle = [...firstTitle, titled];
      }
      lines.push(`\n${diff} (n=${N}, reserve ${RESERVE})`);
      lines.push('T | Masters | Champions | Liga 1º | Masters 1º | Champ 1º | algum título | caixa p50 | rep p50 | força p50 | IA liga | falências');
      rows.forEach((r, s) => {
        lines.push(
          `${s + 1} | ${pct(r.masters, r.played)} | ${pct(r.champions, r.played)} | ${pct(r.league1, r.played)} | ${pct(r.masters1, r.played)} | ${pct(r.champions1, r.played)} | ${pct(r.anyTitle, r.played)} | ${median(r.money)} | ${median(r.rep)} | ${median(r.strength).toFixed(1)} | ${mean(r.aiStrength).toFixed(1)} | ${r.bankrupt}/${r.played}`,
        );
      });
      lines.push(`primeiro título (temporada): ${firstTitle.length ? `${firstTitle.length}/${N} carreiras, mediana T${median(firstTitle)}` : 'nenhum'}`);
    }
    // OVR trajectories of the world's players (same aging as everyone), by experience at the start.
    const seed = 'bal-traj';
    const groups: Record<string, { label: string; test: (exp: number, prodigy: boolean) => boolean; deltas: number[][] }> = {
      prodigy: { label: 'prodígios jovens (≤ 1)', test: (e, p) => e <= 1 && p, deltas: [] },
      young: { label: 'jovens (≤ 1)', test: (e, p) => e <= 1 && !p, deltas: [] },
      prime: { label: 'auge (4–5)', test: (e) => e >= 4 && e <= 5, deltas: [] },
      veteran: { label: 'veteranos (≥ 5 em 2021)', test: (e) => e >= 5, deltas: [] },
    };
    const players = new Set(REGIONS.flatMap((r) => currentTeamsOf(r).flatMap((e) => e.cards.map((c) => `${c.playerId}|${c.ovr}`))));
    for (const key of players) {
      const [id, ovr] = key.split('|') as [string, string];
      const exp = experience(id, CAREER_START_YEAR);
      for (const g of Object.values(groups)) {
        if (!g.test(exp, PLAYERS.get(id)!.prodigy)) continue;
        const start = Number(ovr);
        g.deltas.push(Array.from({ length: SEASONS + 1 }, (_, k) => worldOvr(seed, id, start, CAREER_START_YEAR + k) - start));
      }
    }
    lines.push(`\nNível da cena (correção por ano): ${Array.from({ length: SEASONS }, (_, k) => sceneShift(seed, CAREER_START_YEAR + k + 1)).join(', ')}`);
    lines.push('OVR médio vs 2026 (jogadores dos elencos atuais, com a correção), por temporada:');
    for (const g of Object.values(groups)) {
      const avg = Array.from({ length: SEASONS + 1 }, (_, k) => mean(g.deltas.map((d) => d[k]!)).toFixed(1));
      lines.push(`${g.label} (n=${g.deltas.length}): ${avg.join(' → ')}`);
    }
    console.log(lines.join('\n'));
  }, 3_600_000);
});
