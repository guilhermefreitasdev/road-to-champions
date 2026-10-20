import { useMemo, useState } from 'react';
import { agentByName } from '../../../data/game';
import { ROLE_LABELS } from '../../../game/explain';
import { REGION_NAMES, seriesStageLabel } from '../../../game/daily/labels';
import type { DailyPlayer } from '../../../game/daily/data';
import { compareAll } from '../../../game/valdle/feedback';
import { VALDLE_GAMES } from '../../../game/valdle/games';
import {
  conexoesState,
  giveUp,
  gradeCells,
  guess,
  guessConexoes,
  guessGrade,
  misses,
  resultOf,
  type ValdleProgress,
  type ValdlePuzzle,
} from '../../../game/valdle/play';
import { compGuessHints, proColumns, type Criterion, type ProFacts, type ProIndex } from '../../../game/valdle/pro';
import { AgentIcon, MapSplash, mapLabel } from '../../components/GameImage';
import { CountryChip, countryName } from '../../components/CountryChip';
import { Icon } from '../../components/Icon';
import { PlayerPhoto } from '../../components/PlayerPhoto';
import { PlayerSearch } from '../../components/PlayerSearch';
import { TeamLogo } from '../../components/TeamLogo';
import { Reveal } from './classicGames';
import { AttrCell, AttrRow, GiveUp, MarkLegend, MissList, OptionSearch, TryCounter } from './parts';

export interface ProGameProps<G extends 'pro' | 'grade' | 'conexoes' | 'comp'> {
  puzzle: ValdlePuzzle<G>;
  progress: ValdleProgress;
  done: boolean;
  index: ProIndex;
  onMove: (fn: (p: ValdleProgress) => ValdleProgress) => void;
}

const agentName = (a: string) => agentByName(a)?.displayName ?? a;

/** pt-BR label of a criterion (the facts behind it are in game/valdle/pro.ts). */
export function criterionLabel(index: ProIndex, c: Criterion): string {
  const eventName = (id: string) => index.data.events.get(id)?.name ?? id;
  switch (c.kind) {
    case 'team':
      return index.families.get(c.team)?.name ?? c.team;
    case 'country':
      return countryName(c.country);
    case 'role':
      return ROLE_LABELS[c.role];
    case 'event':
      return `Jogou o ${eventName(c.event)}`;
    case 'won':
      return `Campeões do ${eventName(c.event)}`;
    case 'title':
      return 'Campeão internacional';
    case 'agent':
      return `Agente mais jogado: ${agentName(c.agent)}`;
  }
}

function CriterionHead({ index, c }: { index: ProIndex; c: Criterion }) {
  const fam = c.kind === 'team' ? index.families.get(c.team) : undefined;
  return (
    <span className={`vd-crit vd-crit-${c.kind}`}>
      {fam && <TeamLogo teamId={[...fam.ids][0]!} name={fam.name} size={22} />}
      {c.kind === 'country' && <CountryChip code={c.country} />}
      {c.kind === 'role' && <Icon name={`role-${c.role}`} />}
      {(c.kind === 'event' || c.kind === 'title') && <Icon name="trophy" />}
      <span translate={c.kind === 'team' ? 'no' : undefined}>{criterionLabel(index, c)}</span>
    </span>
  );
}

function Note({ text }: { text: string | null }) {
  return text ? (
    <p className="daily-feedback info" role="status">
      <Icon name="warning" /> {text}
    </p>
  ) : null;
}

// --- Pro Clássico ----------------------------------------------------------------------------------------------------

function proValue(index: ProIndex, key: string, f: ProFacts) {
  switch (key) {
    case 'team':
      return <span translate="no">{index.families.get(f.lastTeam)?.name ?? f.lastTeamName}</span>;
    case 'country':
      return f.country ? <CountryChip code={f.country} /> : '—';
    case 'region':
      return f.region ? REGION_NAMES[f.region] : '—';
    case 'role':
      return ROLE_LABELS[f.role];
    case 'debut':
      return f.intlFirstYear ?? '—';
    case 'titles':
      return f.intlTitles;
    case 'events':
      return f.intlEvents;
    default:
      return f.topAgent ? (
        <>
          <AgentIcon name={f.topAgent} /> <span className="vd-agent-name">{agentName(f.topAgent)}</span>
        </>
      ) : (
        '—'
      );
  }
}

export function ProGame(props: ProGameProps<'pro'>) {
  const { puzzle, progress, done, index } = props;
  const [note, setNote] = useState<string | null>(null);
  const columns = useMemo(() => proColumns(index), [index]);
  const answer = index.facts.get(puzzle.answer)!;
  const max = VALDLE_GAMES.pro.maxTries;
  const pick = (p: DailyPlayer) => {
    const r = guess(puzzle, progress, p.playerId);
    setNote(r.outcome === 'repeat' ? `Você já tentou ${p.handle}.` : null);
    if (r.outcome === 'hit' || r.outcome === 'miss') props.onMove(() => r.progress);
  };
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Quem é o pro? Cada palpite compara oito fatos da nossa base (eventos internacionais desde 2021 e ligas desde 2023). Títulos e eventos ("int.") contam só os
        internacionais (Masters e Champions).
      </p>
      <MarkLegend />
      {progress.guesses.length > 0 && (
        <ol className="vd-rows" aria-label="Seus palpites">
          {progress.guesses.map((id, i) => {
            const g = index.facts.get(id);
            if (!g) return null;
            const fb = compareAll(columns, g, answer);
            return (
              <AttrRow
                key={id}
                n={i + 1}
                hit={id === answer.id}
                head={
                  <>
                    <strong translate="no">{g.handle}</strong>
                    <CountryChip code={g.country} />
                  </>
                }
                cells={columns.map((c, k) => (
                  <AttrCell key={c.key} label={c.label} value={proValue(index, c.key, g)} feedback={fb[k]!} />
                ))}
              />
            );
          })}
        </ol>
      )}
      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={max} />
          <PlayerSearch players={index.data.playerList} onPick={pick} label="Quem é o pro?" placeholder="Digite o nome do jogador" />
          <Note text={note} />
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <Reveal won={resultOf(puzzle, progress).won} kicker="O pro era">
          <PlayerPhoto playerId={answer.id} eventId={answer.lastEventId} handle={answer.handle} country={answer.country} size={72} />
          <span>
            <span className="daily-reveal-name" translate="no">
              {answer.handle}
            </span>
            <span className="small muted">
              {ROLE_LABELS[answer.role]} · {countryName(answer.country)} · último time na base: <span translate="no">{answer.lastTeamName}</span>
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">
        Parcial (amarelo): último time = o palpite jogou por um time da carreira da resposta; função = a resposta já jogou nessa função; estreia e eventos =
        diferença de 1; agente = mesma função de agente. Dados: VLR.gg e Liquipedia.
      </p>
    </div>
  );
}

// --- Grade 3x3 -------------------------------------------------------------------------------------------------------

export function GradeGame(props: ProGameProps<'grade'>) {
  const { puzzle, progress, done, index } = props;
  const cells = gradeCells(puzzle, progress);
  const firstEmpty = cells.findIndex((c) => c === null);
  const [selected, setSelected] = useState<number>(Math.max(0, firstEmpty));
  const [note, setNote] = useState<{ kind: 'ok' | 'bad' | 'info'; text: string } | null>(null);
  const max = VALDLE_GAMES.grade.maxTries;
  const left = max - progress.guesses.length;
  const cell = cells[selected] === null ? selected : cells.findIndex((c) => c === null);
  const row = Math.floor(Math.max(0, cell) / 3);
  const col = Math.max(0, cell) % 3;
  const handle = (id: string) => index.facts.get(id)?.handle ?? id;

  const pick = (p: DailyPlayer) => {
    if (cell < 0) return;
    const r = guessGrade(puzzle, progress, cell, p.playerId);
    if (r.outcome === 'used') setNote({ kind: 'info', text: `${p.handle} já está em outra casa.` });
    else if (r.outcome === 'repeat') setNote({ kind: 'info', text: `Você já tentou ${p.handle} nesta casa.` });
    else if (r.outcome === 'hit') setNote({ kind: 'ok', text: `${p.handle} serve! ${puzzle.answers[cell]!.length} jogadores possíveis nesta casa.` });
    else if (r.outcome === 'miss') setNote({ kind: 'bad', text: `${p.handle} não cumpre as duas condições.` });
    if (r.outcome === 'hit' || r.outcome === 'miss') {
      props.onMove(() => r.progress);
      if (r.outcome === 'hit') {
        const next = gradeCells(puzzle, r.progress).findIndex((c, i) => c === null && i !== cell);
        if (next >= 0) setSelected(next);
      }
    }
  };

  return (
    <div className="vd-game">
      <p className="daily-rule">
        Escolha uma casa e escreva um pro que cumpra a linha e a coluna. Cada jogador vale uma vez. {max} palpites para as 9 casas: errar gasta um palpite.
        &quot;Jogou pela&quot; conta qualquer evento da base como titular.
      </p>
      <div className="vd-grade" role="grid" aria-label="Grade 3x3">
        <div role="row" className="vd-grade-row head">
          <span className="vd-grade-corner" aria-hidden="true">
            <Icon name="grid" />
          </span>
          {puzzle.cols.map((c, j) => (
            <span key={j} role="columnheader" className="vd-grade-head">
              <CriterionHead index={index} c={c} />
            </span>
          ))}
        </div>
        {puzzle.rows.map((r, i) => (
          <div role="row" key={i} className="vd-grade-row">
            <span role="rowheader" className="vd-grade-head row">
              <CriterionHead index={index} c={r} />
            </span>
            {puzzle.cols.map((c, j) => {
              const k = i * 3 + j;
              const filled = cells[k];
              const n = puzzle.answers[k]!.length;
              const example = !filled && done ? puzzle.answers[k]!.map(handle).slice(0, 2).join(', ') : null;
              return (
                <span role="gridcell" key={j}>
                  <button
                    type="button"
                    className={`vd-grade-cell${filled ? ' filled' : ''}${!filled && k === cell && !done ? ' selected' : ''}${!filled && done ? ' missed' : ''}`}
                    disabled={done || !!filled}
                    aria-pressed={k === cell && !filled}
                    aria-label={`${criterionLabel(index, r)} e ${criterionLabel(index, c)}${filled ? `: ${handle(filled)}` : ''}`}
                    onClick={() => setSelected(k)}
                  >
                    {filled ? (
                      <>
                        <PlayerPhoto playerId={filled} handle={handle(filled)} size={34} />
                        <strong translate="no">{handle(filled)}</strong>
                        <span className="vd-grade-n">{n} possíveis</span>
                      </>
                    ) : done ? (
                      <>
                        <span className="vd-grade-n">{n} possíveis</span>
                        <span className="vd-grade-ex" translate="no">
                          ex.: {example}
                        </span>
                      </>
                    ) : (
                      <span className="vd-grade-plus">{k === cell ? 'Escolhida' : '+'}</span>
                    )}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {!done && cell >= 0 && (
        <>
          <p className="daily-tally vd-tally">
            <span>
              Casa: <strong>{criterionLabel(index, puzzle.rows[row]!)}</strong> + <strong>{criterionLabel(index, puzzle.cols[col]!)}</strong>
            </span>
            <span>
              Palpites restantes: <strong>{left}</strong>
            </span>
          </p>
          <PlayerSearch players={index.data.playerList} onPick={pick} label="Pro para a casa escolhida" placeholder="Digite o nome do jogador" submitLabel="Pôr" />
          {note && (
            <p className={`daily-feedback ${note.kind === 'ok' ? 'hit' : note.kind === 'bad' ? 'miss' : 'info'}`} role="status">
              <Icon name={note.kind === 'ok' ? 'check' : note.kind === 'bad' ? 'close' : 'warning'} /> {note.text}
            </p>
          )}
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <Reveal won={resultOf(puzzle, progress).won} kicker="Fim da grade">
          <span>
            <span className="daily-reveal-name">{cells.filter(Boolean).length}/9 casas</span>
            <span className="small muted">Em cada casa, o número de pros da base que serviriam.</span>
          </span>
        </Reveal>
      )}
    </div>
  );
}

// --- Conexões --------------------------------------------------------------------------------------------------------

export function ConexoesGame(props: ProGameProps<'conexoes'>) {
  const { puzzle, progress, done, index } = props;
  const [picked, setPicked] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>(puzzle.order);
  const [note, setNote] = useState<{ kind: 'ok' | 'bad' | 'info'; text: string } | null>(null);
  const state = conexoesState(puzzle, progress);
  const max = VALDLE_GAMES.conexoes.maxTries;
  const solvedIds = new Set(state.solved.flatMap((i) => puzzle.groups[i]!.players));
  const shownGroups = done ? [...state.solved, ...puzzle.groups.map((_, i) => i).filter((i) => !state.solved.includes(i))] : state.solved;
  const remaining = order.filter((id) => !solvedIds.has(id));
  const handle = (id: string) => index.facts.get(id)?.handle ?? id;
  const toggle = (id: string) => {
    setNote(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  };
  const submit = () => {
    const r = guessConexoes(puzzle, progress, picked);
    if (r.outcome === 'repeat') setNote({ kind: 'info', text: 'Você já tentou esse grupo.' });
    else if (r.outcome === 'hit') setNote({ kind: 'ok', text: 'Grupo certo!' });
    else if (r.outcome === 'miss') setNote({ kind: 'bad', text: r.oneAway ? 'Quase: três desses são de um mesmo grupo.' : 'Não é um grupo.' });
    if (r.outcome === 'hit' || r.outcome === 'miss') {
      props.onMove(() => r.progress);
      if (r.outcome === 'hit') setPicked([]);
    }
  };
  const shuffle = () => {
    // Display only: a new order of the tiles (the puzzle itself never changes).
    setOrder((o) => {
      const a = [...o];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    });
  };
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Separe os 16 pros em 4 grupos de 4. Cada grupo divide um fato da base: um time pelo qual todos jogaram, o país, um título que ganharam juntos ou o
        agente mais jogado. Cada pro cabe em um só grupo. {max} erros e acabou.
      </p>
      {shownGroups.length > 0 && (
        <ul className="vd-groups">
          {shownGroups.map((i) => {
            const g = puzzle.groups[i]!;
            const found = state.solved.includes(i);
            return (
              <li key={i} className={`vd-group g${i + 1}${found ? '' : ' missed'}`}>
                <strong>{criterionLabel(index, g.criterion)}</strong>
                <span translate="no">{g.players.map(handle).join(', ')}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!done && (
        <>
          <ul className="vd-tiles" aria-label="Jogadores">
            {remaining.map((id) => (
              <li key={id}>
                <button type="button" className={`vd-tile${picked.includes(id) ? ' picked' : ''}`} aria-pressed={picked.includes(id)} onClick={() => toggle(id)}>
                  <span translate="no">{handle(id)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="daily-tally vd-tally">
            <span>
              Erros restantes: <strong>{max - state.mistakes.length}</strong>
            </span>
            <span className="vd-pips" aria-hidden="true">
              {Array.from({ length: max }, (_, i) => (
                <span key={i} className={i < state.mistakes.length ? 'used' : ''} />
              ))}
            </span>
          </p>
          <div className="vd-actions">
            <button type="button" className="ghost" onClick={shuffle}>
              <Icon name="swap" /> Embaralhar
            </button>
            <button type="button" className="secondary" disabled={!picked.length} onClick={() => setPicked([])}>
              Limpar
            </button>
            <button type="button" className="primary" disabled={picked.length !== 4} onClick={submit}>
              Enviar grupo
            </button>
          </div>
          {note && (
            <p className={`daily-feedback ${note.kind === 'ok' ? 'hit' : note.kind === 'bad' ? 'miss' : 'info'}`} role="status">
              <Icon name={note.kind === 'ok' ? 'check' : note.kind === 'bad' ? 'close' : 'warning'} /> {note.text}
            </p>
          )}
        </>
      )}
      {done && (
        <Reveal won={resultOf(puzzle, progress).won} kicker="Fim das conexões">
          <span>
            <span className="daily-reveal-name">{state.solved.length}/4 grupos</span>
            <span className="small muted">
              {state.mistakes.length} erro{state.mistakes.length === 1 ? '' : 's'}
            </span>
          </span>
        </Reveal>
      )}
    </div>
  );
}

// --- Comp Misteriosa -------------------------------------------------------------------------------------------------

export function CompGame(props: ProGameProps<'comp'>) {
  const { puzzle, progress, done, index } = props;
  const [note, setNote] = useState<string | null>(null);
  const miss = misses(puzzle, progress);
  const max = VALDLE_GAMES.comp.maxTries;
  const options = useMemo(
    () =>
      [...index.families.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ id: f.key, label: f.name, ...(f.region ? { sub: REGION_NAMES[f.region] } : {}), lead: <TeamLogo teamId={[...f.ids][0]!} name={f.name} size={20} /> })),
    [index],
  );
  const won = puzzle.score[0] > puzzle.score[1];
  const clues = [
    { at: 1, title: 'Evento', body: `${puzzle.eventName}` },
    {
      at: 2,
      title: 'Comp do adversário',
      body: (
        <span className="vd-comp-agents small-icons">
          {puzzle.opponentAgents.map((a) => (
            <AgentIcon key={a} name={a} />
          ))}
        </span>
      ),
    },
    { at: 3, title: 'Fase e placar do mapa', body: `${seriesStageLabel(puzzle.stage, puzzle.round) || 'Partida'} · ${won ? 'venceu' : 'perdeu'} ${puzzle.score[0]}–${puzzle.score[1]}` },
    { at: 4, title: 'Região do time', body: puzzle.team.region ? REGION_NAMES[puzzle.team.region] : '—' },
    { at: 5, title: 'Adversário', body: <span translate="no">{puzzle.opponent.name}</span> },
  ];
  const play = (id: string, label: string) => {
    const r = guess(puzzle, progress, id);
    setNote(r.outcome === 'repeat' ? `Você já tentou ${label}.` : null);
    if (r.outcome === 'hit' || r.outcome === 'miss') props.onMove(() => r.progress);
  };
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Uma composição real, jogada num mapa de {puzzle.year}. Qual time jogou com ela? Nenhum outro time usou essas cinco nesse mapa no mesmo evento. Cada erro
        abre uma pista.
      </p>
      <div className="panel vd-comp">
        <span className="vd-comp-map">
          <MapSplash name={puzzle.map} />
          <span className="vd-comp-map-name">{mapLabel(puzzle.map)}</span>
        </span>
        <span className="vd-comp-agents" aria-label={`Agentes: ${puzzle.agents.map(agentName).join(', ')}`}>
          {puzzle.agents.map((a) => (
            <span key={a} className="vd-comp-agent">
              <AgentIcon name={a} />
              <span>{agentName(a)}</span>
            </span>
          ))}
        </span>
      </div>
      <ol className="daily-clues vd-clues">
        {clues.map((c) => {
          const open = done || miss >= c.at;
          return (
            <li key={c.title} className={`daily-clue${open ? ' open' : ''}`}>
              <span className="daily-clue-head">{c.title}</span>
              <span className="daily-clue-body">
                {open ? (
                  c.body
                ) : (
                  <span className="muted small">
                    <Icon name="lock" /> Abre após o {c.at}º erro
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <MissList
        items={progress.guesses.map((id) => {
          const hit = id === puzzle.team.key;
          const h = compGuessHints(index, puzzle, id);
          return {
            id,
            label: <span translate="no">{index.families.get(id)?.name ?? id}</span>,
            hit,
            ...(hit
              ? {}
              : {
                  hint: (
                    <>
                      {h.sameRegion !== null && <span className={h.sameRegion ? 'same' : 'diff'}>{h.sameRegion ? 'mesma região' : 'outra região'}</span>}
                      {miss >= 1 && <span className={h.atEvent ? 'same' : 'diff'}>{h.atEvent ? 'jogou o evento' : 'não jogou o evento'}</span>}
                    </>
                  ),
                }),
          };
        })}
      />
      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={max} />
          <OptionSearch options={options} exclude={new Set(progress.guesses)} onPick={(o) => play(o.id, o.label)} label="Qual time?" placeholder="Digite um time" />
          {note && (
            <p className="daily-feedback info" role="status">
              <Icon name="warning" /> {note}
            </p>
          )}
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <Reveal won={resultOf(puzzle, progress).won} kicker="O time era">
          <TeamLogo teamId={puzzle.team.teamId} eventId={puzzle.eventId} name={puzzle.team.name} size={56} />
          <span>
            <span className="daily-reveal-name" translate="no">
              {puzzle.team.name}
            </span>
            <span className="small muted">
              {puzzle.eventName} · {mapLabel(puzzle.map)} contra <span translate="no">{puzzle.opponent.name}</span> ({puzzle.score[0]}–{puzzle.score[1]})
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">Composições dos placares por mapa do VLR.gg (agentes de cada jogador naquele mapa).</p>
    </div>
  );
}
