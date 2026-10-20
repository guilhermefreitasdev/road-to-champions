import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { SLOTS, availableCards, openSlots, type DraftState } from '../../engine/draft';
import { findCard } from '../../engine/roster';
import type { Card, Role, RosterEntry, Slot } from '../../engine/types';
import { AURA_LABELS, ROLE_LABELS, SLOT_LABELS, SLOT_SHORT, auraTitle, formatStat, placementLabel } from '../../game/explain';
import { rosterOf } from '../../game/run';
import { Icon, type IconName } from '../components/Icon';
import { IglNotice } from '../components/IglNotice';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerPhoto } from '../components/PlayerPhoto';
import { Reel, type ReelEntry } from '../components/Reel';
import { TeamLogo } from '../components/TeamLogo';
import { flexRolesText, isNaturalFlex, slotFit, slotFitLabel } from '../fit';
import { usePrefersReducedMotion } from '../motion';

/** Clicks on the roulette within this window of the previous spin are ignored, so a double click never spends two rerolls. */
const SPIN_GUARD_MS = 600;
/** Reel spins: TIME lands first, ÉPOCA ~300 ms later. */
const TEAM_SPIN_MS = 1600;
const EVENT_SPIN_MS = 1950;
/** Entries scrolled by each reel before the result. */
const STRIP_LENGTH = 22;

export const ROLE_ICONS: Record<Slot, IconName> = {
  duelist: 'role-duelist',
  initiator: 'role-initiator',
  controller: 'role-controller',
  sentinel: 'role-sentinel',
  flex: 'role-flex',
};

type RoleFilter = 'all' | Role;
const FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'duelist', label: 'DUE' },
  { key: 'initiator', label: 'INI' },
  { key: 'controller', label: 'CON' },
  { key: 'sentinel', label: 'SEN' },
];

type SortKey = 'ovr' | 'rating' | 'acs' | 'kast';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'ovr', label: 'OVR' },
  { key: 'rating', label: 'Rating' },
  { key: 'acs', label: 'ACS' },
  { key: 'kast', label: 'KAST' },
];

const sortValue = (c: Card, key: SortKey): number => (key === 'ovr' ? c.ovr : (c.stats?.[key] ?? -1));

interface Props {
  draft: DraftState;
  /** Rosters the draft rolls from (the whole pool, or one region's in Complete Trials). */
  pool: readonly RosterEntry[];
  /** The mode, short ("Clássico", "Ultimate", "Complete Trials · Americas"). */
  context: string;
  onRoll: () => void;
  onReroll: () => void;
  onPick: (cardId: string, slot: Slot) => void;
  onBack: () => void;
}

/** Small deterministic string hash (UI only: picks the decoy names a reel scrolls past). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A reel strip: STRIP_LENGTH decoys picked from `names` (never the result twice in a row), then the result. */
function strip(names: readonly ReelEntry[], result: ReelEntry, seed: string): ReelEntry[] {
  const out: ReelEntry[] = [];
  let h = hash(seed);
  for (let i = 0; i < STRIP_LENGTH && names.length > 1; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const e = names[h % names.length]!;
    out.push(e.key === result.key && i === STRIP_LENGTH - 1 ? names[(h + 1) % names.length]! : e);
  }
  out.push(result);
  return out;
}

export function Draft({ draft, pool, context, onRoll, onReroll, onPick, onBack }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [sort, setSort] = useState<SortKey>('ovr');
  const [query, setQuery] = useState('');
  const reducedMotion = usePrefersReducedMotion();
  const options = availableCards(draft, pool);
  const card = options.find((c) => c.id === selected);
  const cur = draft.current;
  const roster = cur && pool.find((e) => e.teamId === cur.teamId && e.eventId === cur.eventId);
  const classic = draft.mode === 'classic';
  const pickNumber = Math.min(draft.picks.length + 1, SLOTS.length);
  const picked = draft.picks.map((p) => findCard(pool, p.cardId));
  const offeredIgls = draft.phase === 'pick' && !revealing ? options.filter((c) => c.isIGL).length : 0;
  // -Infinity, not 0: performance.now() starts at page load, so 0 would swallow a roll in the first 600 ms.
  const lastSpin = useRef(-Infinity);
  const pickerRef = useRef<HTMLElement>(null);
  const [landed, setLanded] = useState('');

  const teams = useMemo<ReelEntry[]>(() => {
    const seen = new Map<string, ReelEntry>();
    for (const r of pool) if (!seen.has(r.teamId)) seen.set(r.teamId, { key: r.teamId, label: r.teamName, icon: <TeamLogo teamId={r.teamId} eventId={r.eventId} name={r.teamName} size={22} /> });
    return [...seen.values()];
  }, [pool]);
  const events = useMemo<ReelEntry[]>(() => {
    const seen = new Map<string, ReelEntry>();
    for (const r of pool) if (!seen.has(r.eventId)) seen.set(r.eventId, { key: r.eventId, label: r.eventName });
    return [...seen.values()];
  }, [pool]);

  const spinKey = `${draft.seed}:${draft.rollCount}`;
  const teamStrip = useMemo(
    () =>
      roster
        ? strip(teams, { key: roster.teamId, label: roster.teamName, icon: <TeamLogo teamId={roster.teamId} eventId={roster.eventId} name={roster.teamName} size={22} /> }, `${spinKey}:t`)
        : [],
    [roster, teams, spinKey],
  );
  const eventStrip = useMemo(() => (roster ? strip(events, { key: roster.eventId, label: roster.eventName }, `${spinKey}:e`) : []), [roster, events, spinKey]);

  /** Runs a roll or reroll unless one just happened (the second click of a double click). */
  const spin = (action: () => void) => {
    const now = performance.now();
    if (now - lastSpin.current < SPIN_GUARD_MS) return;
    lastSpin.current = now;
    setSelected(null);
    setLanded('');
    action();
    if (!reducedMotion) setRevealing(true);
  };

  const endReveal = () => setRevealing(false);

  // Announce the landed roster once the reels stop (or at once without motion).
  useEffect(() => {
    if (!revealing && roster) setLanded(`Sorteado: ${roster.teamName} · ${roster.eventName}`);
  }, [revealing, roster]);

  // Any key or click skips the spin; the result is already decided.
  useEffect(() => {
    if (!revealing) return;
    const onKey = () => setRevealing(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealing]);

  const select = (id: string) => {
    const next = id === selected ? null : id;
    setSelected(next);
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

  const q = query.trim().toLowerCase();
  const rows = options
    .filter((c) => filter === 'all' || c.role === filter || c.flexRoles?.includes(filter))
    .filter((c) => !q || c.handle.toLowerCase().includes(q))
    .sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || b.ovr - a.ovr);

  const panelTitle = classic ? (roster ? `${roster.teamName} · ${roster.eventName}` : 'Gire a roleta') : `5 opções · pick ${pickNumber}`;

  return (
    <div className={`screen draft${card ? ' has-sheet' : ''}`}>
      <header className="draft-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Voltar ao início">
          <Icon name="back" />
        </button>
        <div className="draft-top-text">
          <h1>
            Rodada {pickNumber} / {SLOTS.length} · {context}
          </h1>
          <ol className="draft-progress" aria-label={`${draft.picks.length} de ${SLOTS.length} picks feitos`}>
            {SLOTS.map((s, i) => (
              <li key={s} className={i < draft.picks.length ? 'done' : i === draft.picks.length && draft.phase !== 'coach' ? 'current' : undefined} />
            ))}
          </ol>
        </div>
      </header>

      <div className="draft-layout">
        <div className="draft-main">
          {classic && (
            <section className="reels" aria-label="Roleta" aria-busy={revealing}>
              <div className="reel-pair" onClick={revealing ? endReveal : undefined}>
                <Reel
                  label="Time"
                  tone="red"
                  entries={teamStrip}
                  spinning={revealing}
                  duration={TEAM_SPIN_MS}
                  spinKey={spinKey}
                  idle={!roster}
                />
                <Reel
                  label="Época"
                  tone="violet"
                  entries={eventStrip}
                  spinning={revealing}
                  duration={EVENT_SPIN_MS}
                  spinKey={spinKey}
                  onLocked={endReveal}
                  idle={!roster}
                />
              </div>
              <div className="reel-actions">
                {draft.phase === 'roll' ? (
                  <button type="button" className="primary big" onClick={() => spin(onRoll)}>
                    <Icon name="dice" /> Girar roleta
                  </button>
                ) : revealing ? (
                  <button type="button" className="secondary" onClick={endReveal}>
                    <Icon name="skip" /> Pular
                  </button>
                ) : (
                  <button type="button" className="reroll" onClick={() => spin(onReroll)} disabled={draft.rerollsLeft <= 0}>
                    <Icon name="reset" /> Rerolar ({draft.rerollsLeft})
                  </button>
                )}
                {draft.phase === 'roll' && <p className="small muted">Sorteia um time e uma época. Você leva 1 jogador desse elenco; {draft.rerollsLeft} rerolls.</p>}
                {draft.phase === 'pick' && !revealing && draft.rerollsLeft <= 0 && <p className="small muted">Sem rerolls: escolha um deste elenco.</p>}
              </div>
              <p className="sr-only" aria-live="polite">
                {landed}
              </p>
            </section>
          )}

          <IglNotice picked={picked} left={SLOTS.length - draft.picks.length} offered={offeredIgls} {...(card ? { selected: card } : {})} />

          {draft.phase === 'pick' && (
            <section className={`pick-panel${revealing ? ' is-waiting' : ''}`} aria-labelledby="pick-title">
              <div className="pick-head">
                <h2 id="pick-title">
                  {classic && roster && <TeamLogo teamId={roster.teamId} eventId={roster.eventId} name={roster.teamName} size={26} />}
                  <span>{revealing ? 'Sorteando…' : panelTitle}</span>
                  {classic && roster?.placement && !revealing && <span className="pick-place">{placementLabel(roster.placement)}</span>}
                </h2>
                <StepIndicator step={card ? 2 : 1} />
              </div>
              <div className="pick-tools">
                <label className="search">
                  <Icon name="search" />
                  <span className="sr-only">Buscar jogador</span>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" name="player-search" autoComplete="off" spellCheck={false} />
                </label>
                <div className="chips" role="group" aria-label="Filtrar por função">
                  {FILTERS.map((f) => (
                    <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} title={f.key === 'all' ? 'Todas as funções' : ROLE_LABELS[f.key]}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <label className="sort-select">
                  <span>Ordenar</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} name="player-sort">
                    {SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {revealing ? (
                <ul className="pick-rows" aria-hidden="true">
                  {options.map((c) => (
                    <li key={c.id} className="pick-row skeleton" />
                  ))}
                </ul>
              ) : (
                <>
                  <div className="pick-cols" aria-hidden="true">
                    <span>Jogador</span>
                    <span>OVR</span>
                    <span>Rating</span>
                    <span>ACS</span>
                    <span>KAST</span>
                  </div>
                  <ul className={`pick-rows${reducedMotion ? '' : ' dealt'}`}>
                    {rows.map((c, i) => (
                      <li key={c.id} style={{ '--i': i } as CSSProperties}>
                        <PickRow card={c} classic={classic} selected={c.id === selected} onSelect={() => select(c.id)} />
                      </li>
                    ))}
                    {rows.length === 0 && <li className="empty-state">Nenhum jogador com esse filtro.</li>}
                  </ul>
                  <p className="small muted pick-source">Stats reais do jogador no evento (VLR.gg); OVR calculado a partir delas.</p>
                </>
              )}
            </section>
          )}
        </div>

        <aside className="draft-side">
          {card ? (
            <>
              <SlotPicker ref={pickerRef} card={card} open={openSlots(draft)} onChoose={choose} onCancel={() => setSelected(null)} />
              <div className="draft-detail">
                <PlayerCard card={card} />
              </div>
            </>
          ) : (
            draft.phase === 'pick' && !revealing && <p className="side-hint small muted">Toque num jogador para ver os atributos e em que vaga ele rende mais.</p>
          )}
        </aside>
      </div>

      <SlotBar draft={draft} pool={pool} target={card} />
    </div>
  );
}

/** One player of the rolled roster (or of the 5 Ultimate options): tap to pick, then choose the slot. */
function PickRow({ card, classic, selected, onSelect }: { card: Card; classic: boolean; selected: boolean; onSelect: () => void }) {
  const roster = rosterOf(card.teamId, card.eventId);
  return (
    <button type="button" className={`pick-row${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <span className="pick-who">
        <PlayerPhoto playerId={card.playerId} eventId={card.eventId} handle={card.handle} country={card.country} size={40} />
        <span className="pick-name">
          <span className="pick-handle">
            <strong>{card.handle}</strong>
            {card.isIGL && (
              <span className="badge igl" title="IGL: faz as calls do time">
                <Icon name="mic" /> IGL
              </span>
            )}
            {isNaturalFlex(card) && (
              <span className="badge flex-nato" title={`Flex nato: jogou ${flexRolesText(card)}`}>
                <Icon name="swap" /> Flex
              </span>
            )}
            {card.prodigy ? (
              <span className="badge aura prodigy">Prodígio</span>
            ) : (
              card.aura && (
                <span className={`badge aura aura-${card.aura}`} title={auraTitle(card)}>
                  {AURA_LABELS[card.aura]}
                </span>
              )
            )}
          </span>
          <span className="pick-role">
            <Icon name={ROLE_ICONS[card.role]} /> {ROLE_LABELS[card.role]}
            {!classic && roster && <span className="pick-origin"> · {roster.teamName} · {roster.eventName}</span>}
          </span>
        </span>
      </span>
      <span className="pick-stat ovr" aria-label={`OVR ${card.ovr}`}>
        {card.ovr}
      </span>
      <span className="pick-stat" aria-label={`Rating ${formatStat(card.stats?.rating, 2)}`}>
        {formatStat(card.stats?.rating, 2)}
      </span>
      <span className="pick-stat" aria-label={`ACS ${formatStat(card.stats?.acs)}`}>
        {formatStat(card.stats?.acs)}
      </span>
      <span className="pick-stat" aria-label={`KAST ${card.stats?.kast ?? '—'}`}>
        {card.stats?.kast === null || card.stats?.kast === undefined ? '—' : `${card.stats.kast}%`}
      </span>
      {selected && (
        <span className="selected-tag">
          <Icon name="check" /> Escolhido
        </span>
      )}
    </button>
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

interface SlotPickerProps {
  card: Card;
  open: Slot[];
  onChoose: (slot: Slot) => void;
  onCancel: () => void;
  ref: Ref<HTMLElement>;
}

const FIT_TEXT: Record<number, string> = { 100: 'Ideal', 90: 'Flex', 75: 'Fora da função' };

/** Chip text: a natural flex reads "Flex nato" off his main role. */
function fitText(card: Card, slot: Slot, fit: number): string {
  if (fit === 100 && slot !== card.role && isNaturalFlex(card)) return 'Flex nato';
  return FIT_TEXT[fit] ?? `${fit}%`;
}

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
      {isNaturalFlex(card) && (
        <p className="small flex-note">
          <Icon name="swap" /> Flex nato: jogou {flexRolesText(card)}. Rende 100% nessas funções e na vaga Flex.
        </p>
      )}
      <div className="slot-buttons">
        {open.map((slot) => {
          const fit = Math.round(slotFit(card, slot) * 100);
          return (
            <button key={slot} type="button" className={`slot-button fit-${fit}`} onClick={() => onChoose(slot)}>
              <span className="slot-button-top">
                <strong>
                  <Icon name={ROLE_ICONS[slot]} /> {SLOT_LABELS[slot]}
                </strong>
                <span className="fit-chip">
                  {fit === 100 && <Icon name="check" />}
                  {fitText(card, slot, fit)}
                </span>
              </span>
              <span className="small muted">{slotFitLabel(card, slot)}</span>
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

/** The 5 slots as badges in a sticky bottom bar: filled ones show the player, open ones the role outline. */
function SlotBar({ draft, pool, target }: { draft: DraftState; pool: readonly RosterEntry[]; target?: Card | undefined }) {
  const bySlot = new Map(draft.picks.map((p) => [p.slot, p.cardId]));
  return (
    <ol className={`slot-bar${target ? ' targeting' : ''}`} aria-label="Seu time">
      {SLOTS.map((slot) => {
        const id = bySlot.get(slot);
        const card = id ? findCard(pool, id) : undefined;
        const fit = target && !card ? Math.round(slotFit(target, slot) * 100) : null;
        return (
          <li key={slot} className={`slot-badge${card ? ' filled' : ' open'}${fit === 100 ? ' fit-100' : ''}`} aria-label={`${SLOT_LABELS[slot]}: ${card ? card.handle : 'vazio'}`}>
            <span className="slot-shield">
              {card ? (
                <PlayerPhoto playerId={card.playerId} eventId={card.eventId} handle={card.handle} size={40} />
              ) : (
                <Icon name={ROLE_ICONS[slot]} />
              )}
            </span>
            <span className="slot-badge-label">
              <abbr title={SLOT_LABELS[slot]}>{SLOT_SHORT[slot]}</abbr>
            </span>
            <span className="slot-badge-value">{card ? card.handle : fit !== null ? `${fit}%` : 'vazio'}</span>
          </li>
        );
      })}
    </ol>
  );
}
