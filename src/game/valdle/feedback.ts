/**
 * Per-attribute feedback of the guess games (Agente Clássico, Arma, Pro Clássico): every column of a guess is a hit
 * (same value), a partial hit (close, as each column defines it) or a miss, plus an arrow on numbers pointing to the
 * answer ("up" = the answer is higher). Pure.
 */

export type Mark = 'hit' | 'partial' | 'miss';
export type Arrow = 'up' | 'down' | null;

export interface Feedback {
  mark: Mark;
  arrow: Arrow;
}

/** Same value (two unknowns count as the same). */
export function exact<T>(guess: T | null, answer: T | null): Feedback {
  return { mark: guess === answer ? 'hit' : 'miss', arrow: null };
}

/** Same value is a hit; `partial(guess, answer)` decides the partial hits of the rest. */
export function exactOr<T>(guess: T | null, answer: T | null, partial: (g: T, a: T) => boolean): Feedback {
  if (guess === answer) return { mark: 'hit', arrow: null };
  if (guess !== null && answer !== null && partial(guess, answer)) return { mark: 'partial', arrow: null };
  return { mark: 'miss', arrow: null };
}

/**
 * Numbers: equal = hit; within `near` = partial; arrows point from the guess to the answer. An unknown on either
 * side gives no arrow (a miss, unless both are unknown).
 */
export function numeric(guess: number | null, answer: number | null, near = 0): Feedback {
  if (guess === null || answer === null) return { mark: guess === answer ? 'hit' : 'miss', arrow: null };
  if (guess === answer) return { mark: 'hit', arrow: null };
  return { mark: Math.abs(guess - answer) <= near ? 'partial' : 'miss', arrow: answer > guess ? 'up' : 'down' };
}

/** A column of a guess game: its pt-BR title and how a guess compares to the answer. */
export interface Column<T> {
  key: string;
  label: string;
  compare: (guess: T, answer: T) => Feedback;
}

export function compareAll<T>(columns: readonly Column<T>[], guess: T, answer: T): Feedback[] {
  return columns.map((c) => c.compare(guess, answer));
}
