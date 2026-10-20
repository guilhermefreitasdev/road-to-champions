import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ROLE_LABELS } from '../../../game/explain';
import {
  AGENT_COLUMNS,
  CONTINENT_LABELS,
  PENETRATION_LABELS,
  SLOT_KEYS,
  WEAPON_CATEGORY_LABELS,
  WEAPON_COLUMNS,
  calloutLabel,
  calloutLabelEn,
  type ClassicAgent,
  type ClassicCallout,
  type ClassicData,
  type ClassicMap,
  type ClassicWeapon,
} from '../../../game/valdle/classic';
import { compareAll } from '../../../game/valdle/feedback';
import { centroid, voronoiCells } from '../../../game/valdle/geometry';
import { VALDLE_GAMES } from '../../../game/valdle/games';
import {
  MAPA_SPOT_TRIES,
  answerBonus,
  giveUp,
  guess,
  guessSpot,
  mapaStepOneDone,
  mapaSummary,
  misses,
  resultOf,
  type ValdleProgress,
  type ValdlePuzzle,
} from '../../../game/valdle/play';
import { loadPlaceImage, placeImageNow } from '../../../data/placeImages';
import { AgentIcon, mapLabel } from '../../components/GameImage';
import { countryName } from '../../components/CountryChip';
import { Icon } from '../../components/Icon';
import { AttrCell, AttrRow, GiveUp, MarkLegend, MissList, OptionSearch, TryCounter, type Option } from './parts';

export interface GameProps<G extends 'agente' | 'habilidade' | 'mapa' | 'callout' | 'arma'> {
  puzzle: ValdlePuzzle<G>;
  progress: ValdleProgress;
  done: boolean;
  data: ClassicData;
  onMove: (fn: (p: ValdleProgress) => ValdleProgress) => void;
}

const yesNo = (b: boolean) => (b ? 'Sim' : 'Não');
const pt = (n: number, digits = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits });

function agentOptions(data: ClassicData): Option[] {
  return data.agents.map((a) => ({ id: a.id, label: a.name, aliases: [a.id], sub: ROLE_LABELS[a.role], lead: <AgentIcon name={a.id} /> }));
}

function useGuess<G extends 'agente' | 'habilidade' | 'mapa' | 'callout' | 'arma'>(props: GameProps<G>) {
  const [note, setNote] = useState<string | null>(null);
  const play = (id: string, label: string) => {
    const r = guess(props.puzzle, props.progress, id);
    setNote(r.outcome === 'repeat' ? `Você já tentou ${label}.` : null);
    if (r.outcome === 'hit' || r.outcome === 'miss') props.onMove(() => r.progress);
  };
  return { note, play };
}

function Note({ text }: { text: string | null }) {
  return text ? (
    <p className="daily-feedback info" role="status">
      <Icon name="warning" /> {text}
    </p>
  ) : null;
}

// --- Agente Clássico -------------------------------------------------------------------------------------------------

function agentValue(key: string, a: ClassicAgent) {
  switch (key) {
    case 'role':
      return ROLE_LABELS[a.role];
    case 'origin':
      return a.origin ? countryName(a.origin) : '—';
    case 'vct':
      return a.vctYear ?? '—';
    case 'starter':
      return yesNo(a.starter);
    default:
      return yesNo(a.passive);
  }
}

export function AgenteGame(props: GameProps<'agente'>) {
  const { puzzle, progress, done, data } = props;
  const { note, play } = useGuess(props);
  const answer = data.agentById.get(puzzle.answer)!;
  const options = useMemo(() => agentOptions(data), [data]);
  const max = VALDLE_GAMES.agente.maxTries;
  return (
    <div className="vd-game">
      <p className="daily-rule">Qual é o agente? Cada palpite mostra, coluna por coluna, o que ele tem em comum com a resposta.</p>
      <MarkLegend />
      {progress.guesses.length > 0 && (
        <ol className="vd-rows" aria-label="Seus palpites">
          {progress.guesses.map((id, i) => {
            const g = data.agentById.get(id);
            if (!g) return null;
            const fb = compareAll(AGENT_COLUMNS, g, answer);
            return (
              <AttrRow
                key={id}
                n={i + 1}
                hit={id === answer.id}
                head={
                  <>
                    <AgentIcon name={g.id} /> <strong>{g.name}</strong>
                  </>
                }
                cells={AGENT_COLUMNS.map((c, k) => (
                  <AttrCell key={c.key} label={c.label} value={agentValue(c.key, g)} feedback={fb[k]!} />
                ))}
              />
            );
          })}
        </ol>
      )}
      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={max} />
          <OptionSearch options={options} exclude={new Set(progress.guesses)} onPick={(o) => play(o.id, o.label)} label="Qual é o agente?" placeholder="Digite um agente" />
          <Note text={note} />
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <Reveal won={resultOf(puzzle, progress).won} kicker="O agente era">
          <span className="vd-reveal-icon">
            <AgentIcon name={answer.id} />
          </span>
          <span>
            <span className="daily-reveal-name">{answer.name}</span>
            <span className="small muted">
              {ROLE_LABELS[answer.role]}
              {answer.origin ? ` · ${countryName(answer.origin)} (${CONTINENT_LABELS[answer.continent!]})` : ' · a bio oficial não cita país'}
              {answer.codename ? ` · codinome interno: ${answer.codename}` : ''}
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">
        Função, inicial, passiva e codinome: valorant-api.com. Origem: o país citado na bio oficial (em inglês) do agente. Estreia no VCT: o primeiro ano
        em que o agente aparece num mapa pro da nossa base do VLR.gg (desde 2021).
      </p>
    </div>
  );
}

export function Reveal({ won, kicker, children }: { won: boolean; kicker: string; children: ReactNode }) {
  return (
    <div className={`panel daily-reveal vd-reveal ${won ? 'won' : 'lost'}`}>
      <p className="daily-reveal-kicker">{won ? 'Acertou!' : kicker}</p>
      <div className="vd-reveal-body">{children}</div>
    </div>
  );
}

// --- Habilidade ------------------------------------------------------------------------------------------------------

const BLUR = [16, 11, 7, 4, 2, 1];

function maskNames(text: string, names: readonly string[]): string {
  let out = text;
  for (const n of names.flatMap((x) => x.split(/\s*\/\s*/)).filter((x) => x.length > 2)) {
    out = out.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '___');
  }
  return out;
}

export function HabilidadeGame(props: GameProps<'habilidade'>) {
  const { puzzle, progress, done, data } = props;
  const { note, play } = useGuess(props);
  const [imgFailed, setImgFailed] = useState(false);
  const agent = data.agentById.get(puzzle.agent)!;
  const ability = agent.abilities.find((a) => a.slot === puzzle.slot)!;
  const options = useMemo(() => agentOptions(data), [data]);
  const miss = misses(puzzle, progress);
  const max = VALDLE_GAMES.habilidade.maxTries;
  const result = resultOf(puzzle, progress);
  const step = done ? BLUR.length : Math.min(miss, BLUR.length - 1);
  const blur = done ? 0 : BLUR[step]!;
  const rotation = done || miss >= 3 ? 0 : puzzle.rotation;
  const clues = [
    { at: 1, title: 'Função do agente', body: ROLE_LABELS[agent.role] },
    { at: 2, title: 'Descrição', body: maskNames(ability.description, [ability.name, ability.nameEn, agent.name, agent.id]) },
    { at: 3, title: 'Tecla', body: SLOT_KEYS[ability.slot] },
  ];
  const shownFrom = imgFailed ? 1 : 0; // without the image, the first clue opens at once
  return (
    <div className="vd-game">
      <p className="daily-rule">De qual agente é esta habilidade? A imagem fica mais nítida e as pistas abrem a cada erro. No fim, um bônus: qual habilidade é.</p>
      <div className="vd-ability-stage" aria-label={done ? `Ícone de ${ability.name}` : 'Ícone da habilidade (borrado)'} role="img">
        {ability.icon && !imgFailed ? (
          <img
            src={ability.icon}
            alt=""
            width={128}
            height={128}
            decoding="async"
            style={{ filter: `blur(${blur}px)`, transform: `rotate(${rotation}deg)` }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="vd-ability-missing small muted">Imagem indisponível agora: jogue pelas pistas.</span>
        )}
      </div>
      <ol className="daily-clues vd-clues">
        {clues.map((c) => {
          const open = done || miss + shownFrom >= c.at;
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
      <MissList items={progress.guesses.map((id) => ({ id, label: data.agentById.get(id)?.name ?? id, hit: id === agent.id }))} />
      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={max} />
          <OptionSearch options={options} exclude={new Set(progress.guesses)} onPick={(o) => play(o.id, o.label)} label="De quem é a habilidade?" placeholder="Digite um agente" />
          <Note text={note} />
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <>
          <Reveal won={result.won} kicker="Era de">
            <span className="vd-reveal-icon">
              <AgentIcon name={agent.id} />
            </span>
            <span>
              <span className="daily-reveal-name">{agent.name}</span>
              <span className="small muted">{ROLE_LABELS[agent.role]}</span>
            </span>
          </Reveal>
          <section className="panel vd-bonus" aria-labelledby="vd-bonus-title">
            <h3 id="vd-bonus-title">Bônus: qual habilidade é esta?</h3>
            <div className="vd-bonus-options">
              {agent.abilities
                .filter((a) => a.slot !== 'Passive')
                .map((a) => {
                  const picked = progress.bonus === a.slot;
                  const right = a.slot === ability.slot;
                  const state = !progress.bonus ? '' : right ? ' right' : picked ? ' wrong' : '';
                  return (
                    <button
                      key={a.slot}
                      type="button"
                      className={`secondary vd-bonus-option${state}`}
                      disabled={!!progress.bonus}
                      aria-pressed={picked}
                      onClick={() => props.onMove((p) => answerBonus(puzzle, p, a.slot))}
                    >
                      <span className="vd-key">{SLOT_KEYS[a.slot]}</span> {a.name}
                      {progress.bonus && right && <Icon name="check" />}
                      {picked && !right && <Icon name="close" />}
                    </button>
                  );
                })}
            </div>
            {progress.bonus && (
              <p className="small">
                {result.bonus ? 'Bônus certo! ' : 'Bônus errado. '}
                Era <strong>{ability.name}</strong> ({SLOT_KEYS[ability.slot]}): {ability.description}
              </p>
            )}
          </section>
        </>
      )}
      <p className="small muted vd-source">Ícones, nomes e descrições das habilidades: valorant-api.com (Riot Games).</p>
    </div>
  );
}

// --- Mapa ------------------------------------------------------------------------------------------------------------

const ZOOM = [3.6, 2.8, 2.1, 1.6, 1.25];

function mapOptions(data: ClassicData): Option[] {
  return data.places.length
    ? [...new Set(data.places.map((p) => p.map))].map((id) => data.mapById.get(id)!).map((m) => ({ id: m.id, label: m.name, aliases: [m.id] }))
    : data.maps.map((m) => ({ id: m.id, label: m.name, aliases: [m.id] }));
}

/** The screenshot's URL: at once from public/, or after the lazy chunk of a VITE_INLINE_PLACES build. */
function usePlaceImage(file: string): { src: string | null; failed: boolean; onError: () => void } {
  const [loaded, setLoaded] = useState<{ file: string; src: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const now = placeImageNow(file);
  useEffect(() => {
    if (now) return;
    let live = true;
    void loadPlaceImage(file).then((src) => live && setLoaded({ file, src }));
    return () => {
      live = false;
    };
  }, [file, now]);
  return { src: now ?? (loaded?.file === file ? loaded.src : null), failed: failed === file, onError: () => setFailed(file) };
}

/** Mid-range of the distance feedback of "Onde é?" (minimap fractions), as in the Callout game. */
const NEAR = 0.18;

export function MapaGame(props: GameProps<'mapa'>) {
  const { puzzle, progress, done, data } = props;
  const { note, play } = useGuess(props);
  const options = useMemo(() => mapOptions(data), [data]);
  const miss = misses(puzzle, progress);
  const max = VALDLE_GAMES.mapa.maxTries;
  const stepOne = mapaStepOneDone(puzzle, progress);
  const zoom = stepOne ? 1 : ZOOM[Math.min(miss, ZOOM.length - 1)]!;
  const place = data.placeById.get(`${puzzle.map}:${puzzle.place}`);
  const map = data.mapById.get(puzzle.map)!;
  const answer = map.callouts.find((c) => c.id === puzzle.place);
  const image = usePlaceImage(place?.file ?? '');
  const result = resultOf(puzzle, progress);
  const mapWon = progress.guesses.includes(puzzle.map);
  // Names only as each step ends: the map after step 1, the callout (and the wiki file page) at the very end.
  const alt = done && answer ? `${calloutLabel(answer)}, em ${map.name}` : stepOne ? `Lugar de ${map.name}` : 'Lugar de um mapa';
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Que mapa é este? A imagem começa bem ampliada e se afasta a cada erro. Depois, no <strong>Onde é?</strong>, marque no esquema do mapa o lugar que ela
        mostra.
      </p>
      {stepOne && <MissList items={progress.guesses.map((id) => ({ id, label: mapLabel(id), hit: id === puzzle.map }))} />}
      {stepOne && !done && (
        <p className={`daily-feedback ${mapWon ? 'hit' : 'miss'}`} role="status">
          <Icon name={mapWon ? 'check' : 'close'} /> {mapWon ? `Acertou: é ${map.name}.` : `O mapa era ${map.name}.`} Agora, onde é?
        </p>
      )}
      <div className={`vd-mapa-board${stepOne ? ' two' : ''}`}>
        <div className="vd-map-stage">
          {image.src && !image.failed ? (
            <img
              src={image.src}
              alt={alt}
              width={960}
              height={540}
              decoding="async"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: `${puzzle.focus.x * 100}% ${puzzle.focus.y * 100}%`,
                filter: !stepOne && miss === 0 ? 'grayscale(1)' : undefined,
              }}
              onError={image.onError}
            />
          ) : (
            <span className="vd-map-missing small muted">{image.failed ? 'Imagem indisponível agora.' : 'Carregando a imagem…'}</span>
          )}
          {!stepOne && <span className="vd-zoom-tag">{pt(zoom, 1)}x</span>}
        </div>
        {stepOne && answer && <WherePicker key={puzzle.id} map={map} answer={answer} progress={progress} done={done} onMove={props.onMove} puzzle={puzzle} />}
      </div>
      {!stepOne && (
        <>
          <MissList items={progress.guesses.map((id) => ({ id, label: mapLabel(id), hit: id === puzzle.map }))} />
          <TryCounter used={progress.guesses.length} max={max} />
          <OptionSearch options={options} exclude={new Set(progress.guesses)} onPick={(o) => play(o.id, o.label)} label="Qual é o mapa?" placeholder="Digite um mapa" showAllOnFocus />
          <Note text={note} />
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && answer && (
        <Reveal won={result.won && (result.place ?? 0) > 0} kicker={result.won ? 'Faltou o lugar: era' : 'O lugar era'}>
          <span>
            <span className="daily-reveal-name">{calloutLabel(answer)}</span>
            <span className="small muted">
              Em inglês: {calloutLabelEn(answer)} · {map.name} · {mapaSummary(result, false)}
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">
        Imagem: VALORANT Wiki (wiki.playvalorant.com), Riot Games
        {done && place && (
          <>
            {' '}
            (
            <a href={place.source} target="_blank" rel="noreferrer">
              página do arquivo
            </a>
            )
          </>
        )}
        . Esquema e callouts: valorant-api.com (minimapa da Riot Games quando carrega).
      </p>
    </div>
  );
}

/** Callout ids in reading order (top to bottom, then left to right): "Área N" numbers that say nothing of the names. */
function areaNumbers(map: ClassicMap): Map<string, number> {
  const order = [...map.callouts].sort((a, b) => Math.round(a.y * 12) - Math.round(b.y * 12) || a.x - b.x);
  return new Map(order.map((c, i) => [c.id, i + 1]));
}

const ARROWS: Record<string, { x: number; y: number }> = { ArrowRight: { x: 1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, ArrowDown: { x: 0, y: 1 }, ArrowUp: { x: 0, y: -1 } };

/** The cell nearest to `from` in the arrow's direction (within a 60° cone each side), or null. */
function step(map: ClassicMap, from: ClassicCallout, dir: { x: number; y: number }): ClassicCallout | null {
  let best: ClassicCallout | null = null;
  let bestScore = Infinity;
  for (const c of map.callouts) {
    if (c === from) continue;
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const along = dx * dir.x + dy * dir.y;
    const across = Math.abs(dx * dir.y - dy * dir.x);
    if (along <= 0 || across > along * 1.8) continue;
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

const regionName = (c: ClassicCallout) => (['A', 'B', 'C'].includes(c.superRegionEn) ? `região ${c.superRegion}` : c.superRegion.replace(/^no /, '').toLowerCase());

/**
 * Step 2 of Mapa: the unlabeled schema of the map (Voronoi cells, as in the Callout game). Tap or click a cell, or
 * move with the arrow keys, then confirm. Misses say only "mesma região/outra região" and "perto/longe"; no cell is
 * ever named except the answer, and only at the end.
 */
function WherePicker({
  puzzle,
  map,
  answer,
  progress,
  done,
  onMove,
}: {
  puzzle: ValdlePuzzle<'mapa'>;
  map: ClassicMap;
  answer: ClassicCallout;
  progress: ValdleProgress;
  done: boolean;
  onMove: (fn: (p: ValdleProgress) => ValdleProgress) => void;
}) {
  const cells = useMemo(() => voronoiCells(map.callouts), [map]);
  const numbers = useMemo(() => areaNumbers(map), [map]);
  const [minimapOk, setMinimapOk] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const spots = progress.spots ?? [];
  const byId = useMemo(() => new Map(map.callouts.map((c) => [c.id, c])), [map]);
  const sel = selected ? byId.get(selected) : undefined;
  const S = 1000;
  const path = (poly: readonly { x: number; y: number }[]) => `M${poly.map((p) => `${(p.x * S).toFixed(1)},${(p.y * S).toFixed(1)}`).join('L')}Z`;
  const supers = [...new Set(map.callouts.map((c) => c.superRegionEn))].filter((s) => SUPER_CLASS[s]);
  const found = spots.includes(answer.id);

  const choose = (id: string) => {
    if (done) return;
    setNote(spots.includes(id) ? `Você já marcou a área ${numbers.get(id)}.` : null);
    setSelected(id);
  };
  const confirm = () => {
    if (!selected || done) return;
    const r = guessSpot(puzzle, progress, selected);
    if (r.outcome === 'repeat') setNote(`Você já marcou a área ${numbers.get(selected)}.`);
    if (r.outcome === 'hit' || r.outcome === 'miss') {
      setNote(null);
      setSelected(null);
      onMove(() => r.progress);
    }
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (done) return;
    const dir = ARROWS[e.key];
    if (dir) {
      e.preventDefault();
      const from = sel ?? [...map.callouts].sort((a, b) => Math.hypot(a.x - 0.5, a.y - 0.5) - Math.hypot(b.x - 0.5, b.y - 0.5))[0]!;
      const next = sel ? step(map, from, dir) : from;
      if (next) choose(next.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      confirm();
    }
  };
  const selCell = sel ? cells[map.callouts.indexOf(sel)] : undefined;
  const selCenter = selCell ? centroid(selCell) : null;
  return (
    <section className="vd-where" aria-labelledby="vd-where-title">
      <h3 id="vd-where-title" className="vd-where-title">
        <Icon name="target" /> Onde é?
      </h3>
      <p className="small muted vd-where-rule">
        {done
          ? found
            ? 'Achou o lugar.'
            : 'O lugar está destacado no esquema.'
          : `Toque na área do esquema onde a imagem foi tirada e confirme (ou use as setas e Enter). ${MAPA_SPOT_TRIES} tentativas; cada erro diz se é a mesma região e se está perto.`}
      </p>
      <div className="vd-callout-stage vd-where-stage">
        <svg
          viewBox={`0 0 ${S} ${S}`}
          role="group"
          aria-label={done ? `Esquema de ${map.name}` : `Esquema de ${map.name}: setas escolhem uma área, Enter marca`}
          tabIndex={done ? undefined : 0}
          onKeyDown={onKeyDown}
          className={done ? undefined : 'vd-where-live'}
        >
          {minimapOk && <image href={map.minimap} x={0} y={0} width={S} height={S} opacity={0.5} onError={() => setMinimapOk(false)} />}
          {map.callouts.map((c, i) => {
            const isAnswer = done && c.id === answer.id;
            const missed = spots.includes(c.id) && c.id !== answer.id;
            const cls = `vd-cc ${SUPER_CLASS[c.superRegionEn] ?? 'spawn'}${isAnswer ? ' answer' : ''}${missed ? ' missed' : ''}${c.id === selected && !done ? ' selected' : ''}`;
            return <path key={c.id} d={path(cells[i]!)} className={cls} onClick={() => choose(c.id)} />;
          })}
          {supers.map((s) => {
            const pts = map.callouts.filter((c) => c.superRegionEn === s);
            const cx = pts.reduce((t, c) => t + c.x, 0) / pts.length;
            const cy = pts.reduce((t, c) => t + c.y, 0) / pts.length;
            return (
              <text key={s} x={cx * S} y={cy * S} className="vd-cc-super" textAnchor="middle" dominantBaseline="middle">
                {s === 'Mid' ? 'MEIO' : s}
              </text>
            );
          })}
          {selCell && !done && <path d={path(selCell)} className="vd-where-outline" />}
          {selCenter && !done && (
            <text x={selCenter.x * S} y={selCenter.y * S} className="vd-where-n" textAnchor="middle" dominantBaseline="middle">
              {numbers.get(selected!)}
            </text>
          )}
          {/* Only the answer is ever named, and only at the end: naming other cells would teach the map. */}
          {done && (
            <g className="vd-cc-label answer">
              <circle cx={answer.x * S} cy={answer.y * S} r={16} className="vd-cc-pin" />
              <text
                x={Math.min(0.86, Math.max(0.14, answer.x)) * S}
                y={Math.min(0.96, Math.max(0.04, answer.y + 0.044)) * S}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {calloutLabel(answer)}
              </text>
            </g>
          )}
        </svg>
      </div>
      <p className="sr-only" aria-live="polite">
        {sel && !done ? `Área ${numbers.get(sel.id)} de ${map.callouts.length}, ${regionName(sel)}.` : ''}
      </p>
      <MissList
        items={spots.map((id) => {
          const c = byId.get(id);
          const hit = id === answer.id;
          const same = c?.superRegionEn === answer.superRegionEn;
          const near = c ? Math.hypot(c.x - answer.x, c.y - answer.y) < NEAR : false;
          return {
            id,
            label: `Área ${numbers.get(id) ?? '?'}`,
            hit,
            ...(hit || !c
              ? {}
              : {
                  hint: (
                    <>
                      <span className={same ? 'same' : 'diff'}>{same ? 'mesma região' : 'outra região'}</span>
                      <span className={near ? 'same' : 'diff'}>{near ? 'perto' : 'longe'}</span>
                    </>
                  ),
                }),
          };
        })}
      />
      {!done && (
        <>
          <TryCounter used={spots.length} max={MAPA_SPOT_TRIES} />
          <div className="vd-where-actions">
            <button type="button" className="primary" disabled={!selected || spots.includes(selected)} onClick={confirm}>
              <Icon name="target" /> {selected ? `Marcar a área ${numbers.get(selected)}` : 'Escolha uma área'}
            </button>
          </div>
          <Note text={note} />
          <GiveUp onGiveUp={() => onMove(giveUp)} note="Desistir encerra o Onde é? sem o lugar." />
        </>
      )}
    </section>
  );
}

// --- Callout ---------------------------------------------------------------------------------------------------------

const SUPER_CLASS: Record<string, string> = { A: 'a', B: 'b', C: 'c', Mid: 'mid' };

export function CalloutGame(props: GameProps<'callout'>) {
  const { puzzle, progress, done, data } = props;
  const { note, play } = useGuess(props);
  const map = data.mapById.get(puzzle.map)!;
  const answer = map.callouts.find((c) => c.id === puzzle.callout)!;
  const options = useMemo(
    () => map.callouts.map((c) => ({ id: c.id, label: calloutLabel(c), aliases: [calloutLabelEn(c), c.regionEn, c.region], sub: calloutLabelEn(c) })),
    [map],
  );
  const cells = useMemo(() => voronoiCells(map.callouts), [map]);
  const [minimapOk, setMinimapOk] = useState(true);
  const max = VALDLE_GAMES.callout.maxTries;
  const result = resultOf(puzzle, progress);
  const S = 1000;
  const path = (poly: readonly { x: number; y: number }[]) => `M${poly.map((p) => `${(p.x * S).toFixed(1)},${(p.y * S).toFixed(1)}`).join('L')}Z`;
  const supers = [...new Set(map.callouts.map((c) => c.superRegionEn))].filter((s) => SUPER_CLASS[s]);
  const guessed = new Set(progress.guesses);
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Em <strong>{map.name}</strong>: qual é o callout destacado? Cada área do esquema é a parte do mapa mais perto de um callout. Vale o nome em português
        ou em inglês.
      </p>
      <div className="vd-callout-stage">
        <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Esquema de ${map.name} com um callout destacado`}>
          {minimapOk && (
            <image href={map.minimap} x={0} y={0} width={S} height={S} opacity={0.5} onError={() => setMinimapOk(false)} />
          )}
          {map.callouts.map((c, i) => {
            const isAnswer = c.id === answer.id;
            const cls = `vd-cc ${SUPER_CLASS[c.superRegionEn] ?? 'spawn'}${isAnswer ? ' answer' : ''}`;
            return <path key={c.id} d={path(cells[i]!)} className={cls} />;
          })}
          {supers.map((s) => {
            const pts = map.callouts.filter((c) => c.superRegionEn === s);
            const cx = pts.reduce((t, c) => t + c.x, 0) / pts.length;
            const cy = pts.reduce((t, c) => t + c.y, 0) / pts.length;
            return (
              <text key={s} x={cx * S} y={cy * S} className="vd-cc-super" textAnchor="middle" dominantBaseline="middle">
                {s === 'Mid' ? 'MEIO' : s}
              </text>
            );
          })}
          {/* Only the asked callout is ever named or pinned: labelling the other cells (or the wrong guesses) would teach
              the map and give away later puzzles on the same map. */}
          <g className="vd-cc-label answer">
            <circle cx={answer.x * S} cy={answer.y * S} r={16} className="vd-cc-pin" />
            {done && (
              <text
                x={Math.min(0.86, Math.max(0.14, answer.x)) * S}
                y={Math.min(0.96, Math.max(0.04, answer.y + 0.044)) * S}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {calloutLabel(answer)}
              </text>
            )}
          </g>
        </svg>
      </div>
      <MissList
        items={progress.guesses.map((id) => {
          const c = map.callouts.find((x) => x.id === id);
          const hit = id === answer.id;
          const same = c?.superRegionEn === answer.superRegionEn;
          const near = c ? Math.hypot(c.x - answer.x, c.y - answer.y) < 0.18 : false;
          return {
            id,
            label: c ? calloutLabel(c) : id,
            hit,
            ...(hit || !c
              ? {}
              : {
                  hint: (
                    <>
                      <span className={same ? 'same' : 'diff'}>{same ? 'mesma área' : 'outra área'}</span>
                      <span className={near ? 'same' : 'diff'}>{near ? 'perto' : 'longe'}</span>
                    </>
                  ),
                }),
          };
        })}
      />
      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={max} />
          <OptionSearch options={options} exclude={guessed} onPick={(o) => play(o.id, o.label)} label="Qual é o callout?" placeholder="Digite um callout" showAllOnFocus />
          <Note text={note} />
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <Reveal won={result.won} kicker="O callout era">
          <span>
            <span className="daily-reveal-name">{calloutLabel(answer)}</span>
            <span className="small muted">
              Em inglês: {calloutLabelEn(answer)} · {map.name}
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">Callouts e posições: valorant-api.com (minimapa da Riot Games quando carrega; o esquema sai só dos pontos da API).</p>
    </div>
  );
}

// --- Arma ------------------------------------------------------------------------------------------------------------

function weaponValue(key: string, w: ClassicWeapon) {
  switch (key) {
    case 'category':
      return WEAPON_CATEGORY_LABELS[w.category];
    case 'cost':
      return w.cost === 0 ? 'Grátis' : pt(w.cost);
    case 'head':
      return pt(w.headDamage, 1);
    case 'rate':
      return `${pt(w.fireRate, 2)}/s`;
    case 'mag':
      return w.magazine;
    case 'pen':
      return PENETRATION_LABELS[w.penetration];
    default:
      return yesNo(w.automatic);
  }
}

export function ArmaGame(props: GameProps<'arma'>) {
  const { puzzle, progress, done, data } = props;
  const { note, play } = useGuess(props);
  const answer = data.weaponById.get(puzzle.answer)!;
  const options = useMemo(() => data.weapons.map((w) => ({ id: w.id, label: w.name, sub: WEAPON_CATEGORY_LABELS[w.category] })), [data]);
  const max = VALDLE_GAMES.arma.maxTries;
  const [iconOk, setIconOk] = useState(true);
  return (
    <div className="vd-game">
      <p className="daily-rule">Qual é a arma? Cada palpite compara categoria, preço, dano na cabeça (primeira faixa de distância), cadência, pente, penetração e modo de tiro.</p>
      <MarkLegend />
      {progress.guesses.length > 0 && (
        <ol className="vd-rows" aria-label="Seus palpites">
          {progress.guesses.map((id, i) => {
            const g = data.weaponById.get(id);
            if (!g) return null;
            const fb = compareAll(WEAPON_COLUMNS, g, answer);
            return (
              <AttrRow
                key={id}
                n={i + 1}
                hit={id === answer.id}
                head={<strong>{g.name}</strong>}
                cells={WEAPON_COLUMNS.map((c, k) => (
                  <AttrCell key={c.key} label={c.label} value={weaponValue(c.key, g)} feedback={fb[k]!} />
                ))}
              />
            );
          })}
        </ol>
      )}
      {!done && (
        <>
          <TryCounter used={progress.guesses.length} max={max} />
          <OptionSearch options={options} exclude={new Set(progress.guesses)} onPick={(o) => play(o.id, o.label)} label="Qual é a arma?" placeholder="Digite uma arma" showAllOnFocus />
          <Note text={note} />
          <GiveUp onGiveUp={() => props.onMove(giveUp)} />
        </>
      )}
      {done && (
        <Reveal won={resultOf(puzzle, progress).won} kicker="A arma era">
          {iconOk && <img className="vd-weapon-icon" src={answer.icon} alt="" width={200} height={60} decoding="async" onError={() => setIconOk(false)} />}
          <span>
            <span className="daily-reveal-name">{answer.name}</span>
            <span className="small muted">
              {WEAPON_CATEGORY_LABELS[answer.category]} · {answer.cost === 0 ? 'grátis' : `${pt(answer.cost)} créditos`} · {pt(answer.headDamage, 1)} na cabeça /{' '}
              {pt(answer.bodyDamage, 1)} no corpo
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">Preços e números das armas: valorant-api.com (dados do jogo; automática = sem modo de tiro informado pela API).</p>
    </div>
  );
}
