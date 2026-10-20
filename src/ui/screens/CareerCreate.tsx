import { useId, useState, type FormEvent } from 'react';
import { REGIONS, type Region } from '../../engine/types';
import { CAREER_DIFFICULTY, ORG_TAG_MAX, cleanTag, type CreateCareerInput, type OrgEmblem as OrgEmblemValue } from '../../game/career';
import { currentTeamsOf } from '../../game/career/world';
import { DIFFICULTY_LABELS, type Difficulty } from '../../game/difficulty';
import { formatMoney } from '../../game/explain';
import { REGION_LABELS } from '../../game/season';
import { TEAM_NAME_MAX } from '../../game/run';
import { DifficultyPicker } from '../components/Difficulty';
import { Icon } from '../components/Icon';
import { DEFAULT_EMBLEM, EMBLEM_COLORS, EMBLEM_SHAPES, OrgEmblem } from '../components/OrgEmblem';
import { TeamLogo } from '../components/TeamLogo';

interface Props {
  difficulty: Difficulty;
  /** A saved career exists: founding a new org replaces it. */
  replaces: boolean;
  onCreate: (input: Omit<CreateCareerInput, 'seed'>) => void;
  onBack: () => void;
}

const BLURBS: Record<Region, string> = {
  americas: 'NA, Brasil e LATAM: liga com Sentinels, LOUD, NRG, G2, KRÜ, LEVIATÁN…',
  emea: 'Europa, CIS e Turquia: Fnatic, Team Liquid, Heretics, Vitality, Karmine Corp…',
  pacific: 'Coreia, Japão, Sudeste Asiático e Oceania: Paper Rex, DRX, Gen.G, T1…',
  china: 'A liga chinesa: EDward Gaming, Bilibili Gaming, FunPlus Phoenix, Trace…',
};

const TAG_MIN = 3;

/** Carreira, step 0: found the org (name, tag, emblem, region and difficulty). */
export function CareerCreate({ difficulty: initialDifficulty, replaces, onCreate, onBack }: Props) {
  const id = useId();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [region, setRegion] = useState<Region>('americas');
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [emblem, setEmblem] = useState<OrgEmblemValue>(DEFAULT_EMBLEM);
  const [submitted, setSubmitted] = useState(false);

  const typedTag = tag.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nameError = name.trim().length === 0 ? 'Dê um nome à sua org.' : null;
  const tagError = typedTag.length > 0 && typedTag.length < TAG_MIN ? `A tag tem de ${TAG_MIN} a ${ORG_TAG_MAX} letras ou números.` : null;
  const shownTag = cleanTag(typedTag || undefined, name.trim() || 'Minha Org');
  const start = CAREER_DIFFICULTY[difficulty];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || tagError) {
      document.getElementById(nameError ? `${id}-name` : `${id}-tag`)?.focus();
      return;
    }
    onCreate({ name: name.trim(), tag: shownTag, region, difficulty, emblem });
  };

  return (
    <form className="screen career-create" onSubmit={submit} noValidate>
      <header className="screen-head">
        <h1>Funde a sua org</h1>
        <p className="context">Carreira</p>
        <p className="muted measure">
          Comece do zero numa região, monte o elenco no mercado, feche patrocínios e dispute a liga, o Masters e o Champions,
          temporada após temporada. Os jogadores envelhecem, evoluem e ganham aura com os resultados.
        </p>
      </header>

      <section className="panel cc-identity" aria-labelledby={`${id}-identity`}>
        <h2 id={`${id}-identity`}>Identidade</h2>
        <div className="cc-identity-grid">
          <div className="cc-preview" aria-hidden="true">
            <OrgEmblem emblem={emblem} tag={shownTag} size={96} />
            <strong className="cc-preview-name">{name.trim() || 'Sua org'}</strong>
            <span className="cc-preview-tag">[{shownTag}]</span>
          </div>
          <div className="cc-fields">
            <label className="field" htmlFor={`${id}-name`}>
              Nome da org
              <input
                id={`${id}-name`}
                name="org-name"
                value={name}
                maxLength={TEAM_NAME_MAX}
                autoComplete="off"
                spellCheck={false}
                placeholder="Ex.: Furia Azul"
                aria-invalid={submitted && !!nameError}
                aria-describedby={submitted && nameError ? `${id}-name-err` : undefined}
                onChange={(e) => setName(e.target.value)}
              />
              {submitted && nameError && (
                <span id={`${id}-name-err`} className="field-error">
                  <Icon name="warning" /> {nameError}
                </span>
              )}
            </label>
            <label className="field" htmlFor={`${id}-tag`}>
              Tag ({TAG_MIN}–{ORG_TAG_MAX} letras)
              <input
                id={`${id}-tag`}
                name="org-tag"
                value={typedTag}
                maxLength={ORG_TAG_MAX}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                placeholder={shownTag}
                aria-invalid={!!tagError}
                aria-describedby={`${id}-tag-hint`}
                onChange={(e) => setTag(e.target.value)}
              />
              <span id={`${id}-tag-hint`} className={tagError ? 'field-error' : 'small muted'}>
                {tagError ? (
                  <>
                    <Icon name="warning" /> {tagError}
                  </>
                ) : typedTag ? (
                  'Aparece nas tabelas e no escudo.'
                ) : (
                  `Vazia: usamos as iniciais (${shownTag}).`
                )}
              </span>
            </label>
          </div>
        </div>

        <fieldset className="cc-choice">
          <legend>Escudo</legend>
          <div className="cc-shapes">
            {EMBLEM_SHAPES.map((s) => (
              <label key={s.key} className={`cc-shape${emblem.shape === s.key ? ' is-on' : ''}`}>
                <input type="radio" name="emblem-shape" value={s.key} checked={emblem.shape === s.key} onChange={() => setEmblem({ ...emblem, shape: s.key })} />
                <OrgEmblem emblem={{ ...emblem, shape: s.key }} tag={shownTag} size={40} />
                <span className="small">{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="cc-choice">
          <legend>Cor</legend>
          <div className="cc-colors">
            {EMBLEM_COLORS.map((c) => (
              <label key={c.key} className={`cc-color${emblem.color === c.key ? ' is-on' : ''}`}>
                <input type="radio" name="emblem-color" value={c.key} checked={emblem.color === c.key} onChange={() => setEmblem({ ...emblem, color: c.key })} />
                <span className="cc-swatch" style={{ background: c.value }} aria-hidden="true">
                  {emblem.color === c.key && <Icon name="check" />}
                </span>
                <span className="small">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <fieldset className="cc-region">
        <legend className="section-label">Região</legend>
        <p className="small muted measure">
          A sua liga tem 12 times: a sua org e 11 elencos atuais da região. Os 3 primeiros vão ao Masters, os 4 primeiros ao
          Champions.
        </p>
        <div className="region-grid">
          {REGIONS.map((r) => {
            const teams = currentTeamsOf(r);
            const on = region === r;
            return (
              <label key={r} className={`region-card cc-region-card${on ? ' is-on' : ''}`}>
                <input type="radio" name="region" value={r} checked={on} onChange={() => setRegion(r)} aria-describedby={`${id}-${r}-text`} />
                <span className="mode-tag">{teams.length} times atuais</span>
                <strong className="mode-name">
                  {on && <Icon name="check" className="cc-check" />}
                  {REGION_LABELS[r]}
                </strong>
                <span id={`${id}-${r}-text`} className="mode-text">
                  {BLURBS[r]}
                </span>
                <span className="region-logos" aria-hidden="true">
                  {teams.slice(0, 6).map((t) => (
                    <TeamLogo key={t.teamId} teamId={t.teamId} eventId={t.eventId} name={t.teamName} size={28} />
                  ))}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="cc-difficulty">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <p className="small muted cc-start">
          {DIFFICULTY_LABELS[difficulty].name}: caixa inicial <strong>{formatMoney(start.money)}</strong> e reputação{' '}
          <strong>{start.reputation}</strong>. A reputação decide quem aceita jogar por você e quais patrocinadores aparecem.
        </p>
      </div>

      <div className="cc-actions">
        {replaces && (
          <p className="mode-warn small">
            <Icon name="warning" /> Fundar uma nova org substitui a carreira salva.
          </p>
        )}
        <button type="submit" className="primary big wide">
          Fundar {name.trim() || 'a org'}
        </button>
        <button type="button" className="secondary wide" onClick={onBack}>
          <Icon name="back" /> Voltar ao início
        </button>
      </div>
    </form>
  );
}
