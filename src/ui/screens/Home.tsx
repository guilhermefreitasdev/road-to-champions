import type { DraftMode, RunState } from '../../game/run';
import { MODE_LABELS } from '../../game/run';

interface Props {
  saved: RunState | null;
  onNew: (mode: DraftMode) => void;
  onContinue: () => void;
}

const MODES: { mode: DraftMode; text: string }[] = [
  { mode: 'classic', text: 'Roleta de time + evento: escolha 1 jogador por giro. 3 rerolls.' },
  { mode: 'ultimate', text: '5 opções fixas por pick, sem reroll. Pura leitura de draft.' },
];

export function Home({ saved, onNew, onContinue }: Props) {
  return (
    <div className="screen home">
      <section className="hero">
        <p className="eyebrow">Valorant · simulador de fã</p>
        <h1 className="title">Road to Champions</h1>
        <p className="pitch">
          Monte um dream team com cards de pros (jogador + evento), escolha o coach, faça o veto de mapas e tente
          levantar a taça num Champions de 16 times: fase suíça e playoffs em dupla eliminação.
        </p>
      </section>

      {saved && (
        <section className="panel">
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
        {MODES.map(({ mode, text }) => (
          <div key={mode} className="mode">
            <button type="button" className={saved ? 'secondary wide' : 'primary wide'} onClick={() => onNew(mode)}>
              {MODE_LABELS[mode]}
            </button>
            <p className="small muted">{text}</p>
          </div>
        ))}
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
