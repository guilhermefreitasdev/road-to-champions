import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeName, rankMatches } from '../../../game/daily/text';
import type { Feedback } from '../../../game/valdle/feedback';
import { Icon } from '../../components/Icon';

/** One choice of an OptionSearch: shown as `label` (+ `sub`), matched on the label and any `aliases`. */
export interface Option {
  id: string;
  label: string;
  sub?: string;
  aliases?: readonly string[];
  /** Small visual before the label (icon, chip). */
  lead?: ReactNode;
}

/**
 * Text input with autocomplete over a fixed list (agents, weapons, maps, callouts, teams), as an ARIA combobox:
 * arrows move, Enter picks (the highlighted one, else an exact match, else the first), Escape closes. Same look as
 * the Diário's player search (.player-search). `exclude`: ids already guessed (left out of the suggestions).
 */
export function OptionSearch({
  options,
  onPick,
  label,
  placeholder,
  disabled,
  exclude,
  submitLabel = 'Chutar',
  showAllOnFocus = false,
}: {
  options: readonly Option[];
  onPick: (o: Option) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
  exclude?: ReadonlySet<string>;
  submitLabel?: string;
  /** Short lists (maps): open every choice on focus, before typing. */
  showAllOnFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pool = useMemo(() => options.filter((o) => !exclude?.has(o.id)), [options, exclude]);
  const matches = useMemo(() => {
    if (!text.trim()) return showAllOnFocus ? pool.slice(0, 40) : [];
    const keyed = pool.flatMap((o) => [o.label, ...(o.aliases ?? [])].map((name) => ({ o, name })));
    const seen = new Set<string>();
    return rankMatches(text, keyed, (k) => k.name, 40)
      .map((k) => k.o)
      .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
      .slice(0, 8);
  }, [text, pool, showAllOnFocus]);

  const pick = (o: Option) => {
    onPick(o);
    setText('');
    setOpen(false);
    setActive(-1);
    setNotFound(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!text.trim()) return;
    const n = normalizeName(text);
    const chosen =
      (active >= 0 ? matches[active] : undefined) ??
      pool.find((o) => normalizeName(o.label) === n || o.aliases?.some((a) => normalizeName(a) === n)) ??
      matches[0];
    if (chosen) pick(chosen);
    else setNotFound(true);
  };

  const listId = `${id}-list`;
  const showList = open && matches.length > 0 && !disabled;
  return (
    <form
      className="player-search vd-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={`${id}-input`}>
        {label}
      </label>
      <div className="player-search-row">
        <span className="player-search-field">
          <Icon name="search" className="player-search-icon" />
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={placeholder}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(-1);
              setNotFound(false);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(matches.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              } else if (e.key === 'Escape') {
                setOpen(false);
                setActive(-1);
              }
            }}
          />
        </span>
        <button type="submit" className="primary" disabled={disabled || !text.trim()}>
          {submitLabel}
        </button>
      </div>
      {showList && (
        <ul className="player-search-list" id={listId} role="listbox" aria-label="Sugestões">
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              {o.lead}
              <strong translate="no">{o.label}</strong>
              {o.sub && <span className="small muted">{o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="small player-search-note" aria-live="polite">
        {notFound ? 'Nada com esse nome na lista. Confira a grafia.' : ''}
      </p>
    </form>
  );
}

const MARK_TEXT = { hit: 'certo', partial: 'perto', miss: 'errado' } as const;

/** One attribute of a guess: the value, its mark (color + icon + text for screen readers) and the arrow. */
export function AttrCell({ label, value, feedback }: { label: string; value: ReactNode; feedback: Feedback }) {
  const arrow = feedback.arrow === 'up' ? 'maior' : feedback.arrow === 'down' ? 'menor' : '';
  return (
    <span className={`vd-cell ${feedback.mark}`}>
      <span className="vd-cell-label">{label}</span>
      <span className="vd-cell-value">
        {value}
        {feedback.arrow && <Icon name={feedback.arrow} className="vd-cell-arrow" />}
      </span>
      <span className="sr-only">
        {MARK_TEXT[feedback.mark]}
        {arrow ? `, a resposta é ${arrow}` : ''}
      </span>
    </span>
  );
}

/** A guess row of the attribute games: who was guessed, then one cell per column. */
export function AttrRow({ n, head, cells, hit }: { n: number; head: ReactNode; cells: ReactNode; hit: boolean }) {
  return (
    <li className={`vd-row${hit ? ' hit' : ''}`}>
      <span className="vd-row-head">
        <span className="vd-row-n">{n}</span>
        {head}
        {hit && <Icon name="check" className="vd-row-check" />}
      </span>
      <span className="vd-cells">{cells}</span>
    </li>
  );
}

/** Legend of the marks (never color alone: each mark also has its own icon). */
export function MarkLegend() {
  return (
    <p className="vd-legend small">
      <span className="vd-cell-dot hit">
        <Icon name="check" />
      </span>{' '}
      certo
      <span className="vd-cell-dot partial">
        <Icon name="tilde" />
      </span>{' '}
      perto
      <span className="vd-cell-dot miss">
        <Icon name="close" />
      </span>{' '}
      errado
      <span className="vd-legend-arrow">
        <Icon name="up" /> <Icon name="down" />
      </span>{' '}
      a resposta é maior / menor
    </p>
  );
}

/** "Tentativa 3/7" + the misses as small marks. */
export function TryCounter({ used, max }: { used: number; max: number }) {
  return (
    <p className="daily-tally vd-tally">
      <span>
        Tentativa{' '}
        <strong>
          {Math.min(used + 1, max)}/{max}
        </strong>
      </span>
      <span className="vd-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < used ? 'used' : ''} />
        ))}
      </span>
    </p>
  );
}

/** Wrong guesses of the reveal games (Habilidade, Mapa, Callout, Comp), with optional hints per guess. */
export function MissList({ items }: { items: { id: string; label: ReactNode; hint?: ReactNode; hit: boolean }[] }) {
  if (!items.length) return null;
  return (
    <ul className="daily-guesses vd-misses" aria-label="Seus palpites">
      {items.map((it, i) => (
        <li key={it.id} className={it.hit ? 'hit' : 'miss'}>
          <span className="daily-guess-n">{i + 1}</span>
          <Icon name={it.hit ? 'check' : 'close'} />
          <strong>{it.label}</strong>
          {it.hint && <span className="daily-compare">{it.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

/** "Desistir": ends the puzzle as a loss (asks once). */
export function GiveUp({ onGiveUp, note = 'Desistir conta como derrota.' }: { onGiveUp: () => void; note?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button type="button" className="ghost vd-giveup" onClick={() => setAsk(true)}>
        Desistir e ver a resposta
      </button>
    );
  return (
    <p className="vd-giveup-confirm">
      <span>{note}</span>
      <button type="button" className="secondary" onClick={onGiveUp}>
        Desistir
      </button>
      <button type="button" className="ghost" onClick={() => setAsk(false)}>
        Continuar jogando
      </button>
    </p>
  );
}
