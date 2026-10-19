import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { SLOTS, availableCards, openSlots, type DraftState } from '../../engine/draft';
import { roleFit } from '../../engine/team';
import type { Card, RosterEntry, Slot } from '../../engine/types';
import { SLOT_LABELS, SLOT_SHORT, fitLabel, placementLabel } from '../../game/explain';
import { findCard } from '../../engine/roster';
import { TeamLogo } from '../components/TeamLogo';
import { Icon } from '../components/Icon';
import { PlayerCard } from '../components/PlayerCard';
import { usePrefersReducedMotion } from '../motion';

/** Clicks on the roulette within this window of the previous spin are ignored, so a double click never spends two rerolls. */
const SPIN_GUARD_MS = 600;
/** Roulette reveal: how many names flash by and the total duration. */
const REVEAL_TICKS = 12;
const REVEAL_MS = 900;

interface Props {
  draft: DraftState;
  /** Rosters the draft rolls from (the whole pool, or one region's in Complete Trials). */
  pool: readonly RosterEntry[];
  /** Line under the title: the mode ("Draft clássico", "Complete Trials · Americas"). */
  context: string;
  onRoll: () => void;
  onReroll: () => void;
  onPick: (cardId: string, slot: Slot) => void;
}

export function Draft({ draft, pool, context, onRoll, onReroll, onPick }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const options = availableCards(draft, pool);
  const card = options.find((c) => c.id === selected);
  const cur = draft.current;
  const roster = cur && pool.find((e) => e.teamId === cur.teamId && e.eventId === cur.eventId);
  // Names flashed by the roulette reveal (display only).
  const rosterNames = useMemo(() => Array.from(new Set(pool.map((r) => `${r.teamName} · ${r.eventName}`))), [pool]);
  const pickNumber = Math.min(draft.picks.length + 1, SLOTS.length);
  // -Infinity, not 0: performance.now() starts at page load, so 0 would swallow a roll in the first 600 ms.
  const lastSpin = useRef(-Infinity);
  const pickerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  /** Runs a roll or reroll unless one just happened (the second click of a double click). */
  const spin = (action: () => void) => {
    const now = performance.now();
    if (now - lastSpin.current < SPIN_GUARD_MS) return;
    lastSpin.current = now;
    setSelected(null);
    action();
    if (!reducedMotion) setRevealing(true);
  };

  const select = (id: string) => {
    const next = id === selected ? null : id;
    setSelected(next);
    // Step 2 lives in the slot picker: keyboard users land there; Tab continues into the slot buttons.
    if (next) requestAnimationFrame(() => pickerRef.current?.focus({ preventScroll: true }));
  };

  const choose = (slot: Slot) => {
    if (!card) return;
    setSelected(null);
    onPick(card.id, slot);
  };

  // Escape backs out of step 2.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const endReveal = () => setRevealing(false);

  // The roll/reroll button is gone while the reveal runs; when it lands, focus the result for keyboard users.
  const wasRevealing = useRef(false);
  useEffect(() => {
    if (wasRevealing.current && !revealing) titleRef.current?.focus({ preventScroll: true });
    wasRevealing.current = revealing;
  }, [revealing]);

  const step = draft.phase === 'pick' && !revealing ? (card ? 2 : 1) : 0;

  return (
    <div className="screen draft">
      <header className="screen-head">
        <h1>
          Pick {pickNumber}/{SLOTS.length}
        </h1>
        <p className="context">
          {context}
          {draft.mode === 'classic' && ` · ${draft.rerollsLeft} reroll${draft.rerollsLeft === 1 ? '' : 's'}`}
        </p>
      </header>

      <div className={`draft-layout${card ? ' has-sheet' : ''}`}>
        <div className="draft-main">
          {draft.mode === 'classic' && draft.phase === 'roll' && (
            <section className="panel roll-panel">
              <Icon name="dice" className="roll-icon" />
              <h2>Gire a roleta</h2>
              <p>Sorteia um time e um evento. Você leva 1 jogador desse elenco.</p>
              <button type="button" className="primary big" onClick={() => spin(onRoll)}>
                Girar roleta
              </button>
            </section>
          )}

          {draft.phase === 'pick' && (
            <section className="pick-area" aria-busy={revealing}>
              <div className="roll-head">
                {roster ? (
                  revealing ? (
                    <RouletteTitle final={`${roster.teamName} · ${roster.eventName}`} names={rosterNames} onDone={endReveal} />
                  ) : (
                    <h2 className="roll-title landed" ref={titleRef} tabIndex={-1}>
                      <TeamLogo teamId={roster.teamId} eventId={roster.eventId} name={roster.teamName} size={28} />
                      {roster.teamName} · {roster.eventName}
                      {roster.placement && <span className="muted"> ({placementLabel(roster.placement)})</span>}
                    </h2>
                  )
                ) : (
                  <h2 ref={titleRef} tabIndex={-1}>
                    Escolha 1 de {options.length}
                  </h2>
                )}
                {revealing ? (
                  <button type="button" className="secondary" onClick={endReveal}>
                    <Icon name="skip" /> Pular
                  </button>
                ) : (
                  draft.mode === 'classic' && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => spin(onReroll)}
                      disabled={draft.rerollsLeft <= 0}
                    >
                      Reroll ({draft.rerollsLeft})
                    </button>
                  )
                )}
              </div>

              {step > 0 && <StepIndicator step={step} />}

              {revealing ? (
                <div className="card-grid" aria-hidden="true" onClick={endReveal}>
                  {options.map((c) => (
                    <div key={c.id} className="player-card placeholder" />
                  ))}
                </div>
              ) : (
                <div className={`card-grid${reducedMotion ? '' : ' dealt'}`}>
                  {options.map((c, i) => (
                    <PlayerCard
                      key={c.id}
                      card={c}
                      index={i}
                      selected={c.id === selected}
                      onSelect={() => select(c.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <Lineup draft={draft} pool={pool} target={card} />
        {card ? (
          <SlotPicker
            ref={pickerRef}
            card={card}
            open={openSlots(draft)}
            onChoose={choose}
            onCancel={() => setSelected(null)}
          />
        ) : (
          draft.phase === 'pick' &&
          !revealing && <p className="side-hint small muted">Escolha um jogador para ver em que vaga ele rende mais.</p>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | number }) {
  const steps = ['Escolha o jogador', 'Escolha a vaga'];
  return (
    <ol className="steps" aria-label="Etapas do pick">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li key={label} className={`step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-num">{state === 'done' ? <Icon name="check" label="feito" /> : n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/** Slot-machine title: flashes roster names with an ease-out cadence, then lands on the rolled one. */
function RouletteTitle({ final, names, onDone }: { final: string; names: string[]; onDone: () => void }) {
  const [tick, setTick] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (tick >= REVEAL_TICKS) {
      done.current();
      return;
    }
    // Quadratic ease-out: short gaps first, longer ones as it settles. Sums to ~REVEAL_MS.
    const t = (tick + 1) / REVEAL_TICKS;
    const delay = (REVEAL_MS / REVEAL_TICKS) * 2 * t;
    const id = window.setTimeout(() => setTick((n) => n + 1), delay);
    return () => window.clearTimeout(id);
  }, [tick]);

  // Any key skips the reveal; the result is already decided.
  useEffect(() => {
    const onKey = () => done.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const offset = final.length % names.length;
  const name = tick >= REVEAL_TICKS - 1 ? final : names[(offset + tick * 7) % names.length];
  return (
    <h2 className="roll-title spinning" aria-live="off">
      <span className="sr-only">Sorteando…</span>
      <span aria-hidden="true">{name}</span>
    </h2>
  );
}

interface SlotPickerProps {
  card: Card;
  open: Slot[];
  onChoose: (slot: Slot) => void;
  onCancel: () => void;
  ref: Ref<HTMLElement>;
}

const FIT_TEXT: Record<number, string> = { 100: 'Ideal', 90: 'Flex', 75: 'Fora da função' };

function SlotPicker({ card, open, onChoose, onCancel, ref }: SlotPickerProps) {
  return (
    <section ref={ref} tabIndex={-1} className="panel slot-picker" aria-label={`Escolher vaga para ${card.handle}`}>
      <div className="slot-picker-head">
        <h2>
          <span className="step-num">2</span> Vaga para {card.handle}
        </h2>
        <button type="button" className="ghost" onClick={onCancel}>
          Trocar jogador
        </button>
      </div>
      <div className="slot-buttons">
        {open.map((slot) => {
          const fit = Math.round(roleFit(card.role, slot) * 100);
          return (
            <button key={slot} type="button" className={`slot-button fit-${fit}`} onClick={() => onChoose(slot)}>
              <span className="slot-button-top">
                <strong>{SLOT_LABELS[slot]}</strong>
                <span className="fit-chip">
                  {fit === 100 && <Icon name="check" />}
                  {FIT_TEXT[fit] ?? `${fit}%`}
                </span>
              </span>
              <span className="small muted">{fitLabel(card.role, slot)}</span>
              <span className="slot-ovr">
                OVR <strong>{Math.round(card.ovr * (fit / 100))}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The 5 slots with the cards already drafted; open slots light up as targets while a card is selected. */
function Lineup({ draft, pool, target }: { draft: DraftState; pool: readonly RosterEntry[]; target?: Card }) {
  const bySlot = new Map(draft.picks.map((p) => [p.slot, p.cardId]));
  return (
    <ol className={`slots${target ? ' targeting' : ''}`} aria-label="Seu time">
      {SLOTS.map((slot) => {
        const id = bySlot.get(slot);
        const card = id ? findCard(pool, id) : undefined;
        return (
          <li
            key={slot}
            className={card ? 'slot filled' : 'slot open'}
            aria-label={`${SLOT_LABELS[slot]}: ${card ? card.handle : 'vazio'}`}
          >
            <span className="slot-label">
              <abbr title={SLOT_LABELS[slot]}>{SLOT_SHORT[slot]}</abbr>
              <span className="slot-label-long">{SLOT_LABELS[slot]}</span>
            </span>
            {card ? (
              <>
                <strong className="slot-handle">{card.handle}</strong>
                <span className="slot-ovr-value">{Math.round(card.ovr * roleFit(card.role, slot))}</span>
              </>
            ) : (
              <span className="slot-empty">
                {target ? (
                  <>
                    <span className="slot-empty-short">{Math.round(roleFit(target.role, slot) * 100)}%</span>
                    <span className="slot-empty-long">{fitLabel(target.role, slot)}</span>
                  </>
                ) : (
                  'vazio'
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
