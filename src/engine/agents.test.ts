import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_CARDS, SAMPLE_TEMPESTADE } from '../data/sample';
import {
  AGENT_EDGE_MAX,
  AGENT_TEAM_CAP,
  agentEdge,
  agentFactor,
  agentTeamPoints,
  pickAgents,
} from './agents';
import { strengthShares } from './form';
import { simulateMap } from './match';
import { createRng } from './rng';
import { simulateSeries } from './series';
import type { AgentStat, Card, Lineup } from './types';

const stat = (agent: string, maps: number, rating: number | null): AgentStat => ({ agent, maps, rating, acs: null, kd: null });
const withPool = (card: Card, agentPool: AgentStat[]): Card => ({ ...card, agentPool });
const ROLES = { Jett: 'duelist', Raze: 'duelist', Sova: 'initiator', Fade: 'initiator', Omen: 'controller', Viper: 'controller', Killjoy: 'sentinel', Cypher: 'sentinel', Skye: 'initiator', Breach: 'initiator' } as const;

/** Aurora with real-looking pools on two players. */
const POOLED: Lineup = {
  ...SAMPLE_AURORA,
  players: SAMPLE_AURORA.players.map((p) =>
    p.card.id === SAMPLE_CARDS.falcao.id
      ? { ...p, card: withPool(p.card, [stat('Jett', 120, 1.25), stat('Raze', 40, 1.0), stat('Omen', 3, 0.7)]) }
      : p.card.id === SAMPLE_CARDS.nevoa.id
        ? { ...p, card: withPool(p.card, [stat('Omen', 60, 1.0), stat('Viper', 50, 1.05)]) }
        : p,
  ),
};

describe('pickAgents', () => {
  it('is deterministic and never repeats an agent inside a team', () => {
    for (let i = 0; i < 200; i++) {
      const a = pickAgents(POOLED.players, `seed-${i}`);
      expect(pickAgents(POOLED.players, `seed-${i}`)).toEqual(a);
      const picked = a.filter((x): x is string => !!x);
      expect(new Set(picked).size).toBe(picked.length);
    }
  });

  it('falls back to the agents of the event when the card has no pool', () => {
    const picks = pickAgents(SAMPLE_TEMPESTADE.players, 'fallback');
    SAMPLE_TEMPESTADE.players.forEach((p, i) => expect(p.card.agents).toContain(picks[i]));
  });

  it('weights the pool by maps played (the 120-map Jett is picked most)', () => {
    const count: Record<string, number> = {};
    for (let i = 0; i < 600; i++) {
      const agent = pickAgents([POOLED.players[0]!], `w-${i}`)[0]!;
      count[agent] = (count[agent] ?? 0) + 1;
    }
    expect(count.Jett!).toBeGreaterThan(count.Raze!);
    expect(count.Raze!).toBeGreaterThan(count.Omen ?? 0);
  });

  it('nudges the pick toward the map meta', () => {
    const viper = (meta?: Record<string, number>) => {
      let n = 0;
      for (let i = 0; i < 800; i++) if (pickAgents([POOLED.players[2]!], `m-${i}`, meta)[0] === 'Viper') n++;
      return n;
    };
    expect(viper({ Viper: 20 })).toBeGreaterThan(viper());
  });

  it("prefers agents of the slot's role when the pool has them", () => {
    // falcao (duelist) in the controller slot plays his Omen.
    const asController = { ...POOLED.players[0]!, slot: 'controller' as const };
    for (let i = 0; i < 50; i++) expect(pickAgents([asController], `r-${i}`, undefined, ROLES)[0]).toBe('Omen');
  });

  it('gives undefined to a player with no agent at all', () => {
    const empty = { ...POOLED.players[1]!, card: { ...POOLED.players[1]!.card, agents: [] } };
    expect(pickAgents([empty], 'none')).toEqual([undefined]);
  });
});

describe('agentEdge', () => {
  const card = withPool(SAMPLE_CARDS.falcao, [stat('Jett', 120, 1.25), stat('Raze', 40, 1.0), stat('Omen', 3, 0.7)]);

  it('is 0 without a pool, an unknown agent or a rating', () => {
    expect(agentEdge(SAMPLE_CARDS.falcao, 'Jett')).toBe(0);
    expect(agentEdge(card, 'Sage')).toBe(0);
    expect(agentEdge(card, undefined)).toBe(0);
    expect(agentEdge(withPool(SAMPLE_CARDS.falcao, [stat('Jett', 50, null)]), 'Jett')).toBe(0);
    // A one-agent pool is the player's own average: no edge.
    expect(agentEdge(withPool(SAMPLE_CARDS.falcao, [stat('Jett', 200, 1.4)]), 'Jett')).toBe(0);
  });

  it('shrinks by the sample: a 3-map outlier barely moves', () => {
    expect(agentEdge(card, 'Jett')).toBeGreaterThan(0);
    expect(agentEdge(card, 'Raze')).toBeLessThan(0);
    // Omen is 0.5 under the average but on 3 maps: ×3/33 → ≈ −2.7 × … bounded and small.
    expect(Math.abs(agentEdge(card, 'Omen'))).toBeLessThan(Math.abs(0.5 * 60));
    const big = withPool(SAMPLE_CARDS.falcao, [stat('Jett', 10, 1.5), stat('Raze', 300, 1.0)]);
    const small = withPool(SAMPLE_CARDS.falcao, [stat('Jett', 1, 1.5), stat('Raze', 300, 1.0)]);
    expect(Math.abs(agentEdge(small, 'Jett'))).toBeLessThan(Math.abs(agentEdge(big, 'Jett')));
  });

  it(`is bounded to ±${AGENT_EDGE_MAX} OVR and the team term to ±${AGENT_TEAM_CAP}`, () => {
    const extreme = withPool(SAMPLE_CARDS.falcao, [stat('Jett', 500, 2.5), stat('Raze', 500, 0.5)]);
    expect(agentEdge(extreme, 'Jett')).toBe(AGENT_EDGE_MAX);
    expect(agentEdge(extreme, 'Raze')).toBe(-AGENT_EDGE_MAX);
    expect(agentTeamPoints([2, 2, 2, 2, 2], [0.2, 0.2, 0.2, 0.2, 0.2])).toBe(AGENT_TEAM_CAP);
    expect(agentTeamPoints([-2, -2, -2, -2, -2], [0.2, 0.2, 0.2, 0.2, 0.2])).toBe(-AGENT_TEAM_CAP);
    expect(agentTeamPoints([1, 0, 0, 0, 0], strengthShares(SAMPLE_AURORA.players))).toBeCloseTo(0.21, 1);
    expect(agentFactor(0)).toBe(1);
    expect(agentFactor(AGENT_EDGE_MAX)).toBeLessThan(1.04);
  });
});

describe('agents in the map simulation', () => {
  it('records the agent of every player and the edge, deterministically', () => {
    const r = simulateMap(POOLED, SAMPLE_TEMPESTADE, createRng('ag'), { map: 'Haven', formSeed: 'm1' });
    for (const line of [...r.players[0], ...r.players[1]]) expect(line.agent).toBeTruthy();
    expect(r).toEqual(simulateMap(POOLED, SAMPLE_TEMPESTADE, createRng('ag'), { map: 'Haven', formSeed: 'm1' }));
    expect(Math.abs(r.edges[0].agent)).toBeLessThanOrEqual(AGENT_TEAM_CAP);
    expect(r.edges[1].agent).toBe(0);
    const falcao = r.players[0].find((l) => l.cardId === SAMPLE_CARDS.falcao.id)!;
    expect(falcao.agentEdge ?? 0).toBe(agentEdge(POOLED.players[0]!.card, falcao.agent));
  });

  it('without pools the rounds are exactly what they were without agents', () => {
    const noAgents = (l: Lineup): Lineup => ({ ...l, players: l.players.map((p) => ({ ...p, card: { ...p.card, agents: [] } })) });
    for (let i = 0; i < 20; i++) {
      const a = simulateMap(SAMPLE_AURORA, SAMPLE_TEMPESTADE, createRng(i), { map: 'Lotus' });
      const b = simulateMap(noAgents(SAMPLE_AURORA), noAgents(SAMPLE_TEMPESTADE), createRng(i), { map: 'Lotus' });
      expect(a.rounds).toEqual(b.rounds);
      expect(a.edges[0].agent).toBe(0);
      expect(b.players[0][0]!.agent).toBeUndefined();
    }
  });

  it('a strong agent edge gives the player more kills over many maps', () => {
    const boosted: Lineup = {
      ...SAMPLE_AURORA,
      players: SAMPLE_AURORA.players.map((p, i) =>
        i === 0 ? { ...p, card: { ...withPool(p.card, [stat('Jett', 500, 2.5), stat('Raze', 1, 0.5)]), agents: ['Jett'] } } : p,
      ),
    };
    let base = 0;
    let more = 0;
    for (let i = 0; i < 150; i++) {
      base += simulateMap(SAMPLE_AURORA, SAMPLE_TEMPESTADE, createRng(`k${i}`), { map: 'Ascent' }).players[0][0]!.kills;
      more += simulateMap(boosted, SAMPLE_TEMPESTADE, createRng(`k${i}`), { map: 'Ascent' }).players[0][0]!.kills;
    }
    expect(more).toBeGreaterThan(base);
  });

  it('series pass the agent roles down to every map', () => {
    const s = simulateSeries(POOLED, SAMPLE_TEMPESTADE, createRng('ser'), {
      bestOf: 3,
      pool: ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset', 'Abyss'],
      formSeed: 'ser',
      agentRoles: ROLES,
    });
    for (const m of s.maps) {
      const agents = m.players[0].map((l) => l.agent).filter(Boolean);
      expect(new Set(agents).size).toBe(agents.length);
    }
  });
});
