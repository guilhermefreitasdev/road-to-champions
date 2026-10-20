import { playerMedia } from '../../data/media';
import type { Card } from '../../engine/types';
import { MODE_LABELS, RUN_POOL, type RunState } from '../../game/run';
import { REGION_LABELS, STAGE_LABELS, isCompStage, type SeasonState } from '../../game/season';
import { DifficultyBadge } from '../components/Difficulty';
import { Icon } from '../components/Icon';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { difficultyOf } from '../difficulty';

/** The parts of the home page that need the card pool or the saves; the game passes them to ./Home.tsx once loaded. */

/** Players fanned on the Draft clássico card (first card of each with a photo; any missing one is skipped). */
const FEATURED = ['aspas', 'Derke', 'TenZ', 'Demon1', 'yay', 'Less'];

export function featuredCards(): Card[] {
  const out: Card[] = [];
  for (const handle of FEATURED) {
    if (out.length === 3) break;
    for (const entry of RUN_POOL) {
      const card = entry.cards.find((c) => c.handle === handle && playerMedia(c.playerId, c.eventId));
      if (card) {
        out.push(card);
        break;
      }
    }
  }
  return out;
}

/** Three real player photos fanned like a drafted hand. */
export function FanArt({ cards }: { cards: Card[] }) {
  return (
    <span className="fan">
      {cards.map((c, i) => (
        <span key={c.id} className={`fan-card fan-${i}`}>
          <PlayerPhoto playerId={c.playerId} eventId={c.eventId} handle={c.handle} country={c.country} size={72} />
          <span className="fan-ovr">{c.ovr}</span>
        </span>
      ))}
    </span>
  );
}

/** "Continuar" cards of the saved run and season. */
export function ContinueCards({
  saved,
  savedSeason,
  onContinue,
  onContinueSeason,
}: {
  saved: RunState | null;
  savedSeason: SeasonState | null;
  onContinue: () => void;
  onContinueSeason: () => void;
}) {
  return (
    <>
      {saved && (
        <button type="button" className="continue-card" onClick={onContinue}>
          <Icon name="play" className="continue-icon" />
          <span className="continue-text">
            <strong>{MODE_LABELS[saved.mode]}</strong>
            <span className="small muted">
              {saved.teamName ? `${saved.teamName} · ` : ''}
              {phaseText(saved)}
            </span>
            <DifficultyBadge difficulty={difficultyOf(saved)} />
          </span>
          <span className="continue-go">Continuar run</span>
        </button>
      )}
      {savedSeason && (
        <button type="button" className="continue-card" onClick={onContinueSeason}>
          <Icon name="play" className="continue-icon" />
          <span className="continue-text">
            <strong>Complete Trials{savedSeason.region ? ` · ${REGION_LABELS[savedSeason.region]}` : ''}</strong>
            <span className="small muted">
              {savedSeason.teamName ? `${savedSeason.teamName} · ` : ''}
              {seasonText(savedSeason)}
            </span>
            <DifficultyBadge difficulty={difficultyOf(savedSeason)} />
          </span>
          <span className="continue-go">Continuar temporada</span>
        </button>
      )}
    </>
  );
}

function phaseText(run: RunState): string {
  switch (run.phase) {
    case 'draft':
      return `draft, pick ${Math.min(run.draft.picks.length + 1, 5)}/5`;
    case 'team':
      return 'time pronto';
    case 'tournament':
      return 'Champions em andamento';
    case 'done':
      return 'Champions encerrado';
  }
}

function seasonText(s: SeasonState): string {
  if (s.stage === 'region') return 'escolha do servidor';
  if (s.stage === 'draft') return `draft, pick ${Math.min((s.draft?.picks.length ?? 0) + 1, 5)}/5`;
  if (s.stage === 'team') return 'time pronto';
  if (s.stage === 'market') return 'janela de transferências';
  if (isCompStage(s.stage)) return `${STAGE_LABELS[s.stage]} em andamento`;
  return 'temporada encerrada';
}
