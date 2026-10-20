import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Card } from '../../engine/types';
import type { Difficulty } from '../../game/difficulty';
import type { StatRow } from '../../game/stats';
import { DifficultyBadge } from '../components/Difficulty';
import { Icon } from '../components/Icon';
import { Leaderboard } from '../components/Leaderboard';
import { PlayerStatsTable } from '../components/PlayerStatsTable';
import type { PlayerStatsRow } from '../playerStats';

/** A stage of the championship board (Complete Trials: Liga / Masters / Champions). */
export interface BoardStage {
  key: string;
  label: string;
  /** Not reached yet. */
  locked?: boolean;
}

interface Props {
  teamName: string;
  /** "Champions · Draft clássico", "Complete Trials · EMEA". */
  context: string;
  difficulty: Difficulty;
  rows: readonly PlayerStatsRow[];
  cards: ReadonlyMap<string, Card>;
  /** Every player of the championship (of `stage`, when there are stages). */
  boardRows: (stage?: string) => StatRow[];
  /** Stage switch of the board; absent in the main mode (one Champions). */
  stages?: BoardStage[];
  defaultStage?: string;
  /** Base card of any row (photos, base OVR). */
  cardOf: (cardId: string) => Card | undefined;
  onBack: () => void;
  backLabel: string;
}

type Tab = 'team' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'team', label: 'Seu time' },
  { key: 'all', label: 'Campeonato' },
];

/** "Estatísticas": the user's five ("Seu time") and every player of the championship ("Campeonato"). */
export function Stats({ teamName, context, difficulty, rows, cards, boardRows, stages, defaultStage, cardOf, onBack, backLabel }: Props) {
  const [tab, setTab] = useState<Tab>('team');
  const [stage, setStage] = useState<string | undefined>(defaultStage);
  const maps = Math.max(0, ...rows.map((r) => r.maps));
  const board = useMemo(() => (tab === 'all' ? boardRows(stage) : []), [tab, stage, boardRows]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tab === 'team' ? 'all' : 'team';
    setTab(next);
    document.getElementById(`stats-tab-${next}`)?.focus();
  };

  return (
    <div className="screen stats-screen">
      <header className="screen-head">
        <h1>Estatísticas</h1>
        <p className="context">
          {teamName} · {context}
        </p>
        <p className="head-badges">
          <DifficultyBadge difficulty={difficulty} />
        </p>
      </header>

      <div className="tabs stats-tabs" role="tablist" aria-label="Estatísticas" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`stats-tab-${t.key}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.key}
            aria-controls={`stats-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' ? (
        <section className="panel stats-panel" id="stats-panel-team" role="tabpanel" aria-labelledby="stats-tab-team">
          {rows.length > 0 && (
            <p className="small muted stats-note">
              {maps} mapa{maps === 1 ? '' : 's'} jogado{maps === 1 ? '' : 's'}. Números estimados pelo simulador; clique num jogador para ver os
              agentes que ele jogou aqui e o pool real dele. A seta no OVR é a fase do torneio (e o crescimento de prodígio).
            </p>
          )}
          <PlayerStatsTable rows={rows} cards={cards} caption={`Estatísticas de ${teamName}`} idPrefix="stats" />
        </section>
      ) : (
        <section className="panel stats-panel" id="stats-panel-all" role="tabpanel" aria-labelledby="stats-tab-all">
          {stages && stages.length > 0 && (
            <div className="board-stages">
              <div className="segmented" role="radiogroup" aria-label="Etapa">
                {stages.map((s) => (
                  <label key={s.key} className={`segment${stage === s.key ? ' is-on' : ''}${s.locked ? ' is-locked' : ''}`}>
                    <input
                      type="radio"
                      name="board-stage"
                      value={s.key}
                      checked={stage === s.key}
                      disabled={s.locked}
                      onChange={() => setStage(s.key)}
                    />
                    {s.label}
                    {s.locked && <Icon name="lock" label="ainda não chegou" />}
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="small muted stats-note">
            Todos os jogadores do campeonato, inclusive as partidas entre times da IA. Números estimados pelo simulador, não são stats reais.
          </p>
          <Leaderboard
            key={stage ?? 'all'}
            rows={board}
            cardOf={cardOf}
            idPrefix={`board-${stage ?? 'all'}`}
            caption={`Jogadores do campeonato${stage ? ` (${stages?.find((s) => s.key === stage)?.label ?? stage})` : ''}`}
          />
        </section>
      )}

      <button type="button" className="secondary wide" onClick={onBack}>
        <Icon name="back" /> {backLabel}
      </button>
    </div>
  );
}
