/**
 * FICTIONAL example data, used only until the real pipeline (VLR + Liquipedia) exists.
 * Do not put real players here with invented numbers.
 */
import type { Attributes, Card, Lineup, Role, Slot } from '../engine/types';

function card(
  handle: string,
  teamId: string,
  role: Role,
  ovr: number,
  attrs: Attributes,
  opts: { isIGL?: boolean; agents?: string[] } = {},
): Card {
  return {
    id: `${handle}@${teamId}-sample`,
    playerId: handle,
    handle,
    country: 'BR',
    teamId,
    eventId: 'sample',
    role,
    isIGL: opts.isIGL ?? false,
    agents: opts.agents ?? [],
    attrs,
    ovr,
  };
}

const attrs = (aim: number, entry: number, utility: number, clutch: number, consistency: number, leadership: number): Attributes => ({
  aim,
  entry,
  utility,
  clutch,
  consistency,
  leadership,
});

export const SAMPLE_CARDS = {
  falcao: card('falcao', 'aurora', 'duelist', 88, attrs(92, 90, 55, 75, 80, 30), { agents: ['Jett', 'Raze'] }),
  brisa: card('brisa', 'aurora', 'initiator', 84, attrs(80, 70, 88, 70, 85, 50), { agents: ['Sova', 'Fade'] }),
  nevoa: card('nevoa', 'aurora', 'controller', 83, attrs(74, 50, 90, 80, 86, 88), { isIGL: true, agents: ['Omen', 'Viper'] }),
  muralha: card('muralha', 'aurora', 'sentinel', 82, attrs(78, 45, 82, 85, 88, 40), { agents: ['Killjoy', 'Cypher'] }),
  coringa: card('coringa', 'aurora', 'initiator', 81, attrs(82, 72, 78, 70, 78, 35), { agents: ['Skye', 'Breach'] }),

  trovao: card('trovao', 'tempestade', 'duelist', 80, attrs(84, 82, 50, 65, 70, 25), { agents: ['Raze', 'Neon'] }),
  faisca: card('faisca', 'tempestade', 'duelist', 78, attrs(82, 80, 48, 60, 68, 20), { agents: ['Jett', 'Reyna'] }),
  radar: card('radar', 'tempestade', 'initiator', 77, attrs(72, 65, 80, 62, 75, 45), { agents: ['Sova', 'KAY/O'] }),
  sombra: card('sombra', 'tempestade', 'sentinel', 76, attrs(70, 45, 75, 70, 80, 70), { isIGL: true, agents: ['Cypher', 'Sage'] }),
  vulto: card('vulto', 'tempestade', 'sentinel', 75, attrs(72, 48, 72, 68, 74, 30), { agents: ['Killjoy', 'Chamber'] }),
};

const lineup = (name: string, players: [Card, Slot][]): Lineup => ({
  name,
  players: players.map(([c, slot]) => ({ card: c, slot })),
});

const c = SAMPLE_CARDS;

/** Balanced lineup with an IGL and a controller. */
export const SAMPLE_AURORA = lineup('Aurora', [
  [c.falcao, 'duelist'],
  [c.brisa, 'initiator'],
  [c.nevoa, 'controller'],
  [c.muralha, 'sentinel'],
  [c.coringa, 'flex'],
]);

/** Weaker lineup with no controller. */
export const SAMPLE_TEMPESTADE = lineup('Tempestade', [
  [c.trovao, 'duelist'],
  [c.faisca, 'flex'],
  [c.radar, 'initiator'],
  [c.sombra, 'sentinel'],
  [c.vulto, 'flex'],
]);
