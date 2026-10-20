/**
 * Career mode ("Modo Carreira", docs/design.md) — public API for the UI.
 *
 * State: `CareerState` (plain JSON, never mutated, deterministic from `seed` + actions; versioned by CAREER_VERSION;
 * save with `serializeCareer` / `deserializeCareer` from src/game/persist.ts). Money is in US$ thousand.
 *
 * Season loop (`state.phase`):
 *   'offseason'  → contracts, market, sponsors, academy, coach, training focus, scrims; `startStage` starts the league
 *   'league'     → the org's matches (veto + play), AI matches run on their own
 *   'midseason'  → transfer window (≤ 2 signings), scrims; `startStage` builds the Masters
 *   'masters'    → (only when the org qualified: league top 3) — the Masters plays out on its own otherwise
 *   'champions'  → (only when qualified: league top 4) — idem
 *   'report'     → season report (`seasonReport`); `advanceToNextSeason` ages everyone and opens the next off-season
 *   'over'       → bankruptcy (cash ≤ −1000, or in the red at two season ends in a row)
 *
 * Creation
 *   createCareer({ name, tag?, region, difficulty?, seed })            first off-season, no players yet
 * Off-season / windows (throw an Error with a pt-BR message when not allowed; the *Block selectors say why first)
 *   signPlayer(c, playerId, years?)        buyout / free agent / import from `marketOffers`
 *   releasePlayer(c, playerId)             sell (50% of value while under contract)
 *   renewContract(c, playerId, years?)     last-year or expired contracts, off-season only
 *   signProspect(c, playerId)              academy (3 slots, cheap); promoteAcademy(c, playerId)
 *   hireCoach(c, coachId) / releaseCoach(c)  acceptSponsor(c, offerId) / dropSponsor(c, offerId)
 *   setStarter(c, playerId, slot)          benchPlayer(c, playerId)   autoLineup(c)   setTrainingFocus(c, playerId, on)
 *   playScrim(c, opponentId, map?)         MD1, report via scrimReport; never touches standings
 *   startStage(c)                          offseason → league, midseason → Masters/Champions (see startBlocks)
 * Matches (mirror season.ts)
 *   userPendingMatch(c) · beginUserVeto(c) · applyUserVeto(c, map) · playUserMatch(c)
 *   careerVetoScouting(c, opponentId) · careerMapFamiliarity(c, teamId) · findCareerMatch(c, key) (userSeries keys)
 * Season end
 *   seasonReport(c) · advanceToNextSeason(c) · careerHistory(c) · careerShareText(c)
 * Selectors
 *   careerSummary · careerFinances · careerRoster · rosterLimits · careerLineup · careerStrength · careerCoach
 *   marketOffers · signingPreview · signingBlock · prospectOffers · coachOffers · sponsorsView · renewalBlock
 *   leagueTeams · careerTeamInfo · careerEntrantTeam · careerLeagueViews · careerLeaguePlayoffCells
 *   careerMastersCells · careerChampionsGroupViews · careerChampionsBracket · careerStageOutcome · careerUserResults
 *   careerAllPlayerStats(c, stage?) · careerPlayerStats · seasonRanking · scrimInfo · scrimReport · scrimOpponents
 * Auto (the balance test's greedy manager; usable as "auto" buttons)
 *   autoOffseason · autoMidseason · autoPlayMatch · autoSeason
 */
export * from './constants';
export {
  CAREER_MAP_POOL,
  CAREER_PHASE_TEXT,
  CAREER_STAGES,
  CAREER_STAGE_LABELS,
  LEAGUE_AI_TEAMS,
  LEDGER_LABELS,
  OFFER_KIND_LABELS,
  USER_ID,
  acceptSponsor,
  advanceToNextSeason,
  aiTeamOf,
  applyUserVeto,
  autoLineup,
  beginUserVeto,
  benchPlayer,
  careerFormSeed,
  careerPlayerValue,
  careerVetoLineup,
  cleanTag,
  coachReputation,
  coachSalary,
  createCareer,
  dropSponsor,
  findCareerMatch,
  formStage,
  freeAgentOvr,
  freeAgentPool,
  hireCoach,
  isFreeAgent,
  lineupOf,
  moraleShift,
  nameOf,
  offerTerms,
  parseCareer,
  payroll,
  playScrim,
  playUserMatch,
  playerCard,
  promoteAcademy,
  releaseCoach,
  releasePlayer,
  renewContract,
  renewalBlock,
  renewalSalary,
  requiredReputation,
  salaryFor,
  saleCredit,
  scrimOpponents,
  scrimStage,
  scrimsLeft,
  seriesKey,
  setStarter,
  setTrainingFocus,
  signPlayer,
  signProspect,
  signingBlock,
  sponsorBase,
  sponsorSlots,
  sponsorTier,
  stageMatches,
  startBlocks,
  startStage,
  starters,
  strengthOf,
  userPendingMatch,
  userPlacement,
  type AiPlayer,
  type AiTeam,
  type Award,
  type CareerCoach,
  type CareerMatch,
  type CareerOrg,
  type CareerPendingMatch,
  type CareerPhase,
  type CareerPlayer,
  type CareerStage,
  type CareerState,
  type CareerVeto,
  type CareerWindow,
  type Contract,
  type CreateCareerInput,
  type LedgerEntry,
  type LedgerKind,
  type OfferKind,
  type OfferRef,
  type OfferTerms,
  type Placement,
  type PlayerSeasonLine,
  type PlayerStatus,
  type Progress,
  type ScrimRecord,
  type SeasonRecord,
  type SponsorOffer,
  type SponsorResult,
} from './career';
export * from './views';
export { autoMidseason, autoOffseason, autoPlayMatch, autoSeason, type AutopilotOptions } from './autopilot';
export {
  CAREER_PHASE_LABELS,
  CAREER_START_YEAR,
  agingStep,
  careerAura,
  careerPhase,
  experience,
  playerInfo,
  potentialOf,
  worldOvr,
  type AgingPart,
  type AgingResult,
  type CareerFacts,
  type CareerPhaseLabel,
  type PlayerInfo,
} from './world';
export { serializeCareer, deserializeCareer } from '../persist';
