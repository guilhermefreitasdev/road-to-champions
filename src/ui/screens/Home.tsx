import { useMemo, type ReactNode } from 'react';
import { playerMedia } from '../../data/media';
import type { Card } from '../../engine/types';
import type { DraftMode, RunState } from '../../game/run';
import { MODE_LABELS, RUN_POOL } from '../../game/run';
import { REGION_LABELS, STAGE_LABELS, isCompStage, type SeasonState } from '../../game/season';
import { Emblem } from '../components/Emblem';
import { Icon } from '../components/Icon';
import { PlayerPhoto } from '../components/PlayerPhoto';

interface Props {
  saved: RunState | null;
  savedSeason: SeasonState | null;
  onNew: (mode: DraftMode) => void;
  onContinue: () => void;
  onNewSeason: () => void;
  onContinueSeason: () => void;
  /** Finished runs in the history. */
  historyCount: number;
  onHistory: () => void;
  onHowTo: () => void;
}

/** Players fanned on the Draft clássico card (first card of each with a photo; any missing one is skipped). */
const FEATURED = ['aspas', 'Derke', 'TenZ', 'Demon1', 'yay', 'Less'];

function featuredCards(): Card[] {
  const out: Card[] = [];
  for (const handle of FEATURED) {
    if (out.length === 3) break;
    for (const entry of RUN_POOL) {
      const card = entry.cards.find((c) => c.handle === handle && playerMedia(c.playerId, c.eventId));
      if (card) {
        out.push(card);
        break;
      }
    }
  }
  return out;
}

export function Home({ saved, savedSeason, onNew, onContinue, onNewSeason, onContinueSeason, historyCount, onHistory, onHowTo }: Props) {
  const featured = useMemo(featuredCards, []);
  return (
    <div className="screen home">
      <section className="hero">
        <Emblem size={84} className="hero-emblem" />
        <h1 className="title">
          Você consegue vencer o <em>Champions?</em>
        </h1>
        <p className="pitch">Monte o dream team de todas as eras do VCT.</p>
      </section>

      {(saved || savedSeason) && (
        <section className="continue" aria-labelledby="continue-title">
          <h2 id="continue-title" className="section-label">
            Continuar
          </h2>
          <div className="continue-list">
            {saved && (
              <button type="button" className="continue-card" onClick={onContinue}>
                <Icon name="play" className="continue-icon" />
                <span className="continue-text">
                  <strong>{MODE_LABELS[saved.mode]}</strong>
                  <span className="small muted">
                    {saved.teamName ? `${saved.teamName} · ` : ''}
                    {phaseText(saved)}
                  </span>
                </span>
                <span className="continue-go">Continuar run</span>
              </button>
            )}
            {savedSeason && (
              <button type="button" className="continue-card" onClick={onContinueSeason}>
                <Icon name="play" className="continue-icon" />
                <span className="continue-text">
                  <strong>Complete Trials{savedSeason.region ? ` · ${REGION_LABELS[savedSeason.region]}` : ''}</strong>
                  <span className="small muted">
                    {savedSeason.teamName ? `${savedSeason.teamName} · ` : ''}
                    {seasonText(savedSeason)}
                  </span>
                </span>
                <span className="continue-go">Continuar temporada</span>
              </button>
            )}
          </div>
        </section>
      )}

      <section className="modes" aria-labelledby="modes-title">
        <h2 id="modes-title" className="section-label">
          Escolha o seu modo
        </h2>
        <ul className="mode-list">
          <ModeCard
            id="classic"
            name={MODE_LABELS.classic}
            text={`Roleta de time + evento: escolha 1 jogador por giro. 3 rerolls.`}
            art={<FanArt cards={featured} />}
            replaces={!!saved}
            onPlay={() => onNew('classic')}
          />
          <ModeCard
            id="ultimate"
            name={MODE_LABELS.ultimate}
            text="5 opções fixas por pick, sem reroll. Pura leitura de draft."
            art={<BlindCardArt />}
            replaces={!!saved}
            onPlay={() => onNew('ultimate')}
          />
          <ModeCard
            id="trials"
            name="Complete Trials"
            text="Escolha o servidor, vença a liga regional, o Masters e o Champions."
            art={<GlobeArt />}
            replaces={!!savedSeason}
            onPlay={onNewSeason}
          />
        </ul>
      </section>

      <div className="side-cards">
        <button type="button" className="pill-card" onClick={onHistory}>
          <Icon name="history" className="pill-icon" />
          <span className="pill-text">
            <strong>Histórico</strong>
            <span className="small muted">
              {historyCount === 0
                ? 'Suas runs terminadas, com as estatísticas dos jogadores.'
                : `${historyCount} run${historyCount === 1 ? '' : 's'} terminada${historyCount === 1 ? '' : 's'}`}
            </span>
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
  onPlay,
}: {
  id: string;
  name: string;
  text: string;
  art: ReactNode;
  replaces: boolean;
  onPlay: () => void;
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
      {replaces && <p className="mode-warn small">Substitui a {id === 'trials' ? 'temporada' : 'run'} salva.</p>}
      <button type="button" className="primary play" aria-describedby={`mode-${id}-text`} aria-label={`Jogar ${name}`} onClick={onPlay}>
        Jogar
      </button>
    </li>
  );
}

/** Three real player photos fanned like a drafted hand. */
function FanArt({ cards }: { cards: Card[] }) {
  return (
    <span className="fan">
      {cards.map((c, i) => (
        <span key={c.id} className={`fan-card fan-${i}`}>
          <PlayerPhoto playerId={c.playerId} eventId={c.eventId} handle={c.handle} country={c.country} size={72} />
          <span className="fan-ovr">{c.ovr}</span>
        </span>
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

function phaseText(run: RunState): string {
  switch (run.phase) {
    case 'draft':
      return `draft, pick ${Math.min(run.draft.picks.length + 1, 5)}/5`;
    case 'team':
      return 'time pronto';
    case 'tournament':
      return 'Champions em andamento';
    case 'done':
      return 'Champions encerrado';
  }
}

function seasonText(s: SeasonState): string {
  if (s.stage === 'region') return 'escolha do servidor';
  if (s.stage === 'draft') return `draft, pick ${Math.min((s.draft?.picks.length ?? 0) + 1, 5)}/5`;
  if (s.stage === 'team') return 'time pronto';
  if (isCompStage(s.stage)) return `${STAGE_LABELS[s.stage]} em andamento`;
  return 'temporada encerrada';
}
