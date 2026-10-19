import type { TeamIndex } from '../../engine/types';
import { playedMaps } from '../../engine/veto';
import { USER_ID, teamInfo, type RunState } from '../../game/run';
import { Scoreboard } from '../components/Scoreboard';

export function Series({ run, matchId, onContinue }: { run: RunState; matchId: string; onContinue: () => void }) {
  const match = run.tournament!.matches.find((m) => m.id === matchId)!;
  const series = run.userSeries[matchId]!;
  const side: TeamIndex = match.a === USER_ID ? 0 : 1;
  const names: [string, string] = [teamInfo(run, match.a).name, teamInfo(run, match.b).name];
  const won = series.winner === side;
  const order = playedMaps(series.veto);

  return (
    <div className="screen series">
      <header className="screen-head">
        <p className="eyebrow">
          {match.label} · MD{match.bestOf}
        </p>
        <h1 className={won ? 'win-text' : 'loss-text'}>{won ? 'Vitória!' : 'Derrota'}</h1>
        <p className="series-score" aria-label={`${names[0]} ${series.score[0]} a ${series.score[1]} ${names[1]}`}>
          <span>{names[0]}</span>
          <strong>
            {series.score[0]} – {series.score[1]}
          </strong>
          <span>{names[1]}</span>
        </p>
      </header>

      {series.maps.map((map, i) => {
        const pickedBy = order[i]?.pickedBy;
        const caption = `Mapa ${i + 1} · ${pickedBy === null || pickedBy === undefined ? 'decisivo' : `pick de ${names[pickedBy]}`}`;
        return <Scoreboard key={map.map} result={map} teamNames={names} userSide={side} caption={caption} />;
      })}

      <button type="button" className="primary wide" onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
