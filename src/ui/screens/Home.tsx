import type { DraftMode, RunState } from '../../game/run';
import { MODE_LABELS } from '../../game/run';

interface Props {
  saved: RunState | null;
  onNew: (mode: DraftMode) => void;
  onContinue: () => void;
}

const MODES: { mode: DraftMode; text: string; tag: string }[] = [
  { mode: 'classic', text: 'Roleta de time + evento: escolha 1 jogador por giro. 3 rerolls.', tag: 'Sorte + leitura' },
  { mode: 'ultimate', text: '5 opções fixas por pick, sem reroll. Pura leitura de draft.', tag: 'Só leitura' },
];

export function Home({ saved, onNew, onContinue }: Props) {
  return (
    <div className="screen home">
      <section className="hero">
        <h1 className="title">Road to Champions</h1>
        <p className="context">Valorant · simulador de fã</p>
        <p className="pitch">
          Monte um dream team com cards de pros (jogador + evento), escolha o coach, faça o veto de mapas e tente
          levantar a taça num Champions de 16 times: quatro grupos (A a D) em dupla eliminação e playoffs com chave superior e inferior.
        </p>
      </section>

      {saved && (
        <section className="panel saved-run">
          <h2>Run salva</h2>
          <p className="muted">
            {MODE_LABELS[saved.mode]}
            {saved.teamName ? ` · ${saved.teamName}` : ''} · {phaseText(saved)}
          </p>
          <button type="button" className="primary wide" onClick={onContinue}>
            Continuar run
          </button>
        </section>
      )}

      <section className="modes">
        <h2>Nova run</h2>
        {saved && <p className="small muted">Começar uma nova run substitui a run salva.</p>}
        <div className="mode-list">
          {MODES.map(({ mode, text, tag }) => (
            <button
              key={mode}
              type="button"
              className={`mode-card${saved ? '' : ' featured'}`}
              aria-labelledby={`mode-${mode}`}
              aria-describedby={`mode-${mode}-text`}
              onClick={() => onNew(mode)}
            >
              <span className="mode-tag">{tag}</span>
              <strong id={`mode-${mode}`} className="mode-name">
                {MODE_LABELS[mode]}
              </strong>
              <span id={`mode-${mode}-text`} className="mode-text">
                {text}
              </span>
              <span className="mode-go" aria-hidden="true">
                Começar →
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function phaseText(run: RunState): string {
  switch (run.phase) {
    case 'draft':
      return `draft, pick ${Math.min(run.draft.picks.length + 1, 5)}/5`;
    case 'team':
      return 'time pronto';
    case 'tournament':
      return 'Champions em andamento';
    case 'done':
      return 'Champions encerrado';
  }
}
