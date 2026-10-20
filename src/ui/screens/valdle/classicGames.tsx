import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABELS } from '../../../game/explain';
import {
  ABILITY_TILES,
  AGENT_COLUMNS,
  CONTINENT_LABELS,
  PENETRATION_LABELS,
  SLOT_KEYS,
  WEAPON_CATEGORY_LABELS,
  WEAPON_COLUMNS,
  abilityTiles,
  calloutLabel,
  calloutLabelEn,
  type ClassicAgent,
  type ClassicData,
  type ClassicWeapon,
} from '../../../game/valdle/classic';
import { compareAll } from '../../../game/valdle/feedback';
import { VALDLE_GAMES } from '../../../game/valdle/games';
import { spreadLabels, type Pt } from '../../../game/valdle/geometry';
import { mapaView, type MapaView } from '../../../game/valdle/mapaView';
import {
  MAPA_SPOT_TRIES,
  answerBonus,
  giveUp,
  guess,
  guessSpot,
  mapaSummary,
  misses,
  resultOf,
  type ValdleProgress,
  type ValdlePuzzle,
} from '../../../game/valdle/play';
import { loadPlaceImage, placeImageNow } from '../../../data/placeImages';
import { AgentIcon } from '../../components/GameImage';
import { countryName } from '../../components/CountryChip';
import { Icon } from '../../components/Icon';
import { loadChipLang, saveChipLang, type ChipLang } from '../../valdleStorage';
import { AttrCell, AttrRow, GiveUp, MarkLegend, MissList, OptionSearch, TryCounter, type Option } from './parts';
import { CalloutBoard } from './CalloutBoard';
import { useGameMedia, useMinimap } from './media';

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
  const agent = data.agentById.get(puzzle.agent)!;
  const ability = agent.abilities.find((a) => a.slot === puzzle.slot)!;
  const icon = useGameMedia('abilities', ability.icon);
  const imgFailed = !ability.icon || icon.failed;
  const options = useMemo(() => agentOptions(data), [data]);
  const miss = misses(puzzle, progress);
  const max = VALDLE_GAMES.habilidade.maxTries;
  const result = resultOf(puzzle, progress);
  const open = abilityTiles(puzzle, miss, done);
  const clues = [
    { at: 1, title: 'Função do agente', body: ROLE_LABELS[agent.role] },
    { at: 2, title: 'Descrição', body: maskNames(ability.description, [ability.name, ability.nameEn, agent.name, agent.id]) },
    { at: 3, title: 'Tecla', body: SLOT_KEYS[ability.slot] },
  ];
  const shownFrom = imgFailed ? 1 : 0; // without the image, the first clue opens at once
  return (
    <div className="vd-game">
      <p className="daily-rule">
        De qual agente é esta habilidade? O ícone está coberto por quadrados: um começa aberto e cada erro abre mais. As pistas também abrem a cada erro. No
        fim, um bônus: qual habilidade é.
      </p>
      {/* No name until the end: the label says only how many tiles are open. */}
      <div
        className="vd-ability-stage"
        role="img"
        aria-label={done ? `Ícone de ${ability.name}, de ${agent.name}` : `Ícone da habilidade, ${open.size} de ${ABILITY_TILES} quadrados abertos`}
      >
        {imgFailed ? (
          <span className="vd-ability-missing small muted">Imagem indisponível agora: jogue pelas pistas.</span>
        ) : (
          <span className="vd-ability-box">
            {icon.src && <img src={icon.src} alt="" width={128} height={128} decoding="async" onError={icon.onError} />}
            <span className="vd-tiles" aria-hidden="true">
              {Array.from({ length: ABILITY_TILES }, (_, i) => (
                <span key={i} className={`vd-tile${open.has(i) ? ' open' : ''}`} />
              ))}
            </span>
          </span>
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

/**
 * Mapa: step 1 ("Que mapa é?") shows the screenshot zoomed in on a point and one button per map with screenshots; a
 * wrong map turns red and the image backs away. Step 2 ("Onde é?") puts the screenshot behind the real minimap, with a
 * name chip on every callout: the player clicks the place's chip. Everything shown comes from mapaView (mapaView.ts),
 * which keeps the map out of the screen until step 1 is over and the place's name until the end.
 */
export function MapaGame(props: GameProps<'mapa'>) {
  const { puzzle, progress, data } = props;
  const view = mapaView(data, puzzle, progress);
  const image = usePlaceImage(view.image.file ?? '');
  const result = resultOf(puzzle, progress);
  const map = view.map;
  const pickMap = (id: string) => {
    const r = guess(puzzle, progress, id);
    if (r.outcome === 'hit' || r.outcome === 'miss') props.onMove(() => r.progress);
  };
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Que mapa é este? A imagem começa bem ampliada e se afasta a cada erro. Depois, no <strong>Onde é?</strong>, toque no nome do lugar que ela
        mostra, por cima do minimapa.
      </p>
      {view.step === 'map' ? (
        <>
          <div className="vd-map-stage">
            {image.src && !image.failed ? (
              <img
                src={image.src}
                alt={view.image.alt}
                width={960}
                height={540}
                decoding="async"
                style={{
                  transform: `scale(${view.image.zoom})`,
                  transformOrigin: `${view.image.focus.x * 100}% ${view.image.focus.y * 100}%`,
                  filter: view.image.grayscale ? 'grayscale(1)' : undefined,
                }}
                onError={image.onError}
              />
            ) : (
              <span className="vd-map-missing small muted">{image.failed ? 'Imagem indisponível agora.' : 'Carregando a imagem…'}</span>
            )}
            <span className="vd-zoom-tag">{pt(view.image.zoom, 1)}x</span>
          </div>
          <section className="vd-map-pick" aria-labelledby="vd-map-pick-title">
            <h3 id="vd-map-pick-title" className="vd-where-title">
              <Icon name="globe" /> Que mapa é?
            </h3>
            <TryCounter used={view.mapTries.used} max={view.mapTries.max} />
            <div className="vd-map-buttons">
              {view.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`vd-map-btn${c.state === 'miss' ? ' miss' : ''}`}
                  disabled={c.state !== 'open'}
                  aria-label={c.state === 'miss' ? `${c.name}: errado` : c.name}
                  onClick={() => pickMap(c.id)}
                >
                  {c.state === 'miss' && <Icon name="close" />}
                  {c.name}
                </button>
              ))}
            </div>
            <GiveUp onGiveUp={() => props.onMove(giveUp)} />
          </section>
        </>
      ) : (
        map && (
          <>
            <MissList items={view.mapGuesses.map((g) => ({ id: g.id, label: g.name, hit: g.hit }))} />
            {view.step === 'where' && (
              <p className={`daily-feedback ${map.won ? 'hit' : 'miss'}`} role="status">
                <Icon name={map.won ? 'check' : 'close'} /> {map.won ? `Acertou: é ${map.name}.` : `O mapa era ${map.name}.`} Agora, onde é?
              </p>
            )}
            <WhereStage key={puzzle.id} view={view} image={image} alt={view.image.alt} puzzle={puzzle} progress={progress} onMove={props.onMove} />
          </>
        )
      )}
      {view.answer && map && (
        <Reveal won={result.won && (result.place ?? 0) > 0} kicker={result.won ? 'Faltou o lugar: era' : 'O lugar era'}>
          <span>
            <span className="daily-reveal-name">{view.answer.pt}</span>
            <span className="small muted">
              Em inglês: {view.answer.en} · {map.name} · {mapaSummary(result, false)}
            </span>
          </span>
        </Reveal>
      )}
      <p className="small muted vd-source">
        Imagem: VALORANT Wiki (wiki.playvalorant.com), Riot Games
        {view.source && (
          <>
            {' '}
            (
            <a href={view.source} target="_blank" rel="noreferrer">
              página do arquivo
            </a>
            )
          </>
        )}
        . Minimapa e callouts: valorant-api.com (Riot Games).
      </p>
    </div>
  );
}

/** Below this stage width the chips draw the compact names (the full one stays in the aria-label). */
const WIDE_STAGE = 560;

/**
 * Step 2 of Mapa: the screenshot as the stage's background, the real minimap over it (semi-opaque; a dark panel while
 * it loads or without it) and one clickable chip per callout at its projected point, nudged apart so none overlaps and
 * all stay inside. "Esconder mapa" hides the overlay to see the whole screenshot; PT | EN switches the chip names.
 */
function WhereStage({
  view,
  image,
  alt,
  puzzle,
  progress,
  onMove,
}: {
  view: MapaView;
  image: { src: string | null; failed: boolean; onError: () => void };
  alt: string;
  puzzle: ValdlePuzzle<'mapa'>;
  progress: ValdleProgress;
  onMove: (fn: (p: ValdleProgress) => ValdleProgress) => void;
}) {
  const map = view.map!;
  const done = view.step === 'done';
  const minimap = useMinimap(map.minimap);
  const [lang, setLangState] = useState<ChipLang>(loadChipLang);
  const [showMap, setShowMap] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [width, setWidth] = useState(0);
  const [placed, setPlaced] = useState<{ key: string; pos: Pt[] } | null>(null);
  const setLang = (l: ChipLang) => {
    setLangState(l);
    saveChipLang(l);
  };
  const [fonts, setFonts] = useState(0);
  const wide = width >= WIDE_STAGE;
  const layoutKey = `${width}:${lang}:${showMap}:${fonts}`;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth));
    measure();
    // The chips are measured in the display font: lay them out again once it has loaded.
    let live = true;
    void document.fonts?.ready.then(() => live && setFonts((n) => n + 1));
    if (typeof ResizeObserver === 'undefined') return () => void (live = false);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (!showMap || !width) return;
    const sizes = view.chips.map((_, i) => {
      const el = chipRefs.current[i];
      return { w: el?.offsetWidth ?? 60, h: el?.offsetHeight ?? 28 };
    });
    const pos = spreadLabels(
      view.chips.map((c) => ({ x: c.x * width, y: c.y * width })),
      sizes,
      width,
      width,
    );
    setPlaced({ key: layoutKey, pos });
    // The chips' sizes depend only on the width (long or short names), the language and the font (layoutKey).
  }, [layoutKey]);

  const pick = (id: string) => {
    const r = guessSpot(puzzle, progress, id);
    if (r.outcome === 'repeat') setNote('Você já tentou esse lugar.');
    if (r.outcome === 'hit' || r.outcome === 'miss') {
      setNote(null);
      onMove(() => r.progress);
    }
  };
  const pos = placed?.key === layoutKey ? placed.pos : null;
  const nameOf = (c: { pt: string; en: string }) => (lang === 'en' ? c.en : c.pt);
  const stateText = { open: '', miss: ': errado', hit: ': certo', answer: ': era este' } as const;
  return (
    <section className="vd-where" aria-labelledby="vd-where-title">
      <h3 id="vd-where-title" className="vd-where-title">
        <Icon name="target" /> Onde é?
      </h3>
      <p className="small muted vd-where-rule">
        {done
          ? view.spots.some((s) => s.hit)
            ? 'Achou o lugar.'
            : 'O lugar está destacado no mapa.'
          : `Toque no nome do lugar onde a imagem foi tirada. ${MAPA_SPOT_TRIES} tentativas; cada erro diz se é a mesma região e se está perto. "Esconder mapa" mostra a imagem inteira.`}
      </p>
      <div className="vd-where-tools">
        <button type="button" role="switch" aria-checked={showMap} className={`vd-switch${showMap ? ' on' : ''}`} onClick={() => setShowMap((v) => !v)}>
          <span className="vd-switch-track" aria-hidden="true">
            <span className="vd-switch-knob" />
          </span>
          {showMap ? 'Esconder mapa' : 'Mostrar mapa'}
        </button>
        <span className="vd-lang" role="group" aria-label="Idioma dos nomes">
          <button type="button" className={lang === 'pt' ? 'on' : ''} aria-pressed={lang === 'pt'} onClick={() => setLang('pt')}>
            PT
          </button>
          <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            EN
          </button>
        </span>
      </div>
      <div ref={stageRef} className={`vd-where-board${showMap ? '' : ' photo'}`}>
        {image.src && !image.failed ? (
          <img className="vd-where-photo" src={image.src} alt={alt} width={960} height={540} decoding="async" onError={image.onError} />
        ) : (
          <span className="vd-map-missing small muted">{image.failed ? 'Imagem indisponível agora.' : 'Carregando a imagem…'}</span>
        )}
        {showMap && (
          <div className={`vd-where-overlay${minimap.status === 'ready' ? '' : ' plain'}`}>
            {minimap.status === 'ready' && <img className="vd-where-mm" src={minimap.src} alt="" width={1024} height={1024} decoding="async" />}
            <div className="vd-chips" role="group" aria-label={`Lugares de ${map.name}`}>
              {view.chips.map((c, i) => {
                const p = pos?.[i];
                const full = nameOf(c);
                const text = wide ? full : lang === 'en' ? c.enShort : c.ptShort;
                return (
                  <button
                    key={c.id}
                    ref={(el) => {
                      chipRefs.current[i] = el;
                    }}
                    type="button"
                    lang={lang === 'en' ? 'en' : undefined}
                    className={`vd-chip ${c.state}`}
                    // Placed by transform from the corner, so a chip's measured size never depends on where it sits.
                    style={{
                      transform: `translate(calc(${p ? p.x : c.x * width}px - 50%), calc(${p ? p.y : c.y * width}px - 50%))`,
                      visibility: p ? undefined : 'hidden',
                    }}
                    disabled={done || c.state !== 'open'}
                    aria-label={`${full}${stateText[c.state]}`}
                    title={full}
                    onClick={() => pick(c.id)}
                  >
                    {c.state === 'miss' && <Icon name="close" />}
                    {(c.state === 'hit' || c.state === 'answer') && <Icon name="check" />}
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <MissList
        items={view.spots.map((s) => ({
          id: s.id,
          label: nameOf(s),
          hit: s.hit,
          ...(s.hit
            ? {}
            : {
                hint: (
                  <>
                    <span className={s.sameRegion ? 'same' : 'diff'}>{s.sameRegion ? 'mesma região' : 'outra região'}</span>
                    <span className={s.near ? 'same' : 'diff'}>{s.near ? 'perto' : 'longe'}</span>
                  </>
                ),
              }),
        }))}
      />
      {!done && (
        <>
          <TryCounter used={view.spots.length} max={MAPA_SPOT_TRIES} />
          <Note text={note} />
          <GiveUp onGiveUp={() => onMove(giveUp)} note="Desistir encerra o Onde é? sem o lugar." />
        </>
      )}
    </section>
  );
}

// --- Callout ---------------------------------------------------------------------------------------------------------

export function CalloutGame(props: GameProps<'callout'>) {
  const { puzzle, progress, done, data } = props;
  const { note, play } = useGuess(props);
  const map = data.mapById.get(puzzle.map)!;
  const answer = map.callouts.find((c) => c.id === puzzle.callout)!;
  const options = useMemo(
    () => map.callouts.map((c) => ({ id: c.id, label: calloutLabel(c), aliases: [calloutLabelEn(c), c.regionEn, c.region], sub: calloutLabelEn(c) })),
    [map],
  );
  const max = VALDLE_GAMES.callout.maxTries;
  const result = resultOf(puzzle, progress);
  const guessed = new Set(progress.guesses);
  return (
    <div className="vd-game">
      <p className="daily-rule">
        Em <strong>{map.name}</strong>: qual é o callout destacado no minimapa? Vale o nome em português ou em inglês.
      </p>
      {/* Only the asked callout is ever highlighted or pinned, and named only at the end: marking the other areas (or the
          wrong guesses) would teach the map and give away later puzzles on the same map. */}
      <CalloutBoard map={map} answer={answer} showAnswer labelAnswer={done} ariaLabel={`Mapa de ${map.name} com um callout destacado`} />
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
      <p className="small muted vd-source">
        Minimapa, callouts e posições: valorant-api.com (Riot Games). Sem o minimapa, o jogo mostra um esquema: a área de cada callout é a parte do mapa mais
        perto do seu ponto.
      </p>
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
  const icon = useGameMedia('weapons', answer.icon);
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
          {icon.src && <img className="vd-weapon-icon" src={icon.src} alt="" width={200} height={60} decoding="async" onError={icon.onError} />}
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
