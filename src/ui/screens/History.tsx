import { useState } from 'react';
import type { Card } from '../../engine/types';
import { formatDecimal } from '../../game/explain';
import { ConfirmBar } from '../components/ConfirmBar';
import { Icon } from '../components/Icon';
import { PlayerStatsTable } from '../components/PlayerStatsTable';
import type { HistoryEntry } from '../history';

interface Props {
  entries: readonly HistoryEntry[];
  /** Card lookup for the real agent pools (a card that left the pool simply shows none). */
  cardOf: (cardId: string) => Card | undefined;
  onClear: () => void;
  onBack: () => void;
}

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

/** "Histórico": finished runs of both modes, newest first, each with its stats snapshot. */
export function History({ entries, cardOf, onClear, onBack }: Props) {
  const [confirming, setConfirming] = useState(false);
  const titles = entries.filter((e) => e.champion).length;
  return (
    <div className="screen history-screen">
      <header className="screen-head">
        <h1>Histórico</h1>
        <p className="context">
          {entries.length === 0
            ? 'Nenhuma run terminada'
            : `${entries.length} run${entries.length === 1 ? '' : 's'} · ${titles} título${titles === 1 ? '' : 's'}`}
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="empty-state">
          Termine uma run (Draft clássico, Ultimate ou Complete Trials) e ela aparece aqui com o resultado e as estatísticas dos
          seus jogadores. Guardamos as últimas 30, só neste navegador.
        </p>
      ) : (
        <ol className="history-list">
          {entries.map((e) => {
            const cards = new Map(e.players.map((p) => [p.cardId, cardOf(p.cardId)] as const).filter((x): x is [string, Card] => !!x[1]));
            return (
              <li key={e.id}>
                <details className={`history-entry${e.champion ? ' is-champion' : ''}`}>
                  <summary>
                    <span className="history-place" aria-label={`Colocação ${e.place}`}>
                      {e.champion ? <Icon name="trophy" label="Campeão" /> : e.place}
                    </span>
                    <span className="history-main">
                      <strong>{e.teamName}</strong>
                      <span className="history-result">{e.result}</span>
                      <span className="small muted">
                        {e.modeLabel} · {formatDate(e.date)}
                      </span>
                    </span>
                    <span className="history-record small">
                      {e.record}
                      <span className="muted"> · mapas {e.mapsWon}-{e.mapsLost}</span>
                    </span>
                    <Icon name="chevron" className="history-chevron" />
                  </summary>
                  <div className="history-body">
                    <p className="small muted">Força do time {formatDecimal(e.strength)}</p>
                    <PlayerStatsTable rows={e.players} cards={cards} caption={`Estatísticas de ${e.teamName}`} idPrefix={`h-${e.id}`} />
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {confirming ? (
        <ConfirmBar
          title="Limpar o histórico?"
          text={`Apaga as ${entries.length} runs guardadas neste navegador. Não dá para desfazer; runs em andamento não são afetadas.`}
          confirmLabel="Limpar histórico"
          onConfirm={() => {
            setConfirming(false);
            onClear();
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <div className="history-actions">
          <button type="button" className="secondary" onClick={onBack}>
            <Icon name="back" /> Voltar ao início
          </button>
          {entries.length > 0 && (
            <button type="button" className="danger-ghost" onClick={() => setConfirming(true)}>
              Limpar histórico
            </button>
          )}
        </div>
      )}
    </div>
  );
}
