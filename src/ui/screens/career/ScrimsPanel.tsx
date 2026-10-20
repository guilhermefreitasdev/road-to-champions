import { useState } from 'react';
import type { MapName } from '../../../engine/types';
import {
  CAREER_MAP_POOL,
  CAREER_STAGE_LABELS,
  STARTERS,
  nameOf,
  playScrim,
  scrimInfo,
  scrimOpponents,
  scrimReport,
  starters,
  strengthOf,
} from '../../../game/career';
import { formatDecimal } from '../../../game/explain';
import type { StatRow } from '../../../game/stats';
import { REGION_LABELS } from '../../../game/season';
import { mapLabel } from '../../components/GameImage';
import { Icon, YouTag } from '../../components/Icon';
import { BlockNote, Empty, type PanelProps } from './shared';

interface Props extends PanelProps {
  onViewSeries: (key: string) => void;
}

/** Scrims: an MD1 against a league team or another region's team, then the per-player report with the MVP. */
export function ScrimsPanel({ c, act, onViewSeries }: Props) {
  const info = scrimInfo(c);
  const opponents = scrimOpponents(c);
  const league = new Set(c.aiTeams.map((t) => t.id));
  const [picked, setOpponent] = useState(opponents[0] ?? '');
  const opponent = opponents.includes(picked) ? picked : (opponents[0] ?? '');
  const [map, setMap] = useState<MapName | ''>('');
  const [shownN, setShownN] = useState<number | null>(null);
  const last = info.played[info.played.length - 1];
  const n = shownN ?? last?.n ?? null;
  const block =
    !info.stage ? 'Scrims só durante a temporada (pré-temporada até o Champions)'
    : info.left <= 0 ? `Sem scrims restantes para a etapa (${info.perStage[info.stage]} por etapa)`
    : starters(c).length < STARTERS ? 'Escale 5 titulares antes'
    : c.veto ? 'Veto em andamento'
    : null;

  const play = () => {
    if (act((x) => playScrim(x, opponent, map || undefined))) setShownN(null);
  };

  return (
    <div className="cr-panel">
      <p className="small muted measure">
        Treino em MD1 com a fase do torneio da próxima etapa. Não mexe na tabela nem no caixa: dá +1 mapa de familiaridade no mapa
        jogado, moral (+2 vitória, −1 derrota, +2 para o MVP) e o relatório de cada jogador. Limite: {info.perStage.league} até o
        fim da liga (a pré-temporada conta), {info.perStage.masters} até o Masters, {info.perStage.champions} no Champions.
      </p>
      <dl className="hub-stats">
        <div>
          <dt>Restantes</dt>
          <dd>{info.stage ? `${info.left} de ${info.perStage[info.stage]}` : '—'}</dd>
        </div>
        {info.stage && (
          <div>
            <dt>Etapa</dt>
            <dd>{CAREER_STAGE_LABELS[info.stage]}</dd>
          </div>
        )}
        <div>
          <dt>Jogados na temporada</dt>
          <dd>{info.played.length}</dd>
        </div>
      </dl>

      <div className="board-filters cr-filters cr-scrim-form" role="group" aria-label="Novo scrim">
        <label className="board-select">
          <span>Adversário</span>
          <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
            <optgroup label={`Liga ${REGION_LABELS[c.org.region]}`}>
              {opponents
                .filter((id) => league.has(id))
                .map((id) => (
                  <option key={id} value={id}>
                    {nameOf(c, id)} · força {formatDecimal(strengthOf(c, id))}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Outras regiões">
              {opponents
                .filter((id) => !league.has(id))
                .map((id) => (
                  <option key={id} value={id}>
                    {nameOf(c, id)}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <label className="board-select">
          <span>Mapa</span>
          <select value={map} onChange={(e) => setMap(e.target.value as MapName | '')}>
            <option value="">Veto automático</option>
            {CAREER_MAP_POOL.map((m) => (
              <option key={m} value={m}>
                {mapLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary cr-scrim-play" disabled={!!block || !opponent} aria-describedby={block ? 'cr-scrim-block' : undefined} onClick={play}>
          <Icon name="play" /> Jogar scrim (MD1)
        </button>
      </div>
      {block && <BlockNote id="cr-scrim-block">{block}</BlockNote>}

      {info.played.length > 0 && (
        <div className="segmented cr-scrim-pick" role="radiogroup" aria-label="Relatório do scrim">
          {info.played.map((s) => (
            <label key={s.n} className={`segment${s.n === n ? ' is-on' : ''}`}>
              <input type="radio" name="scrim-report" value={s.n} checked={s.n === n} onChange={() => setShownN(s.n)} />
              <span className={`wl ${s.won ? 'w' : 'l'}`} aria-hidden="true">
                {s.won ? 'V' : 'D'}
              </span>
              <span className="sr-only">{s.won ? 'Vitória' : 'Derrota'}</span> #{s.n}
            </label>
          ))}
        </div>
      )}
      {n !== null ? <ScrimReportView c={c} n={n} onViewSeries={onViewSeries} /> : <Empty>Nenhum scrim jogado nesta temporada.</Empty>}
    </div>
  );
}

function ScrimReportView({ c, n, onViewSeries }: { c: PanelProps['c']; n: number; onViewSeries: (key: string) => void }) {
  const report = scrimReport(c, n);
  const s = report.scrim;
  const mine = report.rows.filter((r) => r.isUser);
  const theirs = report.rows.filter((r) => !r.isUser);
  return (
    <section className="panel cr-scrim-report" aria-labelledby="cr-scrim-title">
      <h3 id="cr-scrim-title" className={s.won ? 'win-text' : 'loss-text'}>
        <span className={`wl ${s.won ? 'w' : 'l'}`} aria-hidden="true">
          {s.won ? 'V' : 'D'}
        </span>{' '}
        Scrim #{s.n}: {s.won ? 'vitória' : 'derrota'} {s.score[0]}–{s.score[1]}
      </h3>
      <p className="context">
        vs {report.opponentName} · {mapLabel(s.map)} · {CAREER_STAGE_LABELS[s.stage]}
      </p>
      <p className="cr-mvp">
        <Icon name="medal" /> MVP: <strong>{report.mvp.handle}</strong> {report.mvp.isUser && <YouTag />}
      </p>
      <ScrimTable rows={mine} caption={`${c.org.name} no scrim #${s.n}`} mvp={report.mvp.cardId} />
      <ScrimTable rows={theirs} caption={`${report.opponentName} no scrim #${s.n}`} mvp={report.mvp.cardId} />
      <button type="button" className="secondary" onClick={() => onViewSeries(report.seriesKey)}>
        <Icon name="stats" /> Placar completo e replay
      </button>
    </section>
  );
}

function ScrimTable({ rows, caption, mvp }: { rows: StatRow[]; caption: string; mvp: string }) {
  return (
    <div className="cr-scroll">
      <table className="cr-table cr-scrim-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Jogador</th>
            <th scope="col" title="Rating estimado pelo simulador">
              R
            </th>
            <th scope="col">K/D/A</th>
            <th scope="col">ACS</th>
            <th scope="col">KAST</th>
            <th scope="col" title="First kills / first deaths">
              FK/FD
            </th>
            <th scope="col" title="Rounds com 3, 4 e 5 kills">
              3K/4K/ACE
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isMvp = r.cardId.replace(/#user$/, '') === mvp;
            return (
              <tr key={r.cardId} className={isMvp ? 'is-mvp' : undefined}>
                <th scope="row">
                  {r.handle}
                  {isMvp && (
                    <span className="cr-mvp-tag">
                      <Icon name="medal" /> MVP
                    </span>
                  )}
                </th>
                <td>{formatDecimal(r.rating, 2)}</td>
                <td>
                  {r.kills}/{r.deaths}/{r.assists}
                </td>
                <td>{r.acs}</td>
                <td>{r.kast}%</td>
                <td>
                  {r.fk}/{r.fd}
                </td>
                <td>
                  {r.k3}/{r.k4}/{r.aces}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
