import { useState } from 'react';
import { SLOTS, openSlots } from '../../engine/draft';
import { roleFit } from '../../engine/team';
import type { Card, Slot } from '../../engine/types';
import { SLOT_LABELS, SLOT_SHORT, fitLabel } from '../../game/explain';
import { MODE_LABELS, draftOptions, rolledRoster, type RunState } from '../../game/run';
import { findCard } from '../../engine/roster';
import { RUN_POOL } from '../../game/run';
import { PlayerCard } from '../components/PlayerCard';

interface Props {
  run: RunState;
  onRoll: () => void;
  onReroll: () => void;
  onPick: (cardId: string, slot: Slot) => void;
}

export function Draft({ run, onRoll, onReroll, onPick }: Props) {
  const { draft } = run;
  const [selected, setSelected] = useState<string | null>(null);
  const options = draftOptions(run);
  const card = options.find((c) => c.id === selected);
  const roster = rolledRoster(run);
  const pickNumber = Math.min(draft.picks.length + 1, SLOTS.length);

  const choose = (slot: Slot) => {
    if (!card) return;
    setSelected(null);
    onPick(card.id, slot);
  };

  return (
    <div className="screen draft">
      <header className="screen-head">
        <p className="eyebrow">{MODE_LABELS[run.mode]}</p>
        <h1>
          Pick {pickNumber}/{SLOTS.length}
        </h1>
      </header>

      <Lineup run={run} />

      {draft.mode === 'classic' && draft.phase === 'roll' && (
        <section className="panel center">
          <p>Gire a roleta para sortear um time e um evento. Você escolhe 1 jogador desse elenco.</p>
          <button type="button" className="primary big" onClick={onRoll}>
            Girar roleta
          </button>
          <p className="small muted">Rerolls restantes: {draft.rerollsLeft}</p>
        </section>
      )}

      {draft.phase === 'pick' && (
        <section>
          <div className="roll-head">
            {roster ? (
              <h2 className="roll-title">
                {roster.teamName} · {roster.eventName} <span className="muted">({roster.year})</span>
              </h2>
            ) : (
              <h2>Escolha 1 de {options.length}</h2>
            )}
            {draft.mode === 'classic' && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelected(null);
                  onReroll();
                }}
                disabled={draft.rerollsLeft <= 0}
              >
                Reroll ({draft.rerollsLeft})
              </button>
            )}
          </div>
          <p className="small muted">Toque num card para escolher e depois numa vaga livre.</p>
          <div className="card-grid">
            {options.map((c) => (
              <PlayerCard key={c.id} card={c} selected={c.id === selected} onSelect={() => setSelected(c.id === selected ? null : c.id)} />
            ))}
          </div>
          {card && <SlotPicker card={card} open={openSlots(draft)} onChoose={choose} />}
        </section>
      )}
    </div>
  );
}

function SlotPicker({ card, open, onChoose }: { card: Card; open: Slot[]; onChoose: (slot: Slot) => void }) {
  return (
    <section className="panel slot-picker" aria-label={`Escolher vaga para ${card.handle}`}>
      <h2>Vaga para {card.handle}</h2>
      <div className="slot-buttons">
        {open.map((slot) => {
          const fit = roleFit(card.role, slot);
          return (
            <button key={slot} type="button" className={`slot-button fit-${Math.round(fit * 100)}`} onClick={() => onChoose(slot)}>
              <strong>{SLOT_LABELS[slot]}</strong>
              <span className="small">{fitLabel(card.role, slot)}</span>
              <span className="small muted">OVR efetivo {Math.round(card.ovr * fit)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The 5 slots with the cards already drafted. */
function Lineup({ run }: { run: RunState }) {
  const bySlot = new Map(run.draft.picks.map((p) => [p.slot, p.cardId]));
  return (
    <ol className="slots" aria-label="Seu time">
      {SLOTS.map((slot) => {
        const id = bySlot.get(slot);
        const card = id ? findCard(RUN_POOL, id) : undefined;
        return (
          <li key={slot} className={card ? 'slot filled' : 'slot'} aria-label={`${SLOT_LABELS[slot]}: ${card ? card.handle : 'vazio'}`}>
            <span className="slot-label">
              <abbr title={SLOT_LABELS[slot]}>{SLOT_SHORT[slot]}</abbr>
            </span>
            {card ? (
              <>
                <strong className="slot-handle">{card.handle}</strong>
                <span className="small muted">{Math.round(card.ovr * roleFit(card.role, slot))}</span>
              </>
            ) : (
              <span className="small muted">vazio</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
