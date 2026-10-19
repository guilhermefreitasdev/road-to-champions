import { VETO_ORDERS, isVetoComplete, nextTurn, playedMaps, remainingMaps, type VetoStep } from '../../engine/veto';
import type { TeamIndex } from '../../engine/types';
import { formatPoints } from '../../game/explain';
import { RUN_MAP_POOL, teamInfo, userOpponent, userPendingMatch, vetoScouting, type RunState } from '../../game/run';
import { MapSplash, mapLabel } from '../components/GameImage';

interface Props {
  run: RunState;
  onChoose: (map: string) => void;
  onPlay: () => void;
  onBack: () => void;
}

const ACTION_LABELS = { ban: 'Ban', pick: 'Pick', decider: 'Decisivo' } as const;

export function Veto({ run, onChoose, onPlay, onBack }: Props) {
  const pending = userPendingMatch(run)!;
  const veto = run.veto!.state;
  const { match, side } = pending;
  const oppId = userOpponent(match);
  const opp = teamInfo(run, oppId);
  const turn = nextTurn(veto);
  const done = isVetoComplete(veto);
  const myTurn = !!turn && turn.team === side;
  const available = new Set(remainingMaps(veto));
  const scouting = vetoScouting(run, oppId);
  const hintOf = new Map(scouting.hints.map((h) => [h.map, h.value]));
  const stepOf = new Map(veto.steps.map((s) => [s.map, s]));
  const who = (team: TeamIndex | null) => (team === null ? '—' : team === side ? 'Você' : opp.name);

  const order = [...VETO_ORDERS[veto.bestOf], 'decider' as const];

  return (
    <div className="screen veto">
      <header className="screen-head">
        <p className="eyebrow">
          {match.label} · MD{match.bestOf}
        </p>
        <h1>Veto vs {opp.name}</h1>
      </header>

      <ol className="veto-steps" aria-label="Ordem do veto">
        {order.map((action, i) => {
          const step: VetoStep | undefined = veto.steps[i];
          const team: TeamIndex | null = action === 'decider' ? null : ((i % 2 === 0 ? veto.firstTeam : 1 - veto.firstTeam) as TeamIndex);
          const current = !done && i === veto.steps.length;
          return (
            <li key={i} className={`veto-step ${action}${step ? ' done' : ''}${current ? ' current' : ''}`}>
              <span className="small">
                {i + 1}. {ACTION_LABELS[action]} · {who(team)}
              </span>
              <strong>{step ? mapLabel(step.map) : current ? '…' : ''}</strong>
            </li>
          );
        })}
      </ol>

      <p className="turn" aria-live="polite">
        {done
          ? 'Veto concluído.'
          : myTurn
            ? `Sua vez: ${turn!.action === 'ban' ? 'bana' : 'escolha'} um mapa.`
            : `Vez de ${opp.name}.`}
      </p>

      <ScoutNote level={scouting.level} hints={scouting.hints} />

      <div className="map-grid">
        {RUN_MAP_POOL.map((map) => {
          const step = stepOf.get(map);
          const hint = hintOf.get(map);
          const status = step
            ? `${ACTION_LABELS[step.action]}${step.team === null ? '' : ` · ${who(step.team)}`}`
            : undefined;
          return (
            <button
              key={map}
              type="button"
              className={`map-tile${step ? ` ${step.action}` : ''}`}
              disabled={!myTurn || !available.has(map)}
              onClick={() => onChoose(map)}
              aria-label={`${mapLabel(map)}${status ? `, ${status}` : ''}${hint !== undefined ? `, conforto do adversário ${formatPoints(hint)}` : ''}`}
            >
              <MapSplash name={map} />
              <span className="map-tile-label">
                <strong>{mapLabel(map)}</strong>
                {status && <span className="map-status">{status}</span>}
                {hint !== undefined && !step && (
                  <span className={`scout ${hint > 0 ? 'neg' : hint < 0 ? 'pos' : ''}`}>adv. {formatPoints(hint)}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {done && (
        <section className="panel">
          <h2>Mapas da série</h2>
          <ol className="played-maps">
            {playedMaps(veto).map(({ map, pickedBy }, i) => (
              <li key={map}>
                Mapa {i + 1}: <strong>{mapLabel(map)}</strong>{' '}
                <span className="muted small">{pickedBy === null ? '(decisivo)' : `(pick de ${who(pickedBy)})`}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="primary wide" onClick={onPlay}>
            Jogar série
          </button>
        </section>
      )}
      <button type="button" className="secondary" onClick={onBack}>
        Voltar ao torneio
      </button>
    </div>
  );
}

function ScoutNote({ level, hints }: { level: number; hints: { map: string; value: number }[] }) {
  if (level <= 0) {
    return <p className="small muted">Seu coach (Veto +0) não tem leitura do adversário: o veto é no escuro.</p>;
  }
  return (
    <p className="small muted">
      Leitura do coach (Veto +{level}): conforto do adversário em{' '}
      {hints.map((h) => `${mapLabel(h.map)} ${formatPoints(h.value)}`).join(', ')}. Bana os mapas fortes dele e escolha os
      fracos.
    </p>
  );
}
