import type { ReactNode } from 'react';
import type { DraftMode } from '../../engine/draft';
import { MODE_LABELS } from '../../game/labels';
import { DIFFICULTY_LABELS, DIFFICULTY_SETTINGS, type Difficulty } from '../../game/difficulty';
import { DailyHomeCard } from '../components/DailyHomeCard';
import { DifficultyPicker } from '../components/Difficulty';
import { Emblem } from '../components/Emblem';
import { Icon } from '../components/Icon';

/**
 * The home page. Free of game code: the shell (src/ui/App.tsx) shows it while the card pool loads, with `ready` false
 * (mode buttons waiting, placeholders for the art, the counts and the "Continuar" cards), then the game shows it ready.
 */
interface Props {
  /** False while the card pool loads. */
  ready: boolean;
  /** "Continuar" cards, built by the game (it reads the saves); null while loading or with nothing saved. */
  continueCards: ReactNode | null;
  /** Saved games found before loading: placeholders keep the space of their "Continuar" cards. */
  pendingSaves: number;
  /** A saved run / season that a new game would replace. */
  hasRun: boolean;
  hasSeason: boolean;
  hasCareer: boolean;
  /** Real player photos fanned on the Draft clássico card (./HomeExtras.tsx); null while loading. */
  fanArt: ReactNode | null;
  onNew: (mode: DraftMode) => void;
  onNewSeason: () => void;
  /** Opens the career's "found your org" screen (a saved career is replaced only when the new org is founded). */
  onNewCareer: () => void;
  /** Finished runs in the history; null while loading. */
  historyCount: number | null;
  onHistory: () => void;
  onHowTo: () => void;
  onRanking: () => void;
  /** Difficulty of the next game started here (remembered between visits). */
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  /** Opens the Daily ("Diário"); absent while the game loads (the card shows today's progress anyway). */
  onDaily?: () => void;
}

export function Home({
  ready,
  continueCards,
  pendingSaves,
  hasRun,
  hasSeason,
  hasCareer,
  fanArt,
  onNew,
  onNewSeason,
  onNewCareer,
  historyCount,
  onHistory,
  onHowTo,
  onRanking,
  difficulty,
  onDifficulty,
  onDaily,
}: Props) {
  return (
    <div className="screen home" aria-busy={!ready}>
      <section className="hero">
        <Emblem size={84} className="hero-emblem" />
        <h1 className="title">
          Você consegue vencer o <em>Champions?</em>
        </h1>
        <p className="pitch">Monte o dream team de todas as eras do VCT.</p>
      </section>

      {continueCards ? (
        <section className="continue" aria-labelledby="continue-title">
          <h2 id="continue-title" className="section-label">
            Continuar
          </h2>
          <div className="continue-list">{continueCards}</div>
        </section>
      ) : (
        !ready &&
        pendingSaves > 0 && (
          <section className="continue" aria-label="Continuar (carregando)">
            <h2 className="section-label">Continuar</h2>
            <div className="continue-list">
              {Array.from({ length: pendingSaves }, (_, i) => (
                <span key={i} className="continue-card skeleton" aria-hidden="true">
                  <Icon name="play" className="continue-icon" />
                  <span className="continue-text">
                    <span className="skeleton-line" />
                    <span className="skeleton-line short" />
                  </span>
                </span>
              ))}
            </div>
          </section>
        )
      )}

      <DailyHomeCard onOpen={onDaily} />

      <section className="modes" aria-labelledby="modes-title">
        <h2 id="modes-title" className="section-label">
          Escolha o seu modo
        </h2>
        <DifficultyPicker value={difficulty} onChange={onDifficulty} />
        {!ready && (
          <p className="sr-only" role="status">
            Carregando os cards dos jogadores…
          </p>
        )}
        <ul className="mode-list">
          <ModeCard
            id="classic"
            name={MODE_LABELS.classic}
            text={`Roleta de time + evento: escolha 1 jogador por giro. ${rerollsText(difficulty)}.`}
            art={fanArt ?? <BlankFan />}
            replaces={hasRun}
            ready={ready}
            onPlay={() => onNew('classic')}
          />
          <ModeCard
            id="ultimate"
            name={MODE_LABELS.ultimate}
            text="5 opções fixas por pick, sem reroll. Pura leitura de draft."
            art={<BlindCardArt />}
            replaces={hasRun}
            ready={ready}
            onPlay={() => onNew('ultimate')}
          />
          <ModeCard
            id="trials"
            name="Complete Trials"
            text="Escolha o servidor, vença a liga regional, o Masters e o Champions."
            art={<GlobeArt />}
            replaces={hasSeason}
            ready={ready}
            onPlay={onNewSeason}
          />
          <ModeCard
            id="career"
            name="Carreira"
            text="Funde a sua org e jogue temporada após temporada: contratos, mercado, patrocínios, base e scrims."
            art={<CareerArt />}
            replaces={hasCareer}
            ready={ready}
            onPlay={onNewCareer}
            cta="Fundar org"
          />
        </ul>
      </section>

      <div className="side-cards">
        <button type="button" className="pill-card" onClick={onHistory}>
          <Icon name="history" className="pill-icon" />
          <span className="pill-text">
            <strong>Histórico</strong>
            <span className="small muted">
              {!historyCount
                ? 'Suas runs terminadas, com as estatísticas dos jogadores.'
                : `${historyCount} run${historyCount === 1 ? '' : 's'} terminada${historyCount === 1 ? '' : 's'}`}
            </span>
          </span>
          <span className="pill-go">Ver</span>
        </button>
        <button type="button" className="pill-card" onClick={onRanking}>
          <Icon name="podium" className="pill-icon" />
          <span className="pill-text">
            <strong>Ranking</strong>
            <span className="small muted">Os maiores OVRs de todos os tempos e de cada ano.</span>
          </span>
          <span className="pill-go">Ver</span>
        </button>
        <button type="button" className="pill-card" onClick={onHowTo}>
          <Icon name="help" className="pill-icon" />
          <span className="pill-text">
            <strong>Como jogar</strong>
            <span className="small muted">Draft, IGL, veto e partidas em oito passos.</span>
          </span>
          <span className="pill-go">Ler</span>
        </button>
      </div>
    </div>
  );
}

function ModeCard({
  id,
  name,
  text,
  art,
  replaces,
  ready,
  onPlay,
  cta = 'Jogar',
}: {
  id: string;
  name: string;
  text: string;
  art: ReactNode;
  replaces: boolean;
  ready: boolean;
  onPlay: () => void;
  cta?: string;
}) {
  return (
    <li className={`mode-card mode-${id}`}>
      <span className="mode-art" aria-hidden="true">
        {art}
      </span>
      <h3 id={`mode-${id}`} className="mode-name">
        {name}
      </h3>
      <p id={`mode-${id}-text`} className="mode-text">
        {text}
      </p>
      {replaces && (
        <p className="mode-warn small">
          {id === 'career' ? 'Fundar uma org substitui a carreira salva.' : `Substitui a ${id === 'trials' ? 'temporada' : 'run'} salva.`}
        </p>
      )}
      <button
        type="button"
        className="primary play"
        aria-describedby={`mode-${id}-text`}
        aria-label={ready ? `${cta}: ${name}` : `${cta}: ${name} (carregando)`}
        disabled={!ready}
        onClick={onPlay}
      >
        {ready ? (
          cta
        ) : (
          <>
            <span className="spinner" aria-hidden="true" /> Carregando
          </>
        )}
      </button>
    </li>
  );
}

/** Blank cards in the place of the fanned photos while the pool loads. */
function BlankFan() {
  return (
    <span className="fan">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`fan-card fan-${i} fan-blank`} />
      ))}
    </span>
  );
}

/** A face-down, locked card: five fixed options, no rerolls. */
function BlindCardArt() {
  return (
    <svg className="mode-svg" viewBox="0 0 160 110" focusable="false">
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        </pattern>
      </defs>
      <rect x="34" y="14" width="56" height="80" rx="6" transform="rotate(-10 62 54)" fill="#1a2632" stroke="rgba(255,255,255,0.18)" />
      <rect x="70" y="14" width="56" height="80" rx="6" transform="rotate(10 98 54)" fill="#1a2632" stroke="rgba(255,255,255,0.18)" />
      <rect x="52" y="8" width="56" height="84" rx="6" fill="#223140" stroke="var(--accent)" strokeWidth="2" />
      <rect x="52" y="8" width="56" height="84" rx="6" fill="url(#hatch)" />
      <path d="M72 50v-7a8 8 0 0116 0v7" fill="none" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
      <rect x="68" y="50" width="24" height="18" rx="3" fill="var(--accent)" />
      <circle cx="80" cy="59" r="2.5" fill="#1a1206" />
    </svg>
  );
}

/** A shield with the org's tag over a rising season line: found your org, play season after season. */
function CareerArt() {
  return (
    <svg className="mode-svg" viewBox="0 0 160 110" focusable="false">
      <path d="M14 92h132" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <path d="M18 86l28-10 26 4 28-18 26-6 18-14" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5" />
      {[
        [46, 76],
        [72, 80],
        [100, 62],
        [126, 56],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3.5" fill="var(--gold)" stroke="#0f1923" strokeWidth="1.5" />
      ))}
      <path d="M80 10l26 8v22c0 17-11 27-26 33-15-6-26-16-26-33V18z" fill="#1a2632" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M67 24h26" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <text x="80" y="52" textAnchor="middle" fill="var(--text)" fontSize="17" fontWeight="900" fontStyle="italic" fontFamily="'Barlow Condensed', sans-serif">
        ORG
      </text>
    </svg>
  );
}

/** A globe with the four servers. */
function GlobeArt() {
  const pins = [
    { x: 46, y: 46, label: 'AMER' },
    { x: 84, y: 36, label: 'EMEA' },
    { x: 112, y: 60, label: 'PAC' },
    { x: 104, y: 34, label: 'CN' },
  ];
  return (
    <svg className="mode-svg" viewBox="0 0 160 110" focusable="false">
      <g fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5">
        <circle cx="80" cy="55" r="46" />
        <ellipse cx="80" cy="55" rx="20" ry="46" />
        <ellipse cx="80" cy="55" rx="38" ry="46" />
        <path d="M34 55h92M40 32h80M40 78h80" />
      </g>
      <circle cx="80" cy="55" r="46" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 6" />
      {pins.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="5" fill="var(--accent)" stroke="#0f1923" strokeWidth="2" />
          <text x={p.x} y={p.y - 9} textAnchor="middle" fill="var(--text)" fontSize="10" fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** "3 rerolls no Normal": the classic draft's rerolls at the chosen difficulty. */
function rerollsText(d: Difficulty): string {
  const n = DIFFICULTY_SETTINGS[d].rerolls;
  return `${n} reroll${n === 1 ? '' : 's'} no ${DIFFICULTY_LABELS[d].name}`;
}
