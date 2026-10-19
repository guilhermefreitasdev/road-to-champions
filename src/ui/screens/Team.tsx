import { useState } from 'react';
import { roleFit } from '../../engine/team';
import { ROLE_LABELS, SLOT_LABELS, explainStrength, fitLabel, formatDecimal, formatPoints } from '../../game/explain';
import { DEFAULT_TEAM_NAME, TEAM_NAME_MAX, draftedLineup, type RunState } from '../../game/run';
import { AgentIcon } from '../components/GameImage';

export function Team({ run, onStart }: { run: RunState; onStart: (name: string) => void }) {
  const [name, setName] = useState(run.teamName ?? '');
  const lineup = draftedLineup(run);
  const { breakdown, parts } = explainStrength(lineup);

  return (
    <div className="screen team-screen">
      <header className="screen-head">
        <p className="eyebrow">Draft concluído</p>
        <h1>Seu time</h1>
      </header>

      <ul className="lineup">
        {lineup.players.map(({ card, slot }) => (
          <li key={card.id} className="lineup-row">
            <span className="lineup-slot">{SLOT_LABELS[slot]}</span>
            <span className="lineup-player">
              <strong>
                {card.handle}
                {card.isIGL && <span className="badge igl">IGL</span>}
              </strong>
              <span className="small muted">
                {ROLE_LABELS[card.role]} · {fitLabel(card.role, slot)}
              </span>
            </span>
            <span className="agents">{card.agents.slice(0, 2).map((a) => <AgentIcon key={a} name={a} />)}</span>
            <span className="lineup-ovr" title="OVR × encaixe">
              {Math.round(card.ovr * roleFit(card.role, slot))}
            </span>
          </li>
        ))}
      </ul>
      {lineup.coach && <p className="muted">Coach: {lineup.coach.name}</p>}

      <section className="panel">
        <h2>Força do time</h2>
        <dl className="breakdown">
          {parts.map((p) => (
            <div key={p.key} className="breakdown-row">
              <dt>{p.label}</dt>
              <dd className={p.key === 'base' ? undefined : p.value < 0 ? 'neg' : p.value > 0 ? 'pos' : undefined}>
                {p.key === 'base' ? formatDecimal(p.value) : formatPoints(p.value)}
              </dd>
              <dd className="breakdown-notes small muted">{p.notes.join(' · ')}</dd>
            </div>
          ))}
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
          />
        </label>
        <button type="submit" className="primary wide">
          Começar Champions
        </button>
      </form>
    </div>
  );
}
