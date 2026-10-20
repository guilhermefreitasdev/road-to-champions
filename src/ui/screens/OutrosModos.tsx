import { Suspense, useRef, useState } from 'react';
import { ScreenLoading } from '../Frame';
import { Icon } from '../components/Icon';
import { OTHER_MODES } from './outros/modes';

/**
 * "Outros modos": a hub of side games apart from the main game (docs/design.md, "Outros modos"). The list comes from
 * ./outros/modes.ts; each live mode is its own lazy screen and gets `onBack` to return here.
 */
export function OutrosModos({ onExit }: { onExit: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const go = (id: string | null) => {
    setOpen(id);
    window.scrollTo(0, 0);
    topRef.current?.focus({ preventScroll: true });
  };
  const mode = OTHER_MODES.find((m) => m.id === open && m.status === 'live' && m.screen);
  if (mode?.screen) {
    const Screen = mode.screen;
    return (
      <div ref={topRef} tabIndex={-1} className="outros-frame">
        <Suspense fallback={<ScreenLoading />}>
          <Screen onBack={() => go(null)} />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="screen outros" ref={topRef} tabIndex={-1}>
      <header className="screen-head">
        <p className="daily-kicker">
          <Icon name="puzzle" /> Fora do Champions
        </p>
        <h1>Outros modos</h1>
        <p className="context">Jogos rápidos à parte do modo principal, com desafios diários iguais para todos e modo livre.</p>
      </header>
      <ul className="outros-list">
        {OTHER_MODES.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={`outros-card ${m.status}`}
              disabled={m.status !== 'live'}
              onClick={() => go(m.id)}
              onPointerEnter={() => void m.screen?.preload?.().catch(() => undefined)}
              aria-describedby={`outros-${m.id}-text`}
            >
              <span className="outros-card-icon" aria-hidden="true">
                <Icon name={m.icon} />
              </span>
              <span className="outros-card-text">
                <strong>
                  {m.title}
                  {m.status === 'soon' && <span className="outros-soon">Em breve</span>}
                </strong>
                <span id={`outros-${m.id}-text`} className="small muted">
                  {m.blurb}
                </span>
                {m.tags && (
                  <span className="outros-tags">
                    {m.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </span>
                )}
              </span>
              <span className="outros-card-go" aria-hidden="true">
                {m.status === 'live' ? <Icon name="chevron" /> : <Icon name="lock" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="daily-actions">
        <button type="button" className="ghost" onClick={onExit}>
          <Icon name="back" /> Voltar ao início
        </button>
      </div>
    </div>
  );
}
