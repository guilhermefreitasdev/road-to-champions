import { useId, useMemo, useRef, useState } from 'react';
import type { DailyPlayer } from '../../game/daily/data';
import { normalizeName, rankMatches } from '../../game/daily/text';
import { CountryChip } from './CountryChip';
import { Icon } from './Icon';

/**
 * Player name input with autocomplete over every player handle of the data (case- and accent-insensitive), as an
 * ARIA combobox: arrows move through the suggestions, Enter picks (the highlighted one, else an exact match, else
 * the first), Escape closes. Players sharing a handle are told apart by country and last team.
 */
export function PlayerSearch({
  players,
  onPick,
  disabled,
  label,
  placeholder = 'Digite o nome do jogador',
  submitLabel = 'Chutar',
}: {
  players: readonly DailyPlayer[];
  onPick: (p: DailyPlayer) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => rankMatches(text, players, (p) => p.handle, 8), [text, players]);

  const pick = (p: DailyPlayer) => {
    onPick(p);
    setText('');
    setOpen(false);
    setActive(-1);
    setNotFound(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!text.trim()) return;
    const chosen = (active >= 0 ? matches[active] : undefined) ?? matches.find((p) => p.norm === normalizeName(text)) ?? matches[0];
    if (chosen) pick(chosen);
    else setNotFound(true);
  };

  const listId = `${id}-list`;
  const showList = open && matches.length > 0 && !disabled;
  return (
    <form
      className="player-search"
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
          {matches.map((p, i) => (
            <li
              key={p.playerId}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <strong translate="no">{p.handle}</strong>
              <CountryChip code={p.country} />
              <span className="small muted">{p.lastTeamName}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="small player-search-note" aria-live="polite">
        {notFound ? 'Nenhum jogador com esse nome na base. Confira a grafia.' : ''}
      </p>
    </form>
  );
}
