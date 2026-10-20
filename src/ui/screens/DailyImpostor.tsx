import { useState } from 'react';
import type { ImpostorPuzzle } from '../../game/daily/generate';
import { impostorRuleText } from '../../game/daily/labels';
import { impostorResult, pickImpostor, type ImpostorState } from '../../game/daily/play';
import { CountryChip } from '../components/CountryChip';
import { Icon } from '../components/Icon';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { TeamLogo } from '../components/TeamLogo';

/** O Impostor: five players, four fit the day's rule; one pick. */
export function DailyImpostor({
  puzzle,
  state,
  onChange,
}: {
  puzzle: ImpostorPuzzle;
  state: ImpostorState;
  onChange: (fn: (s: ImpostorState) => ImpostorState) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const rule = impostorRuleText(puzzle);
  const over = state.pick !== null;
  const result = impostorResult(state, puzzle);
  const scope = puzzle.rule === 'event' ? `no ${puzzle.eventName}` : puzzle.rule === 'year' ? `em ${puzzle.year}` : 'na base';

  return (
    <div className="daily-impostor">
      <div className="panel daily-team-card">
        <TeamLogo teamId={puzzle.teamId} eventId={puzzle.logoEventId} name={puzzle.teamName} size={64} />
        <div className="daily-team-text">
          <p className="daily-team-name">{rule.title}</p>
          <p className="daily-rule">{rule.text}</p>
        </div>
      </div>
      <p className="small muted">
        Uma chance. Vale qualquer passagem pelo elenco, até como reserva: o impostor não aparece em nenhuma lista do time {scope}.
      </p>

      <ul className="daily-options" role={over ? undefined : 'radiogroup'} aria-label="Quem é o impostor?">
        {puzzle.options.map((o) => {
          const isPick = state.pick === o.playerId;
          const chosen = over ? isPick : selected === o.playerId;
          const cls = over ? (o.member ? 'member' : 'impostor') : '';
          return (
            <li key={o.playerId}>
              <button
                type="button"
                role={over ? undefined : 'radio'}
                aria-checked={over ? undefined : chosen}
                className={`daily-option ${cls}${chosen ? ' chosen' : ''}`}
                disabled={over}
                onClick={() => setSelected(o.playerId)}
              >
                <PlayerPhoto playerId={o.playerId} eventId={o.photoEventId} handle={o.handle} country={o.country} size={64} />
                <span className="daily-option-name">
                  <strong translate="no">{o.handle}</strong> <CountryChip code={o.country} />
                </span>
                {over && (
                  <span className="daily-option-verdict">
                    {o.member ? (
                      <>
                        <Icon name="check" /> Jogou: {o.facts.slice(0, 3).join(', ')}
                        {o.facts.length > 3 ? ` e mais ${o.facts.length - 3}` : ''}
                      </>
                    ) : (
                      <>
                        <Icon name="mask" /> Impostor. Times na base: {o.facts.length ? o.facts.slice(0, 3).join(', ') : '—'}
                      </>
                    )}
                  </span>
                )}
                {over && isPick && <span className="daily-option-pick">Sua escolha</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {!over && (
        <button
          type="button"
          className="primary wide"
          disabled={!selected}
          onClick={() => {
            if (selected) onChange((s) => pickImpostor(s, selected));
          }}
        >
          <Icon name="mask" /> Confirmar o impostor
        </button>
      )}
      {over && (
        <p className={`daily-verdict ${result.won ? 'won' : 'lost'}`}>
          <Icon name={result.won ? 'check' : 'close'} />
          {result.won ? 'Certo! 5 pontos.' : 'Não foi dessa vez: 0 pontos.'}
        </p>
      )}
    </div>
  );
}
