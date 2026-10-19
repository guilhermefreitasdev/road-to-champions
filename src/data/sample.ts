/**
 * FICTIONAL example data, used only until the real pipeline (VLR + Liquipedia) exists.
 * Do not put real players here with invented numbers.
 */
import { createRng, hashSeed } from '../engine/rng';
import { rosterKey, rosterToLineup } from '../engine/roster';
import type { Attributes, Card, Lineup, MapName, Role, RosterEntry, Slot } from '../engine/types';

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

// ---------------------------------------------------------------------------
// Fictional roster pool for the draft roulette and the 16-team Champions.
// Every team, player, coach and event below is invented. The same playerId can appear at several
// events with a different OVR: that is the core idea of a card (strong and weak versions of a player).
// ---------------------------------------------------------------------------

/** Fictional events. */
const EVENTS = {
  l21: { id: 'liga-exemplo-2021', name: 'Liga Exemplo 2021', year: 2021 },
  m22: { id: 'masters-exemplo-2022', name: 'Masters Exemplo 2022', year: 2022 },
  c22: { id: 'champions-exemplo-2022', name: 'Champions Exemplo 2022', year: 2022 },
  m23: { id: 'masters-exemplo-2023', name: 'Masters Exemplo 2023', year: 2023 },
  c23: { id: 'champions-exemplo-2023', name: 'Champions Exemplo 2023', year: 2023 },
  m24: { id: 'masters-exemplo-2024', name: 'Masters Exemplo 2024', year: 2024 },
  c24: { id: 'champions-exemplo-2024', name: 'Champions Exemplo 2024', year: 2024 },
  m25: { id: 'masters-exemplo-2025', name: 'Masters Exemplo 2025', year: 2025 },
  c25: { id: 'champions-exemplo-2025', name: 'Champions Exemplo 2025', year: 2025 },
} as const;
type EventKey = keyof typeof EVENTS;

/** Fictional teams, with their map comfort (strength points, -3..3) used for every roster of the team. */
const TEAMS: Record<string, { name: string; maps: Partial<Record<MapName, number>> }> = {
  aurora: { name: 'Aurora', maps: { Ascent: 2, Haven: 1, Icebox: -1 } },
  tempestade: { name: 'Tempestade', maps: { Bind: 2, Split: 1, Lotus: -2 } },
  caravela: { name: 'Caravela', maps: { Lotus: 3, Sunset: 1, Bind: -1 } },
  quasar: { name: 'Quasar', maps: { Icebox: 2, Haven: 2, Split: -1 } },
  jaguar: { name: 'Jaguares', maps: { Split: 2, Ascent: -1 } },
  mare: { name: 'Maré Alta', maps: { Sunset: 2, Icebox: -2 } },
  ferro: { name: 'Ferro Velho', maps: { Bind: 1, Haven: -1 } },
  cometa: { name: 'Cometa', maps: { Haven: 3, Lotus: 1, Bind: -2 } },
  lince: { name: 'Lince', maps: { Ascent: 1, Sunset: 1, Split: -1 } },
  farol: { name: 'Farol', maps: { Icebox: 2, Ascent: -1 } },
  raio: { name: 'Raio Norte', maps: { Split: 1, Lotus: 1, Sunset: -1 } },
  orvalho: { name: 'Orvalho', maps: { Bind: 2, Icebox: -1 } },
  bruma: { name: 'Bruma', maps: { Lotus: 2, Ascent: 1, Haven: -1 } },
  vortice: { name: 'Vórtice', maps: { Split: 3, Haven: 1, Icebox: -2 } },
  cardume: { name: 'Cardume', maps: { Sunset: 1, Bind: -1 } },
  mandacaru: { name: 'Mandacaru', maps: { Bind: 2, Lotus: -1 } },
  pampa: { name: 'Pampa', maps: { Icebox: 1, Haven: 1, Split: -2 } },
  serra: { name: 'Serra Azul', maps: { Ascent: 1, Sunset: -1 } },
  eclipse: { name: 'Eclipse', maps: { Ascent: 2, Lotus: 2, Bind: 1, Split: -1 } },
  garoa: { name: 'Garoa', maps: { Haven: 1, Icebox: -1 } },
  tucano: { name: 'Tucano', maps: { Sunset: 1, Ascent: -2 } },
};

/** Player nationality, by playerId (handle = playerId). Default: BR. */
const COUNTRY: Record<string, string> = {
  navalha: 'PT', bussola: 'PT', fado: 'PT', ancora: 'PT', gaivota: 'PT', maresia: 'PT',
  onca: 'AR', arara: 'AR', minuano: 'UY', tropeiro: 'UY', pealo: 'AR',
  penumbra: 'CL', corona: 'CL', ocaso: 'AR', pico: 'CL', granito: 'CL',
};

const ROLE_AGENTS: Record<Role, string[]> = {
  duelist: ['Jett', 'Raze', 'Reyna', 'Neon', 'Phoenix', 'Yoru', 'Iso'],
  initiator: ['Sova', 'Fade', 'Skye', 'Breach', 'KAY/O', 'Gekko'],
  controller: ['Omen', 'Viper', 'Brimstone', 'Astra', 'Harbor', 'Clove'],
  sentinel: ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock'],
};

/** Attribute offsets from OVR per role (leadership is absolute), so attributes match the role. */
const ROLE_PROFILE: Record<Role, Attributes> = {
  duelist: { aim: 4, entry: 7, utility: -24, clutch: -6, consistency: -8, leadership: 25 },
  initiator: { aim: -3, entry: -12, utility: 5, clutch: -10, consistency: 1, leadership: 45 },
  controller: { aim: -8, entry: -30, utility: 7, clutch: -2, consistency: 2, leadership: 55 },
  sentinel: { aim: -4, entry: -35, utility: -1, clutch: 4, consistency: 4, leadership: 40 },
};

const ROLE_CODE = { D: 'duelist', I: 'initiator', C: 'controller', S: 'sentinel' } as const;
const IGL = true;

/** [playerId, role, ovr, isIGL?] */
type PlayerDef = [string, keyof typeof ROLE_CODE, number, boolean?];
/** [coach slug, name, vetoBonus, tacticBonus] */
type CoachDef = [string, string, number, number];

interface RosterDef {
  team: keyof typeof TEAMS;
  event: EventKey;
  players: PlayerDef[];
  coach: CoachDef;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Deterministic attributes and agents for one fictional card (stable: derived only from the card id). */
function sampleCard(def: PlayerDef, teamId: string, eventId: string): Card {
  const [playerId, code, ovr, isIGL = false] = def;
  const role = ROLE_CODE[code];
  const id = `${playerId}@${teamId}-${eventId}`;
  const rng = createRng(id);
  const jitter = (): number => rng.int(-3, 3);
  const p = ROLE_PROFILE[role];
  const agentPool = ROLE_AGENTS[role];
  const first = hashSeed(playerId) % agentPool.length;
  return {
    id,
    playerId,
    handle: playerId,
    country: COUNTRY[playerId] ?? 'BR',
    teamId,
    eventId,
    role,
    isIGL,
    agents: [agentPool[first]!, agentPool[(first + 1 + (hashSeed(`${playerId}:2`) % (agentPool.length - 1))) % agentPool.length]!],
    attrs: {
      aim: clamp(ovr + p.aim + jitter() - (isIGL ? 3 : 0)),
      entry: clamp(ovr + p.entry + jitter()),
      utility: clamp(ovr + p.utility + jitter()),
      clutch: clamp(ovr + p.clutch + jitter()),
      consistency: clamp(ovr + p.consistency + jitter()),
      leadership: clamp(isIGL ? 78 + (ovr - 70) / 2 + jitter() : p.leadership + jitter() * 3),
    },
    ovr,
  };
}

// Tiers (average OVR): elite ≥ 88, mid 77–87, weak ≤ 76.
const ROSTER_DEFS: RosterDef[] = [
  // --- Liga Exemplo 2021 ---
  { team: 'vortice', event: 'l21', coach: ['rafa-giro', 'Rafa Giro', 2, 2],
    players: [['ciclone', 'D', 85], ['espiral', 'I', 82], ['funil', 'C', 83, IGL], ['eixo', 'S', 81], ['falcao', 'D', 79]] },
  { team: 'tempestade', event: 'l21', coach: ['dona-lena', 'Dona Lena', 1, 2],
    players: [['trovao', 'D', 81], ['faisca', 'D', 79], ['radar', 'I', 77], ['sombra', 'S', 76, IGL], ['vulto', 'C', 75]] },
  { team: 'jaguar', event: 'l21', coach: ['beto-selva', 'Beto Selva', 1, 1],
    players: [['onca', 'D', 74], ['pintado', 'I', 71], ['cipo', 'C', 72, IGL], ['tronco', 'S', 70], ['arara', 'D', 69]] },
  { team: 'ferro', event: 'l21', coach: ['seu-ze', 'Seu Zé', 0, 0],
    players: [['bigorna', 'D', 71], ['ferrugem', 'I', 68], ['fuligem', 'C', 69], ['prego', 'S', 67, IGL], ['malho', 'D', 68]] },

  // --- Masters Exemplo 2022 ---
  { team: 'vortice', event: 'm22', coach: ['rafa-giro', 'Rafa Giro', 3, 3],
    players: [['ciclone', 'D', 91], ['espiral', 'I', 88], ['funil', 'C', 89, IGL], ['eixo', 'S', 87], ['tufao', 'I', 86]] },
  { team: 'aurora', event: 'm22', coach: ['rui-mestre', 'Rui Mestre', 2, 2],
    players: [['falcao', 'D', 86], ['brisa', 'I', 83], ['nevoa', 'C', 85, IGL], ['muralha', 'S', 82], ['coringa', 'I', 81]] },
  { team: 'cometa', event: 'm22', coach: ['tia-estela', 'Tia Estela', 2, 2],
    players: [['rastro', 'D', 84], ['poeira', 'I', 82], ['halo', 'C', 83, IGL], ['cauda', 'S', 81], ['lume', 'D', 80]] },

  // --- Champions Exemplo 2022 ---
  { team: 'aurora', event: 'c22', coach: ['rui-mestre', 'Rui Mestre', 2, 3],
    players: [['falcao', 'D', 93], ['brisa', 'I', 90], ['nevoa', 'C', 89, IGL], ['muralha', 'S', 88], ['coringa', 'I', 87]] },
  { team: 'jaguar', event: 'c22', coach: ['beto-selva', 'Beto Selva', 1, 2],
    players: [['onca', 'D', 82], ['pintado', 'I', 80], ['cipo', 'C', 79, IGL], ['tronco', 'S', 78], ['capivara', 'S', 79]] },
  { team: 'raio', event: 'c22', coach: ['davi-norte', 'Davi Norte', 1, 1],
    players: [['centelha', 'D', 80], ['granizo', 'I', 78], ['nimbo', 'C', 79, IGL], ['pararaio', 'S', 77], ['chuvisco', 'D', 76]] },
  { team: 'serra', event: 'c22', coach: ['lu-serrana', 'Lu Serrana', 1, 1],
    players: [['pico', 'D', 78], ['trilha', 'I', 76], ['cume', 'C', 77], ['mirante', 'S', 75, IGL], ['granito', 'S', 74]] },

  // --- Masters Exemplo 2023 ---
  { team: 'caravela', event: 'm23', coach: ['mister-to', 'Mister Tó', 3, 2],
    players: [['navalha', 'D', 91], ['bussola', 'I', 89], ['fado', 'C', 90, IGL], ['ancora', 'S', 88], ['gaivota', 'D', 87]] },
  { team: 'pampa', event: 'm23', coach: ['tio-bage', 'Tio Bagé', 1, 2],
    players: [['minuano', 'D', 81], ['cuia', 'I', 79], ['coxilha', 'C', 80, IGL], ['tropeiro', 'S', 78], ['pealo', 'D', 77]] },
  { team: 'farol', event: 'm23', coach: ['vo-marta', 'Vó Marta', 1, 1],
    players: [['lanterna', 'D', 77], ['pavio', 'I', 75], ['candeia', 'C', 76, IGL], ['rochedo', 'S', 74], ['maresia', 'I', 73]] },

  // --- Champions Exemplo 2023 ---
  { team: 'cometa', event: 'c23', coach: ['tia-estela', 'Tia Estela', 2, 3],
    players: [['rastro', 'D', 90], ['poeira', 'I', 88], ['halo', 'C', 89, IGL], ['cauda', 'S', 87], ['lume', 'D', 86]] },
  { team: 'tempestade', event: 'c23', coach: ['dona-lena', 'Dona Lena', 1, 3],
    players: [['trovao', 'D', 87], ['faisca', 'D', 85], ['radar', 'I', 86], ['sombra', 'S', 84, IGL], ['garra', 'C', 85]] },
  { team: 'mare', event: 'c23', coach: ['capita-iara', 'Capitã Iara', 2, 1],
    players: [['onda', 'D', 83], ['coral', 'I', 81], ['espuma', 'C', 82], ['recife', 'S', 80, IGL], ['salina', 'I', 78]] },
  { team: 'cardume', event: 'c23', coach: ['pescador-tiao', 'Pescador Tião', 1, 0],
    players: [['sardinha', 'D', 76], ['anzol', 'I', 74], ['rede', 'C', 75, IGL], ['boia', 'S', 73], ['isca', 'I', 72]] },

  // --- Masters Exemplo 2024 ---
  { team: 'bruma', event: 'm24', coach: ['mestre-kaio', 'Mestre Kaio', 2, 2],
    players: [['vapor', 'D', 85], ['eco', 'I', 83], ['fumaca', 'C', 84, IGL], ['vigia', 'S', 82], ['pique', 'D', 81]] },
  { team: 'orvalho', event: 'm24', coach: ['ana-rocha', 'Ana Rocha', 2, 1],
    players: [['sereno', 'D', 82], ['gota', 'I', 80], ['neblina', 'C', 81, IGL], ['geada', 'S', 79], ['rocio', 'S', 78]] },
  { team: 'ferro', event: 'm24', coach: ['seu-ze', 'Seu Zé', 0, 1],
    players: [['bigorna', 'D', 75], ['ferrugem', 'I', 72], ['fuligem', 'C', 73], ['prego', 'S', 72, IGL], ['rebite', 'I', 70]] },

  // --- Champions Exemplo 2024 ---
  { team: 'quasar', event: 'c24', coach: ['prof-vega', 'Prof. Vega', 2, 3],
    players: [['trovao', 'D', 93], ['pulsar', 'I', 91], ['nebula', 'C', 90], ['orbita', 'S', 89, IGL], ['astro', 'D', 90]] },
  { team: 'caravela', event: 'c24', coach: ['mister-to', 'Mister Tó', 3, 1],
    players: [['navalha', 'D', 85], ['bussola', 'I', 82], ['fado', 'C', 83, IGL], ['ancora', 'S', 80], ['maresia', 'I', 79]] },
  { team: 'lince', event: 'c24', coach: ['leo-lince', 'Léo Lince', 2, 2],
    players: [['felino', 'D', 85], ['bigode', 'I', 83], ['garra', 'C', 84], ['espreita', 'S', 82, IGL], ['pata', 'I', 81]] },
  { team: 'mandacaru', event: 'c24', coach: ['mestre-bento', 'Mestre Bento', 1, 1],
    players: [['espinho', 'D', 73], ['sertao', 'I', 71], ['cacto', 'C', 72, IGL], ['caatinga', 'S', 70], ['juazeiro', 'S', 69]] },

  // --- Masters Exemplo 2025 ---
  { team: 'quasar', event: 'm25', coach: ['prof-vega', 'Prof. Vega', 2, 3],
    players: [['trovao', 'D', 88], ['pulsar', 'I', 89], ['nebula', 'C', 88], ['orbita', 'S', 86, IGL], ['zenite', 'I', 85]] },
  { team: 'garoa', event: 'm25', coach: ['paulo-cinza', 'Paulo Cinza', 1, 1],
    players: [['chuvisco', 'D', 80], ['neblina', 'C', 79, IGL], ['capuz', 'I', 77], ['calcada', 'S', 76], ['goteira', 'I', 75]] },
  { team: 'tucano', event: 'm25', coach: ['seu-tuca', 'Seu Tuca', 0, 1],
    players: [['bico', 'D', 72], ['pena', 'I', 70], ['cipoal', 'C', 71], ['galho', 'S', 69, IGL], ['ninho', 'C', 68]] },

  // --- Champions Exemplo 2025 ---
  { team: 'eclipse', event: 'c25', coach: ['doutora-sol', 'Doutora Sol', 3, 3],
    players: [['falcao', 'D', 92], ['penumbra', 'I', 92], ['umbra', 'C', 91, IGL], ['corona', 'S', 90], ['ocaso', 'D', 89]] },
  { team: 'bruma', event: 'c25', coach: ['mestre-kaio', 'Mestre Kaio', 2, 3],
    players: [['vapor', 'D', 89], ['eco', 'I', 87], ['fumaca', 'C', 88, IGL], ['vigia', 'S', 86], ['miragem', 'I', 85]] },
  { team: 'aurora', event: 'c25', coach: ['rui-mestre', 'Rui Mestre', 2, 2],
    players: [['brisa', 'I', 82], ['nevoa', 'C', 83, IGL], ['muralha', 'S', 79], ['pique', 'D', 78], ['tatu', 'C', 77]] },
  { team: 'farol', event: 'c25', coach: ['vo-marta', 'Vó Marta', 1, 2],
    players: [['lanterna', 'D', 83], ['pavio', 'I', 81], ['candeia', 'C', 82, IGL], ['rochedo', 'S', 80], ['coringa', 'I', 79]] },
];

function buildRoster(def: RosterDef): RosterEntry {
  const event = EVENTS[def.event];
  const team = TEAMS[def.team]!;
  const [slug, name, vetoBonus, tacticBonus] = def.coach;
  return {
    teamId: def.team,
    teamName: team.name,
    eventId: event.id,
    eventName: event.name,
    year: event.year,
    cards: def.players.map((p) => sampleCard(p, def.team, event.id)),
    coach: { id: `${slug}@${def.team}-${event.id}`, name, teamId: def.team, eventId: event.id, vetoBonus, tacticBonus },
  };
}

/** Fictional roster pool: what the draft roulette rolls and where tournament opponents come from. */
export const SAMPLE_ROSTERS: RosterEntry[] = ROSTER_DEFS.map(buildRoster);

/** Map comfort per roster, keyed by `${teamId}-${eventId}` (see rosterKey). Values in [-3, 3]. */
export const SAMPLE_MAP_AFFINITY: Record<string, Partial<Record<MapName, number>>> = Object.fromEntries(
  ROSTER_DEFS.map((def) => [`${def.team}-${EVENTS[def.event].id}`, { ...TEAMS[def.team]!.maps }]),
);

/** AI lineup for a sample roster, carrying its map affinity. */
export function sampleLineup(entry: RosterEntry): Lineup {
  return rosterToLineup(entry, SAMPLE_MAP_AFFINITY[rosterKey(entry)]);
}
