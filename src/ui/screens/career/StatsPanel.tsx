import { useMemo, useState } from 'react';
import type { Card } from '../../../engine/types';
import { CAREER_STAGES, CAREER_STAGE_LABELS, careerAllPlayerStats, careerPlayerStats, careerStageOutcome, careerStatsStage, type CareerStage, type CareerState } from '../../../game/career';
import { Icon } from '../../components/Icon';
import { Leaderboard } from '../../components/Leaderboard';
import { PlayerStatsTable } from '../../components/PlayerStatsTable';
import { toRow } from '../../playerStats';

interface Props {
  c: CareerState;
  cardOf: (cardId: string) => Card | undefined;
}

/** Estatísticas: your players over the season's competitive series, and every player of a stage (AI vs AI included). */
export function StatsPanel({ c, cardOf }: Props) {
  const rows = useMemo(() => careerPlayerStats(c).map(toRow), [c]);
  const cards = useMemo(() => {
    const out = new Map<string, Card>();
    for (const r of rows) {
      const card = cardOf(r.cardId);
      if (card) out.set(r.cardId, card);
    }
    return out;
  }, [rows, cardOf]);
  const reached = CAREER_STAGES.filter((s) => careerStageOutcome(c, s).status !== 'pending');
  const [picked, setStage] = useState<CareerStage | null>(null);
  const stage = picked && reached.includes(picked) ? picked : careerStatsStage(c);
  const board = useMemo(() => (c.league ? careerAllPlayerStats(c, stage) : []), [c, stage]);

  if (!c.league) {
    return (
      <div className="cr-panel">
        <p className="empty-state">As estatísticas começam com a liga. Os relatórios dos scrims ficam na aba Scrims.</p>
      </div>
    );
  }

  return (
    <div className="cr-panel">
      <h3 className="hub-subtitle">Seu time na temporada</h3>
      <p className="small muted">Liga, Masters e Champions somados (scrims fora). Números estimados pelo simulador; clique num jogador para ver os agentes.</p>
      {rows.length > 0 ? <PlayerStatsTable rows={rows} cards={cards} caption={`Estatísticas de ${c.org.name}`} idPrefix="cr-stats" /> : <p className="empty-state">Nenhuma série oficial jogada ainda.</p>}

      <h3 className="hub-subtitle">Campeonato</h3>
      <div className="board-stages">
        <div className="segmented" role="radiogroup" aria-label="Etapa">
          {CAREER_STAGES.map((s) => {
            const locked = !reached.includes(s);
            return (
              <label key={s} className={`segment${stage === s ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}>
                <input type="radio" name="cr-board-stage" value={s} checked={stage === s} disabled={locked} onChange={() => setStage(s)} />
                {CAREER_STAGE_LABELS[s]}
                {locked && <Icon name="lock" label="ainda não chegou" />}
              </label>
            );
          })}
        </div>
      </div>
      <p className="small muted stats-note">Todos os jogadores da etapa, inclusive as partidas entre times da IA. Números estimados pelo simulador, não são stats reais.</p>
      <Leaderboard key={stage} rows={board} cardOf={cardOf} idPrefix={`cr-board-${stage}`} caption={`Jogadores da etapa (${CAREER_STAGE_LABELS[stage]})`} />
    </div>
  );
}
