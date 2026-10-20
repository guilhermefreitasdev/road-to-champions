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

/** The share text with the difficulty as its second line (unless the text already names it). */
export function withDifficulty(text: string, difficulty?: Difficulty): string {
  if (!difficulty) return text;
  const name = DIFFICULTY_LABELS[difficulty].name;
  if (text.includes(name)) return text;
  const [head, ...rest] = text.split('\n');
  return [head, `Dificuldade ${name}`, ...rest].join('\n');
}

/** Spoiler-free share box: the text, copy and (when available) the native share sheet. */
export function SharePanel({
  text: base,
  difficulty,
  title = 'Compartilhe sua run',
  note = 'Sem spoiler: só o caminho, sem nomes de time ou jogador.',
}: {
  text: string;
  difficulty?: Difficulty;
  title?: string;
  note?: string;
}) {
  const text = withDifficulty(base, difficulty);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <section className="panel share-panel" aria-labelledby="share-title">
      <h2 id="share-title">
        {title}
        {difficulty && <DifficultyBadge difficulty={difficulty} />}
      </h2>
      <p className="small muted">{note}</p>
      {/* Exactly what gets copied: plain text, no emoji, so it reads the same in any chat app. */}
      <pre className="share">{text}</pre>
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
