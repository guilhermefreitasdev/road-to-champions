import { useState } from 'react';
import { DIFFICULTY_LABELS, type Difficulty } from '../../game/difficulty';
import { DifficultyBadge } from './Difficulty';
import { Icon } from './Icon';

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

const TOKENS = /(\u{1F7E9}|\u{1F7E5}|\u{1F3C6})/u;

/**
 * The share text as shown on the page: the result squares and the trophy are drawn (SVG/CSS), not emoji; the copied
 * text keeps them, since that is what chat apps render.
 */
function SharePreview({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKENS).map((part, i) =>
        part === '\u{1F7E9}' ? (
          <span key={i} className="share-sq w" role="img" aria-label="vitória" />
        ) : part === '\u{1F7E5}' ? (
          <span key={i} className="share-sq l" role="img" aria-label="derrota" />
        ) : part === '\u{1F3C6}' ? (
          <Icon key={i} name="trophy" label="título" className="share-trophy" />
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The share text with the difficulty as its second line (unless the text already names it). */
export function withDifficulty(text: string, difficulty?: Difficulty): string {
  if (!difficulty) return text;
  const name = DIFFICULTY_LABELS[difficulty].name;
  if (text.includes(name)) return text;
  const [head, ...rest] = text.split('\n');
  return [head, `Dificuldade ${name}`, ...rest].join('\n');
}

/** Spoiler-free share box: the text, copy and (when available) the native share sheet. */
export function SharePanel({ text: base, difficulty }: { text: string; difficulty?: Difficulty }) {
  const text = withDifficulty(base, difficulty);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <section className="panel share-panel" aria-labelledby="share-title">
      <h2 id="share-title">
        Compartilhe sua run
        {difficulty && <DifficultyBadge difficulty={difficulty} />}
      </h2>
      <p className="small muted">Sem spoiler: só o caminho, sem nomes de time ou jogador.</p>
      <pre className="share">
        <SharePreview text={text} />
      </pre>
      <div className="share-actions">
        <button
          type="button"
          className="primary"
          onClick={async () => setCopied((await copyText(text)) ? 'ok' : 'fail')}
        >
          <Icon name="copy" /> Copiar resultado
        </button>
        {canShare && (
          <button type="button" className="secondary" onClick={() => navigator.share({ text }).catch(() => undefined)}>
            <Icon name="share" /> Compartilhar…
          </button>
        )}
      </div>
      <p className="small share-feedback" aria-live="polite">
        {copied === 'ok'
          ? 'Copiado! Cole no chat ou na rede social.'
          : copied === 'fail'
            ? 'Não deu para copiar: selecione o texto acima.'
            : ''}
      </p>
    </section>
  );
}
