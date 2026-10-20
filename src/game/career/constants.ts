/**
 * Career mode numbers (docs/design.md, "Modo Carreira"). Money is in US$ thousand, like the Complete Trials
 * market (src/game/market.ts). Every number here is a design decision, calibrated with the greedy manager in
 * src/game/career/balance.test.ts (CAREER_REPORT=1); none of them is a real statistic.
 */
import type { Difficulty } from '../difficulty';
import type { Role } from '../../engine/types';

/** v1 = first career save format. Bump it (and the storage key) when old saves stop making sense. */
export const CAREER_VERSION = 1;

// --- Org and difficulty ----------------------------------------------------------------------------------------

export const ORG_TAG_MIN = 2;
export const ORG_TAG_MAX = 4;

/**
 * Career-only levers on top of difficulty.ts (AI bonus in the user's matches, veto noise and coach scouting, which
 * the career reuses as they are): money and reputation the org starts with.
 */
export interface CareerDifficulty {
  money: number;
  reputation: number;
}

export const CAREER_DIFFICULTY: Record<Difficulty, CareerDifficulty> = {
  easy: { money: 1500, reputation: 30 },
  normal: { money: 1100, reputation: 20 },
  hard: { money: 950, reputation: 12 },
  legend: { money: 650, reputation: 0 },
};

// --- Roster --------------------------------------------------------------------------------------------------

export const STARTERS = 5;
export const MAX_BENCH = 2;
export const MAX_ACADEMY = 3;
/** Players with a training focus at the same time (main roster or academy). */
export const TRAINING_FOCUS_SLOTS = 2;
/** Contract length the user can offer, in seasons (the current one included). */
export const CONTRACT_YEARS_MIN = 1;
export const CONTRACT_YEARS_MAX = 3;
export const DEFAULT_CONTRACT_YEARS = 2;

// --- Money ---------------------------------------------------------------------------------------------------

/** Salary per season = SALARY_SHARE × playerValue (market.ts), rounded to 5, at least SALARY_MIN. */
export const SALARY_SHARE = 0.25;
export const SALARY_MIN = 10;
/** Imports (free agents from another region) cost more: salary × IMPORT_SALARY. */
export const IMPORT_SALARY = 1.25;
/** Up-front fee, × playerValue: buyout of an AI team's player, signing bonus of a free agent, of an import. */
export const FEE_SHARE = { team: 1, free: 0.25, import: 0.5 } as const;
/** Share of the value credited when the org sells a player under contract (nothing for an expiring one). */
export const SALE_SHARE = 0.5;
/** Academy prospects: flat salary, no fee, contract length. */
export const ACADEMY_SALARY = 15;
export const ACADEMY_CONTRACT_YEARS = 3;
/** Coach salary per season = COACH_SALARY_BASE + COACH_SALARY_PER_POINT × (tactic + veto bonus). */
export const COACH_SALARY_BASE = 20;
export const COACH_SALARY_PER_POINT = 15;
/** Reputation a coach asks for: COACH_REP_PER_POINT × (tactic + veto bonus) − 10. */
export const COACH_REP_PER_POINT = 8;
/** Signings in the mid-season window (the off-season has no limit besides the roster). */
export const MIDSEASON_MAX_SIGNINGS = 2;
/** Mid-season signings pay this share of the season salary right away. */
export const MIDSEASON_SALARY_SHARE = 0.5;
/**
 * Credit line: the season can start with cash down to −CREDIT_LIMIT after the payroll. While a debt warning is on
 * (the last season ended in the red) there is no credit: the season needs cash ≥ 0 after the payroll.
 */
export const CREDIT_LIMIT = 300;
/** Cash at or below this at a season's end is bankruptcy right away (career over). */
export const BANKRUPTCY_FLOOR = -1000;

/** Prize money by final place (US$ thousand; rank 5 = 5º–6º etc.). The league pays every team (revenue share). */
export const CAREER_LEAGUE_PRIZE: Record<number, number> = { 1: 500, 2: 400, 3: 320, 4: 260, 5: 220, 7: 180, 9: 150, 11: 120 };
export const CAREER_MASTERS_PRIZE: Record<number, number> = { 1: 700, 2: 500, 3: 380, 4: 300, 5: 220, 7: 180 };
export const CAREER_CHAMPIONS_PRIZE: Record<number, number> = { 1: 1500, 2: 1000, 3: 700, 4: 550, 5: 400, 7: 300, 9: 220, 13: 180 };

// --- Reputation ----------------------------------------------------------------------------------------------

/** Reputation change by final place. Masters/Champions: participation + place. */
export const REP_LEAGUE: Record<number, number> = { 1: 12, 2: 10, 3: 8, 4: 6, 5: 4, 7: 2, 9: 0, 11: -2 };
export const REP_MASTERS_ENTRY = 4;
export const REP_MASTERS: Record<number, number> = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 1, 7: 0 };
export const REP_CHAMPIONS_ENTRY = 6;
export const REP_CHAMPIONS: Record<number, number> = { 1: 15, 2: 10, 3: 7, 4: 5, 5: 3, 7: 2, 9: 0, 13: 0 };
/** The season MVP (all players of the season) plays for the org. */
export const REP_SEASON_MVP = 3;
/** Every season the fans forget a little. */
export const REP_DRIFT = -1;
/** Each sponsor objective missed. */
export const REP_SPONSOR_FAIL = -2;

/**
 * Reputation a player asks for to sign: (OVR − SIGN_REP_OVR) × SIGN_REP_PER_OVR, +SIGN_REP_IMPORT for an import
 * (85 → 10, 88 → 25, 90 → 35, 92 → 45, 94 → 55).
 */
export const SIGN_REP_OVR = 83;
export const SIGN_REP_PER_OVR = 5;
export const SIGN_REP_IMPORT = 10;
/** A player refuses to renew below this morale, or when the reputation is this far below what he would ask now. */
export const RENEW_MIN_MORALE = 35;
export const RENEW_REP_SLACK = 10;

// --- Sponsors ------------------------------------------------------------------------------------------------

export type SponsorObjective = 'league-top6' | 'league-top4' | 'masters' | 'champions' | 'title' | 'top5-rating';

export const SPONSOR_OBJECTIVE_LABELS: Record<SponsorObjective, string> = {
  'league-top6': 'Playoffs da liga (top 6)',
  'league-top4': 'Top 4 da liga',
  masters: 'Chegar ao Masters',
  champions: 'Chegar ao Champions',
  title: 'Ganhar um título (liga, Masters ou Champions)',
  'top5-rating': 'Um jogador no top 5 de rating da temporada',
};

/** Bonus paid when the objective is met, × the sponsor's base pay. */
export const SPONSOR_BONUS: Record<SponsorObjective, number> = {
  'league-top6': 0.4,
  'league-top4': 0.6,
  masters: 1,
  champions: 1.5,
  title: 2,
  'top5-rating': 0.6,
};

/** Tiers by reputation: minimum reputation, base pay per season and the objectives on offer. */
export const SPONSOR_TIERS: readonly { minRep: number; base: number; objectives: readonly SponsorObjective[] }[] = [
  { minRep: 0, base: 150, objectives: ['league-top6', 'league-top4', 'top5-rating'] },
  { minRep: 25, base: 220, objectives: ['league-top4', 'masters', 'top5-rating'] },
  { minRep: 50, base: 320, objectives: ['masters', 'champions', 'top5-rating'] },
  { minRep: 75, base: 450, objectives: ['champions', 'title', 'masters'] },
];
/** Sponsor slots by reputation: 1 below 35, 2 below 65, 3 from 65. */
export const SPONSOR_SLOTS: readonly { minRep: number; slots: number }[] = [
  { minRep: 0, slots: 1 },
  { minRep: 35, slots: 2 },
  { minRep: 65, slots: 3 },
];
export const SPONSOR_OFFERS = 4;
/** Base pay varies ± this share around the tier's base. */
export const SPONSOR_SPREAD = 0.1;
/** Minimum maps for the season's rating ranking (awards, the top-5 objective). */
export const RANKING_MIN_MAPS = 8;
/** Minimum maps for an event's top-3 rating (career aura facts). */
export const EVENT_TOP3_MIN_MAPS = 4;
/** "High" event rating for the career aura facts (the sim's estimated rating, like the card facts' 1.10). */
export const EVENT_HIGH_RATING = 1.1;

/** Fictional sponsor names (never a real brand). */
export const SPONSOR_NAMES: readonly string[] = [
  'Energético Pulso',
  'Banco Vértice',
  'Teclados Órbita',
  'Fone Ressoa',
  'Cadeira Trono',
  'Lanche Turbo',
  'Rede Ágil Fibra',
  'Mouse Precisão',
  'Tênis Impulso',
  'Seguros Escudo',
  'App Carona Já',
  'Pizzaria Quadrante',
  'Monitores Nítido',
  'Café Alvorada',
  'Bebida Glacial',
  'Loja Pixel',
];

// --- Aging and progression -----------------------------------------------------------------------------------

/**
 * OVR change per season by experience (seasons since the player's first roster in the data: there are no real ages),
 * as an inclusive integer range drawn with the career seed. Young players grow, the prime is flat, veterans decline.
 */
export const AGING_CURVE: readonly { maxExp: number; min: number; max: number }[] = [
  { maxExp: 1, min: 1, max: 3 },
  { maxExp: 3, min: 0, max: 2 },
  { maxExp: 5, min: 0, max: 1 },
  { maxExp: 7, min: -1, max: 1 },
  { maxExp: 8, min: -2, max: 0 },
  { maxExp: 9, min: -3, max: -1 },
  { maxExp: Infinity, min: -4, max: -1 },
];
/** Career phases by experience (labels in the UI): young ≤ 3, prime ≤ 7, veteran after. */
export const YOUNG_MAX_EXP = 3;
export const PRIME_MAX_EXP = 7;
/** Prodigies (Card.prodigy on the player's latest card) grow one more point a season while young. */
export const PRODIGY_EXTRA = 1;
/** Training focus: +1 growth, or one point less of decline. */
export const FOCUS_BONUS = 1;
/** Academy players develop faster (Challengers minutes): +1 growth. */
export const ACADEMY_BONUS = 1;
/** Morale and big stages: ±0.5. */
export const MORALE_HIGH = 70;
export const MORALE_LOW = 40;
export const MORALE_PROGRESS = 0.5;
export const INTERNATIONAL_PROGRESS = 0.5;
/** Bounds of one season's change and of the OVR itself; decline never takes a player below AGING_FLOOR. */
export const AGING_MIN_DELTA = -5;
export const AGING_MAX_DELTA = 6;
export const OVR_MIN = 50;
export const OVR_MAX = 97;
export const AGING_FLOOR = 60;
/** Potential headroom over the player's latest card, by experience at the start of the career, + prodigy. */
export const POTENTIAL_HEADROOM: readonly { maxExp: number; min: number; max: number }[] = [
  { maxExp: 1, min: 2, max: 6 },
  { maxExp: 3, min: 1, max: 4 },
  { maxExp: 5, min: 0, max: 2 },
  { maxExp: Infinity, min: 0, max: 1 },
];
export const POTENTIAL_PRODIGY = 2;
export const POTENTIAL_MAX = 95;
/** Experience at which AI players retire and the user's players refuse a new contract. */
export const RETIRE_EXPERIENCE = 11;

// --- Morale --------------------------------------------------------------------------------------------------

export const MORALE_START = 65;
/** Effective OVR: +1 at or above MORALE_BOOST, −1 at or below MORALE_SLUMP. */
export const MORALE_BOOST = 80;
export const MORALE_SLUMP = 25;
/** After each competition stage: starters who played half the maps +4, players who barely played −6. */
export const MORALE_PLAYED = 4;
export const MORALE_BENCHED = -6;
/** Team result after the league: top 3 +4, bottom 4 −4; a title +8 for everyone. */
export const MORALE_LEAGUE_GOOD = 4;
export const MORALE_LEAGUE_BAD = -4;
export const MORALE_TITLE = 8;
/** Scrims: win +2 for the five, loss −1, the scrim's MVP +2 more. */
export const MORALE_SCRIM_WIN = 2;
export const MORALE_SCRIM_LOSS = -1;
export const MORALE_SCRIM_MVP = 2;
/** Between seasons morale moves this share of the way back to MORALE_START. */
export const MORALE_RESET = 0.5;

// --- Scrims and the AI teams ---------------------------------------------------------------------------------

/** Scrims per competition stage (the off-season counts for the league, the mid-season window for the Masters). */
export const SCRIMS_PER_STAGE = { league: 3, masters: 2, champions: 2 } as const;
/** Every off-season each AI team of the league replaces its weakest player (never the IGL) with this chance. */
export const AI_SWAP_CHANCE = 0.25;
/** OVR a free agent must add over the player he replaces in an AI swap. */
export const AI_SWAP_MIN_GAIN = 2;
/** Market offers per window: buyouts from AI teams, region free agents (per role + extra), imports. */
export const OFFSEASON_OFFERS = { team: 8, freePerRole: 3, freeExtra: 2, import: 4 } as const;
export const MIDSEASON_OFFERS = { team: 4, freePerRole: 1, freeExtra: 1, import: 2 } as const;
export const PROSPECT_OFFERS = 4;
export const COACH_OFFERS = 4;
/** A prospect has at most this much experience (seasons since debut) and this OVR (better ones go to the market). */
export const PROSPECT_MAX_EXP = 2;
export const PROSPECT_MAX_OVR = 78;

export const ROLE_ORDER: readonly Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
