import { COMP_STAGES, REGION_LABELS, STAGE_LABELS, stageOutcome, type SeasonState } from '../../game/season';
import { Icon } from './Icon';

/**
 * Region → Liga → Masters → Champions, with how far the season went (icon + text, never color alone): a passed
 * stage shows the place reached, the current one is highlighted, the rest are locked.
 */
export function TrialsPath({ season, compact }: { season: SeasonState; compact?: boolean }) {
  const current = season.stage;
  const region = REGION_LABELS[season.region ?? 'americas'];
  const items = [
    { key: 'region', label: region, state: 'passed' as const, detail: '' },
    ...COMP_STAGES.map((stage) => {
      const o = stageOutcome(season, stage);
      const champion = o.rank === 1;
      const state =
        o.status === 'pending' ? ('locked' as const)
        : stage === current || (current === 'done' && o.status !== 'done') ? ('reached' as const)
        : o.status === 'done' && (current === 'done' ? stage === lastStage(season) : false) ? ('reached' as const)
        : ('passed' as const);
      return { key: stage, label: STAGE_LABELS[stage], state, detail: champion ? 'Campeão' : o.place ?? (o.status === 'playing' ? 'em disputa' : '') };
    }),
  ];
  const reached = items.filter((i) => i.state !== 'locked').map((i) => i.label).join(' → ');
  return (
    <ol className={`stage-path trials${compact ? ' compact' : ''}`} aria-label={`Caminho da temporada: ${reached}`}>
      {items.map((i) => (
        <li key={i.key} className={`stage ${i.state}`} aria-current={i.state === 'reached' ? 'step' : undefined}>
          <span className="stage-dot" aria-hidden="true">
            {i.state === 'passed' && <Icon name="check" />}
            {i.state === 'reached' && <Icon name={i.detail === 'Campeão' ? 'trophy' : 'decider'} />}
          </span>
          <span className="stage-label">{i.label}</span>
          {i.detail && <span className="stage-detail small">{i.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/** The last stage the user entered. */
function lastStage(season: SeasonState): string {
  if (season.champions) return 'champions';
  if (season.masters) return 'masters';
  return 'league';
}
