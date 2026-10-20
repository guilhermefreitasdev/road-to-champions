import { useState } from 'react';
import { mapByName } from '../../data/game';
import type { PlacarPuzzle } from '../../game/daily/generate';
import { seriesStageLabel } from '../../game/daily/labels';
import { formatDayKey } from '../../game/daily/calendar';
import { answerPlacar, placarResult, placarScoreOptions, placarTruth, type PlacarState } from '../../game/daily/play';
import { Icon } from '../components/Icon';
import { TeamLogo } from '../components/TeamLogo';

const mapLabel = (name: string) => mapByName(name)?.displayName ?? name;

/** Placar Clássico: a real series; guess the winner, the score and (bonus) the last map. */
export function DailyPlacar({
  puzzle,
  state,
  onChange,
}: {
  puzzle: PlacarPuzzle;
  state: PlacarState;
  onChange: (fn: (s: PlacarState) => PlacarState) => void;
}) {
  const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [loserMaps, setLoserMaps] = useState<number | null>(null);
  const [map, setMap] = useState<string | null>(null);
  const need = Math.ceil(puzzle.bestOf / 2);
  const result = placarResult(state, puzzle);
  const truth = placarTruth(puzzle);
  const stage = seriesStageLabel(puzzle.stage, puzzle.round);

  return (
    <div className="daily-placar">
      <div className="panel daily-series-card">
        <p className="daily-series-event">
          {puzzle.eventName}
          {stage && <span className="muted"> · {stage}</span>}
        </p>
        <p className="small muted">
          MD{puzzle.bestOf}
          {puzzle.date ? ` · ${formatDayKey(puzzle.date)}` : ''}
        </p>
        <div className="daily-versus">
          {puzzle.teams.map((t, i) => {
            const won = state.done && truth.winner === i;
            return (
              <div key={t.teamId} className={`daily-versus-team${won ? ' won' : ''}`}>
                <TeamLogo teamId={t.teamId} eventId={puzzle.eventId} name={t.name} size={56} />
                <span className="daily-versus-name" translate="no">
                  {t.name}
                </span>
                {state.done && <span className="daily-versus-score">{puzzle.score[i]}</span>}
              </div>
            );
          })}
          {!state.done && (
            <span className="daily-versus-vs" aria-hidden="true">
              vs
            </span>
          )}
        </div>
      </div>

      {!state.done && (
        <>
          <fieldset className="daily-fieldset">
            <legend>Quem venceu a série?</legend>
            <div className="daily-choice-row">
              {puzzle.teams.map((t, i) => (
                <button
                  key={t.teamId}
                  type="button"
                  className={`daily-choice${winner === i ? ' chosen' : ''}`}
                  aria-pressed={winner === i}
                  onClick={() => setWinner(i as 0 | 1)}
                >
                  <TeamLogo teamId={t.teamId} eventId={puzzle.eventId} name={t.name} size={24} /> <span translate="no">{t.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="daily-fieldset">
            <legend>Placar da série</legend>
            <div className="daily-choice-row">
              {placarScoreOptions(puzzle.bestOf).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`daily-choice score${loserMaps === l ? ' chosen' : ''}`}
                  aria-pressed={loserMaps === l}
                  onClick={() => setLoserMaps(l)}
                >
                  {need}–{l}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="daily-fieldset">
            <legend>
              Bônus: último mapa da série <span className="small muted">(+1, opcional)</span>
            </legend>
            <div className="daily-choice-row wrap">
              {puzzle.mapOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`daily-choice map${map === m ? ' chosen' : ''}`}
                  aria-pressed={map === m}
                  onClick={() => setMap((cur) => (cur === m ? null : m))}
                >
                  {mapLabel(m)}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className="primary wide"
            disabled={winner === null || loserMaps === null}
            onClick={() => {
              if (winner !== null && loserMaps !== null) onChange((s) => answerPlacar(s, puzzle, winner, loserMaps, map));
            }}
          >
            Confirmar palpite
          </button>
          <p className="small muted">Vencedor 2 pontos, placar exato mais 2, último mapa mais 1.</p>
        </>
      )}

      {state.done && (
        <>
          <table className="daily-maps">
            <caption className="sr-only">Mapas da série</caption>
            <thead>
              <tr>
                <th scope="col">Mapa</th>
                <th scope="col" translate="no">
                  {puzzle.teams[0].name}
                </th>
                <th scope="col" translate="no">
                  {puzzle.teams[1].name}
                </th>
                <th scope="col">Escolha</th>
              </tr>
            </thead>
            <tbody>
              {puzzle.maps.map((m, i) => (
                <tr key={`${m.map}-${i}`}>
                  <th scope="row">{mapLabel(m.map)}</th>
                  <td className={m.score[0] > m.score[1] ? 'won' : ''}>{m.score[0]}</td>
                  <td className={m.score[1] > m.score[0] ? 'won' : ''}>{m.score[1]}</td>
                  <td className="small muted">{m.pickedBy === null ? 'Decisivo' : (puzzle.teams[m.pickedBy]?.name ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="daily-breakdown">
            <li className={result.winnerOk ? 'won' : 'lost'}>
              <Icon name={result.winnerOk ? 'check' : 'close'} /> Vencedor: {puzzle.teams[truth.winner].name} {result.winnerOk ? '(+2)' : ''}
            </li>
            <li className={result.scoreOk ? 'won' : 'lost'}>
              <Icon name={result.scoreOk ? 'check' : 'close'} /> Placar: {need}–{truth.loserMaps}
              {state.loserMaps !== null && !result.scoreOk ? ` (você: ${need}–${state.loserMaps})` : ''} {result.scoreOk ? '(+2)' : ''}
            </li>
            <li className={result.mapOk ? 'won' : 'lost'}>
              <Icon name={result.mapOk ? 'check' : 'close'} /> Último mapa: {mapLabel(truth.lastMap)}
              {state.map && !result.mapOk ? ` (você: ${mapLabel(state.map)})` : !state.map ? ' (sem palpite)' : ''} {result.mapOk ? '(+1)' : ''}
            </li>
          </ul>
          <p className={`daily-verdict ${result.won ? 'won' : 'lost'}`}>
            <Icon name={result.won ? 'check' : 'close'} /> {result.points} de 5 pontos.
          </p>
          <p className="small muted">Resultado e mapas: VLR.gg.</p>
        </>
      )}
    </div>
  );
}
