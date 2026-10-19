import { useState } from 'react';
import { formatDecimal } from '../../game/explain';
import { MODE_LABELS, runSummary, shareText, type RunState } from '../../game/run';
import { Results } from '../components/Results';

interface Props {
  run: RunState;
  onNewRun: () => void;
  onViewSeries: (matchId: string) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function End({ run, onNewRun, onViewSeries }: Props) {
  const s = runSummary(run);
  const text = shareText(run);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const nameOf = (id: string) => run.tournament!.entrants.find((e) => e.id === id)?.name ?? id;
  const champion = !!s.finish?.champion;

  return (
    <div className="screen end">
      <header className={`end-hero${champion ? ' champion' : ''}`}>
        <p className="eyebrow">{MODE_LABELS[s.mode]} · Fim da run</p>
        <h1>{champion ? '🏆 Campeão!' : s.finish?.place === '2º' ? 'Vice-campeão' : 'Eliminado'}</h1>
        <p className="end-place">
          <strong>{s.finish?.place ?? '—'}</strong> {s.finish && !champion ? `· ${s.finish.label}` : ''}
        </p>
        <p className="muted">{s.teamName}</p>
      </header>

      <section className="panel">
        <h2>Resumo</h2>
        <dl className="summary">
          <div>
            <dt>Força do time</dt>
            <dd>{formatDecimal(s.strength)}</dd>
          </div>
          <div>
            <dt>Suíça</dt>
            <dd>
              {s.record.swiss.wins}-{s.record.swiss.losses}
            </dd>
          </div>
          <div>
            <dt>Playoffs</dt>
            <dd>
              {s.record.playoffs.wins + s.record.playoffs.losses > 0
                ? `${s.record.playoffs.wins}-${s.record.playoffs.losses}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Mapas</dt>
            <dd>
              {s.record.mapsWon}-{s.record.mapsLost}
            </dd>
          </div>
          {s.mvp && (
            <div>
              <dt>MVP</dt>
              <dd>
                {s.mvp.handle} · ACS {s.mvp.acs} · K/D/A {s.mvp.kills}/{s.mvp.deaths}/{s.mvp.assists}
              </dd>
            </div>
          )}
          {!champion && s.championName && (
            <div>
              <dt>Campeão</dt>
              <dd>{s.championName}</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2>Suas partidas</h2>
        <Results matches={s.record.results.map((r) => r.match)} nameOf={nameOf} onView={onViewSeries} />
      </section>

      <section className="panel">
        <h2>Compartilhar</h2>
        <pre className="share">{text}</pre>
        <button
          type="button"
          className="primary wide"
          onClick={async () => setCopied((await copyText(text)) ? 'ok' : 'fail')}
        >
          Copiar resultado
        </button>
        <p className="small muted" aria-live="polite">
          {copied === 'ok' ? 'Copiado!' : copied === 'fail' ? 'Não deu para copiar: selecione o texto acima.' : ''}
        </p>
      </section>

      <button type="button" className="secondary wide" onClick={onNewRun}>
        Nova run
      </button>
    </div>
  );
}
