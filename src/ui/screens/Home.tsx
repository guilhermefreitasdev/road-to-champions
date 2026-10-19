import type { DraftMode, RunState } from '../../game/run';
import { MODE_LABELS } from '../../game/run';
import { REGION_LABELS, STAGE_LABELS, isCompStage, type SeasonState } from '../../game/season';

interface Props {
  saved: RunState | null;
  savedSeason: SeasonState | null;
  onNew: (mode: DraftMode) => void;
  onContinue: () => void;
  onNewSeason: () => void;
  onContinueSeason: () => void;
}

const MODES: { mode: DraftMode; text: string; tag: string }[] = [
  { mode: 'classic', text: 'Roleta de time + evento: escolha 1 jogador por giro. 3 rerolls.', tag: 'Sorte + leitura' },
  { mode: 'ultimate', text: '5 opções fixas por pick, sem reroll. Pura leitura de draft.', tag: 'Só leitura' },
];

export function Home({ saved, savedSeason, onNew, onContinue, onNewSeason, onContinueSeason }: Props) {
  const anySaved = !!saved || !!savedSeason;
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

      {savedSeason && (
        <section className="panel saved-run">
          <h2>Temporada salva</h2>
          <p className="muted">
            Complete Trials
            {savedSeason.region ? ` · ${REGION_LABELS[savedSeason.region]}` : ''}
            {savedSeason.teamName ? ` · ${savedSeason.teamName}` : ''} · {seasonText(savedSeason)}
          </p>
          <button type="button" className="primary wide" onClick={onContinueSeason}>
            Continuar temporada
          </button>
        </section>
      )}

      <section className="modes">
        <h2>Nova run</h2>
        {anySaved && <p className="small muted">Começar uma nova run substitui a run salva do mesmo tipo.</p>}
        <div className="mode-list">
          {MODES.map(({ mode, text, tag }) => (
            <button
              key={mode}
              type="button"
              className={`mode-card${anySaved ? '' : ' featured'}`}
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
          <button
            type="button"
            className="mode-card trials"
            aria-labelledby="mode-trials"
            aria-describedby="mode-trials-text"
            onClick={onNewSeason}
          >
            <span className="mode-tag">Temporada completa</span>
            <strong id="mode-trials" className="mode-name">
              Complete Trials
            </strong>
            <span id="mode-trials-text" className="mode-text">
              Comece do seu servidor: escolha Americas, EMEA, Pacific ou China, drafte só com times de lá e dispute a liga
              regional (12 times). Os 3 primeiros vão ao Masters; de lá, o Champions.
            </span>
            <span className="mode-go" aria-hidden="true">
              Escolher servidor →
            </span>
          </button>
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

function seasonText(s: SeasonState): string {
  if (s.stage === 'region') return 'escolha do servidor';
  if (s.stage === 'draft') return `draft, pick ${Math.min((s.draft?.picks.length ?? 0) + 1, 5)}/5`;
  if (s.stage === 'team') return 'time pronto';
  if (isCompStage(s.stage)) return `${STAGE_LABELS[s.stage]} em andamento`;
  return 'temporada encerrada';
}
