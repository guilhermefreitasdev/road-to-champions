import { useEffect, useState } from 'react';
import {
  VETO_ORDERS,
  isVetoComplete,
  nextTurn,
  playedMaps,
  remainingMaps,
  type VetoAction,
  type VetoState,
  type VetoStep,
} from '../../engine/veto';
import type { TeamIndex } from '../../engine/types';
import { formatPoints } from '../../game/explain';
import { RUN_MAP_POOL, teamInfo, userOpponent, userPendingMatch, vetoScouting, type RunState } from '../../game/run';
import { MapSplash, mapLabel } from '../components/GameImage';
import { Icon } from '../components/Icon';

interface Props {
  run: RunState;
  onChoose: (map: string) => void;
  onPlay: () => void;
  onBack: () => void;
}

/** How long the opponent "thinks" before each of its bans/picks (and the decider) appears. */
const OPPONENT_DELAY_MS = 750;

const ACTION_LABELS: Record<VetoAction, string> = { ban: 'Ban', pick: 'Pick', decider: 'Decisivo' };
const ACTION_ICONS = { ban: 'ban', pick: 'pick', decider: 'decider' } as const;

/** Number of steps up to and including the user's last action: what the user has already "seen". */
function seenSteps(state: VetoState, side: TeamIndex): number {
  for (let i = state.steps.length - 1; i >= 0; i--) if (state.steps[i]!.team === side) return i + 1;
  return 0;
}

export function Veto({ run, onChoose, onPlay, onBack }: Props) {
  const pending = userPendingMatch(run)!;
  const veto = run.veto!.state;
  const { match, side } = pending;
  const oppId = userOpponent(match);
  const opp = teamInfo(run, oppId);

  // The engine resolves the opponent's answers at once; the UI reveals them one by one.
  const [shown, setShown] = useState(() => seenSteps(veto, side));
  const total = veto.steps.length;
  const revealing = shown < total;
  useEffect(() => {
    if (!revealing) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), OPPONENT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [revealing, shown]);

  const view: VetoState = { ...veto, steps: veto.steps.slice(0, Math.min(shown, total)) };
  const turn = nextTurn(view);
  const done = !revealing && isVetoComplete(view);
  const myTurn = !revealing && !!turn && turn.team === side;
  const available = new Set(remainingMaps(view));
  const scouting = vetoScouting(run, oppId);
  const hintOf = new Map(scouting.hints.map((h) => [h.map, h.value]));
  const stepOf = new Map(view.steps.map((s, i) => [s.map, { ...s, index: i }]));
  const playOrder = new Map(playedMaps(veto).map((p, i) => [p.map, i + 1]));
  const who = (team: TeamIndex | null) => (team === null ? '' : team === side ? 'Você' : opp.name);

  const choose = (map: string) => {
    if (!myTurn) return; // a second click while the opponent is answering does nothing
    setShown(total + 1); // the user's own step shows right away
    onChoose(map);
  };

  const order = [...VETO_ORDERS[veto.bestOf], 'decider' as const];
  const status = done
    ? 'Veto concluído.'
    : revealing || (turn && !myTurn)
      ? `${opp.name} está escolhendo…`
      : `Sua vez: ${turn!.action === 'ban' ? 'bana' : 'escolha'} um mapa.`;

  return (
    <div className="screen veto">
      <header className="screen-head">
        <h1>Veto vs {opp.name}</h1>
        <p className="context">
          {match.label} · MD{match.bestOf}
        </p>
      </header>

      <ol className="veto-steps" aria-label="Ordem do veto">
        {order.map((action, i) => {
          const step: VetoStep | undefined = view.steps[i];
          const team: TeamIndex | null =
            action === 'decider' ? null : ((i % 2 === 0 ? veto.firstTeam : 1 - veto.firstTeam) as TeamIndex);
          const current = !done && i === view.steps.length;
          const mine = team === side;
          return (
            <li
              key={i}
              className={`veto-step ${action}${step ? ' done' : ''}${current ? ' current' : ''}${mine ? ' mine' : ''}`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="veto-step-top">
                <span className={`action-chip ${action}`}>
                  <Icon name={ACTION_ICONS[action]} />
                  {ACTION_LABELS[action]}
                </span>
                {team !== null && <span className="veto-step-who">{who(team)}</span>}
              </span>
              <strong className="veto-step-map">
                {step ? mapLabel(step.map) : current ? mine ? 'Sua vez' : <ThinkingDots /> : '—'}
              </strong>
            </li>
          );
        })}
      </ol>

      <p className={`turn${myTurn ? ' mine' : ''}`} role="status" aria-live="polite">
        {!done && !myTurn && <span className="thinking-pulse" aria-hidden="true" />}
        {status}
      </p>

      <ScoutNote level={scouting.level} hints={scouting.hints} />

      <div className={`map-grid${myTurn ? ` choosing ${turn!.action}` : ''}`}>
        {RUN_MAP_POOL.map((map) => {
          const step = stepOf.get(map);
          const hint = hintOf.get(map);
          const status = step
            ? `${ACTION_LABELS[step.action]}${step.team === null ? '' : ` · ${who(step.team)}`}`
            : undefined;
          const slot = step && step.action !== 'ban' ? playOrder.get(map) : undefined;
          return (
            <button
              key={map}
              type="button"
              className={`map-tile${step ? ` ${step.action}` : ''}${step && step.index === shown - 1 ? ' fresh' : ''}`}
              disabled={!myTurn || !available.has(map)}
              onClick={() => choose(map)}
              aria-label={`${mapLabel(map)}${status ? `, ${status}` : ''}${slot ? `, mapa ${slot}` : ''}${hint !== undefined ? `, conforto do adversário ${formatPoints(hint)}` : ''}`}
            >
              <MapSplash name={map} />
              {step && (
                <span className={`action-chip on-tile ${step.action}`} aria-hidden="true">
                  <Icon name={ACTION_ICONS[step.action]} />
                  {ACTION_LABELS[step.action]}
                </span>
              )}
              {slot && (
                <span className="map-order" aria-hidden="true">
                  Mapa {slot}
                </span>
              )}
              <span className="map-tile-label">
                <strong>{mapLabel(map)}</strong>
                {step ? (
                  <span className="map-status">{step.team === null ? 'Mapa que sobrou' : who(step.team)}</span>
                ) : (
                  hint !== undefined && (
                    <span className={`scout ${hint > 0 ? 'neg' : hint < 0 ? 'pos' : ''}`}>
                      adv. {formatPoints(hint)}
                    </span>
                  )
                )}
              </span>
            </button>
          );
        })}
      </div>

      {done && (
        <section className="panel series-maps">
          <h2>Mapas da série</h2>
          <ol className="played-maps">
            {playedMaps(veto).map(({ map, pickedBy }, i) => (
              <li key={map}>
                <span className="played-num">{i + 1}</span>
                <strong>{mapLabel(map)}</strong>
                <span className={`action-chip ${pickedBy === null ? 'decider' : 'pick'}`}>
                  <Icon name={pickedBy === null ? 'decider' : 'pick'} />
                  {pickedBy === null ? 'Decisivo' : pickedBy === side ? 'Seu pick' : `Pick de ${opp.name}`}
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="primary wide" onClick={onPlay}>
            Jogar série
          </button>
        </section>
      )}
      <button type="button" className="secondary back" onClick={onBack}>
        Voltar ao torneio
      </button>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-label="escolhendo">
      <span />
      <span />
      <span />
    </span>
  );
}

function ScoutNote({ level, hints }: { level: number; hints: { map: string; value: number }[] }) {
  if (level <= 0) {
    return <p className="small muted">Seu coach (Veto +0) não tem leitura do adversário: o veto é no escuro.</p>;
  }
  return (
    <p className="small muted">
      Leitura do coach (Veto +{level}): conforto do adversário em{' '}
      {hints.map((h) => `${mapLabel(h.map)} ${formatPoints(h.value)}`).join(', ')}. Bana os mapas fortes dele e escolha
      os fracos.
    </p>
  );
}
