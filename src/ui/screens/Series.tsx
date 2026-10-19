import type { SeriesResult } from '../../engine/series';
import type { BestOf, TeamIndex } from '../../engine/types';
import { playedMaps } from '../../engine/veto';
import { YouTag } from '../components/Icon';
import { Scoreboard } from '../components/Scoreboard';

interface Props {
  /** Match label ("Grupo A · Abertura") and format. */
  label: string;
  bestOf: BestOf;
  series: SeriesResult;
  /** The user's side (0 = a, 1 = b). */
  side: TeamIndex;
  names: [string, string];
  onContinue: () => void;
}

export function Series({ label, bestOf, series, side, names, onContinue }: Props) {
  const won = series.winner === side;
  const order = playedMaps(series.veto);

  return (
    <div className="screen series">
      <header className="screen-head">
        <h1 className={`result-title ${won ? 'win-text' : 'loss-text'}`}>
          <span className={`wl ${won ? 'w' : 'l'}`} aria-hidden="true">
            {won ? 'V' : 'D'}
          </span>
          {won ? 'Vitória!' : 'Derrota'}
        </h1>
        <p className="context">
          {label} · MD{bestOf}
        </p>
        <p className="series-score" aria-label={`${names[0]} ${series.score[0]} a ${series.score[1]} ${names[1]}`}>
          <span>
            {names[0]}
            {side === 0 && <YouTag />}
          </span>
          <strong>
            {series.score[0]} – {series.score[1]}
          </strong>
          <span>
            {side === 1 && <YouTag />}
            {names[1]}
          </span>
        </p>
      </header>

      <div className="series-maps-list">
        {series.maps.map((map, i) => {
          const pickedBy = order[i]?.pickedBy;
          const caption = `Mapa ${i + 1} · ${pickedBy === null || pickedBy === undefined ? 'decisivo' : `pick de ${names[pickedBy]}`}`;
          return <Scoreboard key={map.map} result={map} teamNames={names} userSide={side} caption={caption} />;
        })}
      </div>

      <button type="button" className="primary wide" onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
