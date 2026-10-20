import { useState } from 'react';
import { dayKeyAt } from '../../game/daily/calendar';
import { GROUP_GAMES, VALDLE_GAMES } from '../../game/valdle/games';
import { doneToday } from '../../game/valdle/play';
import { loadValdleStore } from '../valdleStorage';
import { Icon } from './Icon';

/**
 * "Outros modos" on the home page: the Valdle's two versions with today's puzzles done. Reads only localStorage
 * (no data), so it shows before the game loads; the button waits for it.
 */
export function OutrosHomeCard({ onOpen }: { onOpen?: (() => void) | undefined }) {
  const [store] = useState(loadValdleStore);
  const done = doneToday(store, dayKeyAt(new Date()));
  const count = (g: 'cena' | 'classico') => GROUP_GAMES[g].filter((id) => done[id]).length;
  return (
    <section className="outros-home" aria-labelledby="outros-home-title">
      <button type="button" className="pill-card outros-home-card" disabled={!onOpen} onClick={onOpen}>
        <Icon name="puzzle" className="pill-icon" />
        <span className="pill-text">
          <strong id="outros-home-title">Outros modos</strong>
          <span className="small muted">
            Valdle da cena pro ({count('cena')}/{GROUP_GAMES.cena.length} hoje) e do jogo clássico ({count('classico')}/{GROUP_GAMES.classico.length} hoje):{' '}
            {[...GROUP_GAMES.cena, ...GROUP_GAMES.classico]
              .slice(0, 4)
              .map((g) => VALDLE_GAMES[g].label)
              .join(', ')}
            …
          </span>
        </span>
        <span className="pill-go">{onOpen ? 'Jogar' : 'Carregando'}</span>
      </button>
    </section>
  );
}
