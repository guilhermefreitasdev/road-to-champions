import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from '../../game/difficulty';
import { difficultyLevel } from '../difficulty';
import { Icon } from './Icon';

/** Four pips, `level` of them filled: the difficulty read by shape, not color. */
function Pips({ level }: { level: number }) {
  return (
    <span className="diff-pips" aria-hidden="true">
      {DIFFICULTIES.map((d, i) => (
        <span key={d} className={`diff-pip${i < level ? ' on' : ''}`} />
      ))}
    </span>
  );
}

/** "Difícil ▮▮▮▯": the difficulty of a run, in hubs, end screens, the share panel and the history. */
export function DifficultyBadge({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  const { name } = DIFFICULTY_LABELS[difficulty];
  return (
    <span className={`diff-badge diff-${difficulty}${className ? ` ${className}` : ''}`} title={`Dificuldade: ${name}`}>
      <Pips level={difficultyLevel(difficulty)} />
      <span>
        <span className="sr-only">Dificuldade </span>
        {name}
      </span>
    </span>
  );
}

/**
 * The difficulty of the next game, for every mode: four radio tiles (name, pips, blurb). Arrow keys move between
 * them (native radio group).
 */
export function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <fieldset className="diff-picker">
      <legend className="section-label">Dificuldade</legend>
      <div className="diff-tiles">
        {DIFFICULTIES.map((d) => {
          const { name, blurb } = DIFFICULTY_LABELS[d];
          const on = value === d;
          return (
            <label key={d} className={`diff-tile diff-${d}${on ? ' is-on' : ''}`}>
              <input type="radio" name="difficulty" value={d} checked={on} onChange={() => onChange(d)} aria-describedby={`diff-${d}-blurb`} />
              <span className="diff-tile-head">
                <span className="diff-name">
                  {on && <Icon name="check" className="diff-check" />}
                  {name}
                </span>
                <Pips level={difficultyLevel(d)} />
              </span>
              <span id={`diff-${d}-blurb`} className="diff-blurb">
                {blurb}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
