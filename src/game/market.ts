/**
 * Free-agency prices and money (Complete Trials), pure functions of a card: kept apart from season.ts so the
 * pt-BR explanations (explain.ts) can use them. season.ts re-exports everything. docs/design.md, "Mercado".
 */
import type { Card } from '../engine/types';

/** Price of an OVR-80 card, in US$ thousand (the game's currency). */
export const MARKET_PRICE_BASE = 100;
/** OVR points that double the price: 84 → 200, 88 → 400, 92 → 800; 76 → 50. */
export const MARKET_PRICE_DOUBLING = 4;
/** Price premium for the facts the strength already rewards: aura (title/top-3 history) and being the IGL. */
export const MARKET_AURA_PREMIUM: Record<string, number> = { goat: 0.3, legend: 0.2, star: 0.1, rising: 0 };
export const MARKET_IGL_PREMIUM = 0.15;
export const MARKET_MIN_PRICE = 10;
/** Money the club starts the season with (spent only in the windows). */
export const MARKET_START_BUDGET = 200;
/** Share of a released player's value credited to the budget. */
export const MARKET_SALE_SHARE = 0.5;
export const MARKET_MAX_SIGNINGS = 2;
/** Offers per window, by tier: stars (OVR ≥ the region's p90), mid (p50–p90), value (< p50; one IGL when any). */
export const MARKET_TIERS = { star: 2, mid: 5, value: 4 } as const;
/** Prize money by the league's final place (only the top 3 reach a window). */
export const LEAGUE_PRIZE: Record<number, number> = { 1: 400, 2: 300, 3: 200 };
/** Prize money by the Masters' final place (rank 5 = 5º–6º, 7 = 7º–8º). */
export const MASTERS_PRIZE: Record<number, number> = { 1: 600, 2: 450, 3: 350, 4: 300, 5: 200, 7: 150 };

export const round5 = (n: number): number => Math.round(n / 5) * 5;

/** Market price of a card: MARKET_PRICE_BASE × 2^((OVR − 80) / 4), × aura and IGL premiums, rounded to 5. */
export function playerValue(card: Card): number {
  const premium = 1 + (card.aura ? MARKET_AURA_PREMIUM[card.aura] ?? 0 : 0) + (card.isIGL ? MARKET_IGL_PREMIUM : 0);
  return Math.max(MARKET_MIN_PRICE, round5(MARKET_PRICE_BASE * 2 ** ((card.ovr - 80) / MARKET_PRICE_DOUBLING) * premium));
}

/** What releasing a card credits: MARKET_SALE_SHARE of its value. */
export function saleValue(card: Card): number {
  return round5(playerValue(card) * MARKET_SALE_SHARE);
}

