import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapResult, PlayerLine } from '../../engine/match';
import type { SeriesResult } from '../../engine/series';
import type { BestOf, TeamIndex } from '../../engine/types';
import { playedMaps } from '../../engine/veto';
import { AgentIcon, mapLabel } from '../components/GameImage';
import { Icon, YouTag } from '../components/Icon';
import { Scoreboard } from '../components/Scoreboard';
import { SPEEDS, buildEvents, eventDelay, loadSpeed, saveSpeed, viewAt, type FeedKill, type Speed } from '../playback';

interface Props {
  label: string;
  bestOf: BestOf;
  series: SeriesResult;
  side: TeamIndex;
  names: [string, string];
  /** Playback finished or skipped: show the series screen. */
  onDone: () => void;
}

/** Beat after the last map before handing over to the series screen, at 1x. */
const OUTRO_MS = 1800;
const FEED_SIZE = 6;

/**
 * The series "ao vivo": the result is already decided, this only reveals it round by round (score ticking, kill
 * feed with agents, 3K/4K/ACE callouts, round strip), with 1x/2x/4x, pause and skip. Each map's scoreboard is
 * revealed when the map ends.
 */
export function Playback({ label, bestOf, series, side, names, onDone }: Props) {
  const events = useMemo(() => buildEvents(series), [series]);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeedState] = useState<Speed>(loadSpeed);
  const [paused, setPaused] = useState(false);
  const view = viewAt(series, events, cursor);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (paused) return;
    if (view.finished) {
      const id = window.setTimeout(() => done.current(), OUTRO_MS / speed);
      return () => window.clearTimeout(id);
    }
    const prev = events[cursor - 1];
    const delay = prev ? eventDelay(prev, speed) : 300;
    const id = window.setTimeout(() => setCursor((c) => c + 1), delay);
    return () => window.clearTimeout(id);
  }, [cursor, paused, speed, events, view.finished]);

  const setSpeed = (s: Speed) => {
    setSpeedState(s);
    saveSpeed(s);
  };

  const map = series.maps[view.map]!;
  const order = playedMaps(series.veto);
  const pickedBy = order[view.map]?.pickedBy;
  const mapCaption = (i: number) => {
    const p = order[i]?.pickedBy;
    return `Mapa ${i + 1} · ${p === null || p === undefined ? 'decisivo' : `pick de ${names[p]}`}`;
  };
  const lines = new Map<string, PlayerLine>([...map.players[0], ...map.players[1]].map((l) => [l.cardId, l]));
  const sides: [TeamIndex, TeamIndex] = side === 1 ? [1, 0] : [0, 1];
  const color = (team: TeamIndex) => (team === sides[0] ? 'a' : 'b');
  const callout = view.callout && ('killer' in view.callout ? view.callout : null);
  const calloutText = !view.callout
    ? null
    : 'killer' in view.callout
      ? view.callout.streak === 5
        ? `ACE de ${lines.get(view.callout.killer)?.handle ?? '?'}!`
        : `${view.callout.streak}K de ${lines.get(view.callout.killer)?.handle ?? '?'}`
      : `Clutch 1v${view.callout.versus} de ${lines.get(view.callout.clutch)?.handle ?? '?'}!`;
  const isAce = !!callout && callout.streak === 5;
  const roundNo = view.round !== null ? view.round + 1 : view.roundsDone;
  const mapOver = view.mapsDone > view.map;
  // Players down in the round on screen (cleared at the next round start).
  const dead = new Set(view.round !== null || view.lastWinner !== null ? view.feed.map((k) => k.victim) : []);

  return (
    <div className="screen playback">
      <header className="screen-head">
        <h1>{mapLabel(map.map)}</h1>
        <p className="context">
          {label} · MD{bestOf} · Mapa {view.map + 1} de {series.maps.length}
          {` · ${pickedBy === null || pickedBy === undefined ? 'decisivo' : `pick de ${names[pickedBy]}`}`}
        </p>
      </header>

      <section className="panel live" aria-label="Partida ao vivo">
        <div className="live-score">
          <span className={`live-team ${color(0)}`}>
            <strong>{names[0]}</strong>
            {side === 0 && <YouTag />}
            <span className="live-maps" aria-label={`${view.seriesScore[0]} mapas`}>
              {view.seriesScore[0]}
            </span>
          </span>
          <span className="live-numbers" aria-hidden="true">
            <span className={view.lastWinner === 0 ? 'bump' : undefined} key={`a${view.score[0]}`}>
              {view.score[0]}
            </span>
            <span className="live-dash">–</span>
            <span className={view.lastWinner === 1 ? 'bump' : undefined} key={`b${view.score[1]}`}>
              {view.score[1]}
            </span>
          </span>
          <span className={`live-team right ${color(1)}`}>
            <span className="live-maps" aria-label={`${view.seriesScore[1]} mapas`}>
              {view.seriesScore[1]}
            </span>
            {side === 1 && <YouTag />}
            <strong>{names[1]}</strong>
          </span>
        </div>

        <p className="live-status">
          {cursor === 0 || (view.round === null && view.roundsDone === 0) ? (
            <span>Começando {mapLabel(map.map)}…</span>
          ) : mapOver ? (
            <span>
              Fim de mapa: <strong>{names[map.winner]}</strong> {map.score[map.winner]}–{map.score[map.winner === 0 ? 1 : 0]}
            </span>
          ) : (
            <>
              <span>
                Round <strong>{roundNo}</strong>
              </span>
              {view.round !== null && (
                <span className="live-alive" title="Jogadores vivos">
                  <span className={color(0)}>{view.alive[0]}</span> v <span className={color(1)}>{view.alive[1]}</span>
                </span>
              )}
              {view.round === null && view.lastWinner !== null && (
                <span>
                  para <strong>{names[view.lastWinner]}</strong>
                </span>
              )}
            </>
          )}
        </p>

        <RoundStrip map={map} done={view.roundsDone} current={view.round} color={color} />

        <div className="live-stage">
          <TeamHud lines={map.players[0]} dead={dead} tone={color(0)} name={names[0]} />
          <ol className="kill-feed" aria-label="Kills do round">
            {view.feed.slice(-FEED_SIZE).map((k) => (
              <KillRow key={k.id} kill={k} lines={lines} color={color} />
            ))}
          </ol>
          <TeamHud lines={map.players[1]} dead={dead} tone={color(1)} name={names[1]} right />
          {calloutText && (
            <p className={`callout${isAce ? ' ace' : ''}${callout ? '' : ' clutch'}`} key={`${calloutText}-${roundNo}`}>
              {calloutText}
            </p>
          )}
        </div>

        <div className="live-controls" role="group" aria-label="Controles do replay">
          <button type="button" className="secondary" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Continuar' : 'Pausar'}
          </button>
          <div className="speed" role="radiogroup" aria-label="Velocidade">
            {SPEEDS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={speed === s} className={speed === s ? 'is-on' : undefined} onClick={() => setSpeed(s)}>
                {s}x
              </button>
            ))}
          </div>
          <button type="button" className="primary" onClick={() => done.current()}>
            <Icon name="skip" /> Pular para o fim
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {view.mapsDone > 0 && `${mapLabel(series.maps[view.mapsDone - 1]!.map)} terminou: ${names[0]} ${series.maps[view.mapsDone - 1]!.score[0]}, ${names[1]} ${series.maps[view.mapsDone - 1]!.score[1]}.`}
        </p>
      </section>

      {view.mapsDone > 0 && (
        <div className="series-maps-list">
          {series.maps.slice(0, view.mapsDone).map((m, i) => (
            <Scoreboard key={m.map} result={m} teamNames={names} userSide={side} caption={mapCaption(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoundStrip({ map, done, current, color }: { map: MapResult; done: number; current: number | null; color: (t: TeamIndex) => string }) {
  const total = Math.max(24, map.rounds.length);
  return (
    <ol className="rounds live-rounds" aria-label={`${done} rounds jogados`}>
      {Array.from({ length: total }, (_, i) => {
        const r = map.rounds[i];
        const played = i < done && r;
        const cls = [played ? color(r.winner) : i === current ? 'current' : i < map.rounds.length ? 'pending' : 'pending unused', i === 12 || i === 24 ? 'half' : '']
          .filter(Boolean)
          .join(' ');
        return <li key={i} className={cls} />;
      })}
    </ol>
  );
}

/** One team's five for the round: agent, handle, and whether he is still alive (text + icon, not color alone). */
function TeamHud({ lines, dead, tone, name, right }: { lines: PlayerLine[]; dead: Set<string>; tone: string; name: string; right?: boolean }) {
  return (
    <ul className={`team-hud ${tone}${right ? ' right' : ''}`} aria-label={`${name}: vivos e mortos no round`}>
      {lines.map((l) => {
        const down = dead.has(l.cardId);
        return (
          <li key={l.cardId} className={down ? 'is-dead' : undefined}>
            {l.agent ? <AgentIcon name={l.agent} /> : <span className="agent-icon empty" aria-hidden="true" />}
            <span className="hud-handle">{l.handle}</span>
            {down && <span className="sr-only"> (morto)</span>}
          </li>
        );
      })}
    </ul>
  );
}

function KillRow({ kill, lines, color }: { kill: FeedKill; lines: Map<string, PlayerLine>; color: (t: TeamIndex) => string }) {
  const killer = lines.get(kill.killer);
  const victim = lines.get(kill.victim);
  const victimTeam: TeamIndex = kill.team === 0 ? 1 : 0;
  return (
    <li className="kill">
      <span className={`kill-side ${color(kill.team)}`}>
        {killer?.agent && <AgentIcon name={killer.agent} />}
        <strong>{killer?.handle ?? '?'}</strong>
        {kill.streak >= 2 && <span className="kill-streak">{kill.streak}K</span>}
      </span>
      <Icon name="kill" className="kill-arrow" label="eliminou" />
      <span className={`kill-side victim ${color(victimTeam)}`}>
        {victim?.agent && <AgentIcon name={victim.agent} />}
        <span>{victim?.handle ?? '?'}</span>
      </span>
    </li>
  );
}
