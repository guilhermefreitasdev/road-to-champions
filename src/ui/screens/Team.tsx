import { useState } from 'react';
import { roleFit } from '../../engine/team';
import {
  ANCHOR_HELP,
  AURA_LABELS,
  DIMENSION_HINTS,
  PRODIGY_HELP,
  ROLE_LABELS,
  SLOT_LABELS,
  auraTitle,
  explainStrength,
  fitLabel,
  formatDecimal,
  formatPoints,
  lineupNotes,
} from '../../game/explain';
import type { Lineup, RosterEntry } from '../../engine/types';
import { DEFAULT_TEAM_NAME, TEAM_NAME_MAX } from '../../game/run';
import { AgentIcon } from '../components/GameImage';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { TeamLogo } from '../components/TeamLogo';

interface Props {
  lineup: Lineup;
  pool: readonly RosterEntry[];
  /** Name typed before (a saved run). */
  initialName?: string;
  /** Line under the title ("Draft concluído"). */
  context?: string;
  /** The button that starts the competition ("Começar Champions", "Começar a liga"). */
  cta: string;
  onStart: (name: string) => void;
}

export function Team({ lineup, pool, initialName, context, cta, onStart }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const rosterOf = (teamId: string, eventId: string) => pool.find((e) => e.teamId === teamId && e.eventId === eventId);
  const { breakdown, parts, dimensions, warnings } = explainStrength(lineup);
  const points = parts.filter((p) => p.key === 'base' || p.key === 'composition');
  const notes = lineupNotes(lineup);

  return (
    <div className="screen team-screen">
      <header className="screen-head">
        <h1>Seu time</h1>
        <p className="context">{context ?? 'Draft concluído'}</p>
      </header>

      <div className="team-grid">
        <section className="team-roster" aria-label="Escalação">
          <ul className="lineup">
            {lineup.players.map((player) => {
              const { card, slot } = player;
              return (
              <li key={card.id} className="lineup-row">
                <span className="lineup-slot">{SLOT_LABELS[slot]}</span>
                <PlayerPhoto playerId={card.playerId} eventId={card.eventId} handle={card.handle} country={card.country} size={36} />
                <span className="lineup-player">
                  <strong>
                    {card.handle}
                    {card.isIGL && <span className="badge igl">IGL</span>}
                    {card.prodigy ? (
                      <span className="badge aura prodigy" title={PRODIGY_HELP}>
                        Prodígio
                      </span>
                    ) : (
                      card.aura && (
                        <span className={`badge aura aura-${card.aura}`} title={auraTitle(card)}>
                          {AURA_LABELS[card.aura]}
                        </span>
                      )
                    )}
                    {card.anchor && (
                      <span className="badge aura anchor" title={ANCHOR_HELP}>
                        Durão
                      </span>
                    )}
                  </strong>
                  <span className="small muted lineup-origin">
                    <TeamLogo teamId={card.teamId} eventId={card.eventId} name={rosterOf(card.teamId, card.eventId)?.teamName ?? card.teamId} size={14} />
                    {ROLE_LABELS[card.role]} · {fitLabel(card.role, slot)}
                  </span>
                </span>
                <span className="agents">
                  {card.agents.slice(0, 2).map((a) => (
                    <AgentIcon key={a} name={a} />
                  ))}
                </span>
                <span className="lineup-ovr" title="OVR × encaixe (com a fase do torneio)">
                  {Math.round(card.ovr * roleFit(card.role, slot))}
                </span>
              </li>
              );
            })}
          </ul>
          {lineup.coach && <p className="muted">Coach: {lineup.coach.name}</p>}
          {notes.length > 0 && (
            <ul className="team-notes small" aria-label="Aura, prodígios e fase do torneio">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </section>

        <div className="team-side">
          <section className="panel">
            <h2>Força do time</h2>
            {warnings.length > 0 && (
              <ul className="strength-warnings" aria-label="Avisos sobre o time">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <dl className="breakdown">
              {points.map((p) => (
                <div key={p.key} className="breakdown-row">
                  <dt>{p.label}</dt>
                  <dd className={p.key === 'base' ? undefined : p.value < 0 ? 'neg' : p.value > 0 ? 'pos' : undefined}>
                    {p.key === 'base' ? formatDecimal(p.value) : formatPoints(p.value)}
                  </dd>
                  <dd className="breakdown-notes small muted">{p.notes.join(' · ')}</dd>
                </div>
              ))}
            </dl>
            <ul className="dims" aria-label="Dimensões do time">
              {dimensions.map((d) => (
                <li key={d.key} className={`dim${d.key === 'decision' && breakdown.igl === 'none' ? ' dim-alert' : ''}`}>
                  <span className="dim-label" title={DIMENSION_HINTS[d.key]}>
                    {d.label}
                  </span>
                  <span className="dim-level" aria-label={`${d.label}: ${Math.round(d.level)} de 100`}>
                    {Math.round(d.level)}
                  </span>
                  <span className={`dim-points${d.value < 0 ? ' neg' : d.value > 0 ? ' pos' : ''}`} title="Pontos de força">
                    {formatPoints(d.value)}
                  </span>
                  <span className="dim-bar" aria-hidden="true">
                    <span className="dim-fill" style={{ width: `${Math.max(0, Math.min(100, d.level))}%` }} />
                    <span className="dim-ref" style={{ left: `${d.reference}%` }} title={`Referência: ${d.reference}`} />
                  </span>
                  <span className="dim-notes small muted">{d.notes.join(' · ')}</span>
                </li>
              ))}
            </ul>
            <dl className="breakdown">
              <div className="breakdown-row total">
                <dt>Total</dt>
                <dd>{formatDecimal(breakdown.total)}</dd>
              </div>
            </dl>
          </section>

          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              onStart(name);
            }}
          >
            <label className="field">
              <span>Nome do time</span>
              <input
                value={name}
                maxLength={TEAM_NAME_MAX}
                placeholder={DEFAULT_TEAM_NAME}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                name="team-name"
                spellCheck={false}
              />
            </label>
            <button type="submit" className="primary wide">
              {cta}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
