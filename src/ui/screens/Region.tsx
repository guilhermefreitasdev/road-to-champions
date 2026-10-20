import { useState } from 'react';
import { REGIONS, type Region as RegionKey } from '../../engine/types';
import { FIELD_MODES, FIELD_MODE_LABELS, FIELD_MODE_TEXT, regionPreview, type FieldMode } from '../../game/season';
import { Icon } from '../components/Icon';
import { TeamLogo } from '../components/TeamLogo';

interface Props {
  field: FieldMode;
  onChoose: (region: RegionKey, field: FieldMode) => void;
}

const BLURBS: Record<RegionKey, string> = {
  americas: 'NA, Brasil e LATAM. Sentinels, LOUD, NRG, KRÜ, LEVIATÁN, G2…',
  emea: 'Europa, CIS e Turquia. Fnatic, Team Liquid, Heretics, Vitality, Karmine Corp, FUT…',
  pacific: 'Coreia, Japão, Sudeste Asiático e Oceania. Paper Rex, DRX, Gen.G, T1, ZETA…',
  china: 'A liga chinesa. EDward Gaming, Bilibili Gaming, FunPlus Phoenix, Trace, XLG…',
};

/** Complete Trials, step 1: pick the server the season starts on, and the field mode. */
export function Region({ field: initial, onChoose }: Props) {
  const [field, setField] = useState<FieldMode>(initial);
  return (
    <div className="screen region-screen">
      <header className="screen-head">
        <h1>Escolha seu servidor</h1>
        <p className="context">Complete Trials</p>
        <p className="muted measure">
          A temporada começa na liga da sua região: o draft sorteia só elencos de times dela (de qualquer época), e os
          3 primeiros da liga vão ao Masters. Dali, o Champions.
        </p>
      </header>

      <fieldset className="field-toggle" aria-describedby="field-text">
        <legend>Campo adversário</legend>
        <div className="segmented" role="radiogroup" aria-label="Campo adversário">
          {FIELD_MODES.map((mode) => (
            <label key={mode} className={`segment${field === mode ? ' is-on' : ''}`}>
              <input type="radio" name="field" value={mode} checked={field === mode} onChange={() => setField(mode)} />
              {FIELD_MODE_LABELS[mode]}
            </label>
          ))}
        </div>
        <p id="field-text" className="small muted">
          {FIELD_MODE_TEXT[field]}
        </p>
      </fieldset>

      <div className="region-grid">
        {REGIONS.map((region) => {
          const preview = regionPreview(region);
          return (
            <button
              key={region}
              type="button"
              className="region-card"
              aria-labelledby={`region-${region}`}
              aria-describedby={`region-${region}-text`}
              onClick={() => onChoose(region, field)}
            >
              <span className="mode-tag">
                {preview.teamCount} times · {preview.rosters} elencos
              </span>
              <strong id={`region-${region}`} className="mode-name">
                {preview.label}
              </strong>
              <span id={`region-${region}-text`} className="mode-text">
                {BLURBS[region]}
              </span>
              <span className="region-logos" aria-hidden="true">
                {preview.teams.map((t) => (
                  <TeamLogo key={t.teamId} teamId={t.teamId} eventId={t.eventId} name={t.name} size={28} />
                ))}
              </span>
              <span className="mode-go" aria-hidden="true">
                Jogar aqui <Icon name="chevron" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
