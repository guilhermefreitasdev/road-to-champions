import { useState, type KeyboardEvent } from 'react';
import type { Card } from '../../engine/types';
import {
  CAREER_STAGE_LABELS,
  LEDGER_LABELS,
  USER_ID,
  autoMidseason,
  autoOffseason,
  careerFinances,
  careerStageOutcome,
  careerStrength,
  careerTeamInfo,
  careerEntrantTeam,
  playerCard,
  startBlocks,
  startStage,
  userPendingMatch,
  type CareerState,
} from '../../game/career';
import { formatDecimal, formatMoney } from '../../game/explain';
import { REGION_LABELS } from '../../game/season';
import { ConfirmBar } from '../components/ConfirmBar';
import { DifficultyBadge } from '../components/Difficulty';
import { Icon, YouTag } from '../components/Icon';
import { OrgEmblem } from '../components/OrgEmblem';
import { TeamLogo } from '../components/TeamLogo';
import { CAREER_TABS, careerPhaseSteps, type CareerTab } from '../careerView';
import { AcademyPanel } from './career/AcademyPanel';
import { CompetitionPanel } from './career/CompetitionPanel';
import { HistoryPanel } from './career/HistoryPanel';
import { MarketPanel } from './career/MarketPanel';
import { RosterPanel } from './career/RosterPanel';
import { ScrimsPanel } from './career/ScrimsPanel';
import { SponsorsPanel } from './career/SponsorsPanel';
import { Meter, type PanelProps } from './career/shared';
import { StatsPanel } from './career/StatsPanel';

interface Props extends PanelProps {
  tab: CareerTab;
  onTab: (t: CareerTab) => void;
  /** Opens (or resumes) the veto of the org's next match. */
  onVeto: () => void;
  /** "Simular partida": plays the next match with the automatic veto and shows the result. */
  onAutoMatch: () => void;
  /** "Simular até a pausa": every match of the phase with the automatic veto. */
  onSimulate: () => void;
  onViewSeries: (key: string) => void;
  onReport: () => void;
  cardOf: (cardId: string) => Card | undefined;
}

/** "Escritório": the career's hub — org, season phase, money and reputation, the next step and the eight tabs. */
export function CareerHub({ c, act, tab, onTab, onVeto, onAutoMatch, onSimulate, onViewSeries, onReport, cardOf }: Props) {
  const fin = careerFinances(c);
  const strength = careerStrength(c);
  const steps = careerPhaseSteps(c);

  const onKeyDown = (e: KeyboardEvent) => {
    const keys = CAREER_TABS.map((t) => t.key);
    const i = keys.indexOf(tab);
    let next: CareerTab | undefined;
    if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(i + keys.length - 1) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    onTab(next);
    const el = document.getElementById(`cr-tab-${next}`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div className="screen career-hub">
      <header className="screen-head cr-head">
        <div className="cr-org">
          <OrgEmblem emblem={c.org.emblem} tag={c.org.tag} size={64} />
          <div className="cr-org-text">
            <h1>
              {c.org.name} <span className="cr-tag">[{c.org.tag}]</span>
            </h1>
            <p className="context">
              Escritório · {REGION_LABELS[c.org.region]} · temporada {c.season} ({c.year})
            </p>
            <p className="head-badges">
              <DifficultyBadge difficulty={c.org.difficulty} />
            </p>
          </div>
        </div>
        <ol className="stage-path career compact" aria-label={`Fases da temporada; agora: ${steps.find((s) => s.state === 'reached')?.label ?? ''}`}>
          {steps.map((s) => (
            <li key={s.key} className={`stage ${s.state}${s.window ? ' market-step' : ''}`} aria-current={s.state === 'reached' ? 'step' : undefined}>
              <span className="stage-dot" aria-hidden="true">
                {s.state === 'passed' && <Icon name="check" />}
                {s.state === 'reached' && <Icon name={s.detail === 'Campeão' ? 'trophy' : s.window ? 'swap' : 'decider'} />}
              </span>
              <span className="stage-label">{s.label}</span>
              {s.detail && <span className="stage-detail small">{s.detail}</span>}
            </li>
          ))}
        </ol>
        <div className="cr-kpis">
          <details className="cr-kpi cr-money">
            <summary>
              <span className="cr-k">Caixa</span>
              <strong className={fin.money < 0 ? 'neg' : ''}>{formatMoney(fin.money)}</strong>
              <span className="small muted cr-more">
                movimentação <Icon name="chevron" />
              </span>
            </summary>
            <Ledger c={c} />
          </details>
          <div className="cr-kpi">
            <span className="cr-k">Reputação</span>
            <Meter value={c.reputation} label="Reputação da org" tone={c.reputation >= 50 ? 'good' : c.reputation < 15 ? 'bad' : 'neutral'} />
          </div>
          <div className="cr-kpi">
            <span className="cr-k">Força</span>
            <strong>{strength ? formatDecimal(strength.total) : '—'}</strong>
          </div>
          <div className="cr-kpi">
            <span className="cr-k">Folha</span>
            <strong>{formatMoney(fin.payroll.total)}</strong>
          </div>
        </div>
      </header>

      {fin.debtWarning && (
        <p className="cr-alert" role="note">
          <Icon name="warning" />
          <span>
            <strong>Alerta de dívida.</strong> A temporada passada terminou no vermelho: nesta não há crédito, e a liga só começa com o
            caixa positivo depois da folha. Terminar de novo no vermelho encerra a carreira (falência).
          </span>
        </p>
      )}
      {!fin.debtWarning && c.phase === 'offseason' && fin.cashAfterStart < 0 && (
        <p className="cr-alert soft" role="note">
          <Icon name="warning" />
          <span>
            A folha vai usar o crédito: caixa depois da largada da liga {formatMoney(fin.cashAfterStart)} (limite {formatMoney(fin.floor)}).
            Terminar a temporada no vermelho liga o alerta de dívida.
          </span>
        </p>
      )}

      <NextStep c={c} act={act} onVeto={onVeto} onAutoMatch={onAutoMatch} onSimulate={onSimulate} onReport={onReport} onTab={onTab} />

      <div className="tabs cr-tabs" role="tablist" aria-label="Escritório" onKeyDown={onKeyDown}>
        {CAREER_TABS.map((t) => (
          <button
            key={t.key}
            id={`cr-tab-${t.key}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.key}
            aria-controls={`cr-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section className="panel cr-tabpanel" id={`cr-panel-${tab}`} role="tabpanel" aria-labelledby={`cr-tab-${tab}`}>
        {tab === 'roster' && <RosterPanel c={c} act={act} />}
        {tab === 'market' && <MarketPanel c={c} act={act} />}
        {tab === 'academy' && <AcademyPanel c={c} act={act} />}
        {tab === 'sponsors' && <SponsorsPanel c={c} act={act} />}
        {tab === 'scrims' && <ScrimsPanel c={c} act={act} onViewSeries={onViewSeries} />}
        {tab === 'competition' && <CompetitionPanel c={c} onViewSeries={onViewSeries} />}
        {tab === 'stats' && <StatsPanel c={c} cardOf={cardOf} />}
        {tab === 'history' && <HistoryPanel c={c} />}
      </section>
    </div>
  );
}

/** This season's money moves and, in the off-season, what the league's start will do to the cash. */
function Ledger({ c }: { c: CareerState }) {
  const fin = careerFinances(c);
  return (
    <div className="cr-ledger">
      <p className="small muted">Início da temporada: {formatMoney(fin.seasonStart)}</p>
      {fin.ledger.length === 0 ? (
        <p className="small muted">Nenhuma movimentação nesta temporada.</p>
      ) : (
        <ul className="cr-plain small cr-ledger-kinds">
          {fin.ledger.map((e, i) => (
            <li key={i}>
              <span>
                {e.label} <span className="muted">· {LEDGER_LABELS[e.kind]}</span>
              </span>
              <span className={e.amount > 0 ? 'pos' : 'neg'}>
                {e.amount > 0 ? '+' : ''}
                {formatMoney(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {c.phase === 'offseason' && (
        <ul className="cr-plain small cr-ledger-kinds cr-projection">
          <li>
            <span>Folha na largada (jogadores + coach)</span>
            <span className="neg">{formatMoney(-fin.payroll.total)}</span>
          </li>
          <li>
            <span>Patrocínio fixo na largada</span>
            <span className="pos">+{formatMoney(fin.sponsorBase)}</span>
          </li>
          <li>
            <strong>Caixa depois da largada</strong>
            <strong className={fin.cashAfterStart < 0 ? 'neg' : ''}>{formatMoney(fin.cashAfterStart)}</strong>
          </li>
        </ul>
      )}
    </div>
  );
}

interface NextProps extends PanelProps {
  onVeto: () => void;
  onAutoMatch: () => void;
  onSimulate: () => void;
  onReport: () => void;
  onTab: (t: CareerTab) => void;
}

/** What to do now: start the league, the next match (veto or simulate), close the window, or read the report. */
function NextStep({ c, act, onVeto, onAutoMatch, onSimulate, onReport, onTab }: NextProps) {
  const [confirm, setConfirm] = useState<'auto-off' | 'auto-mid' | 'start' | null>(null);
  const pending = userPendingMatch(c);

  if (pending) {
    const oppId = pending.match.a === USER_ID ? pending.match.b : pending.match.a;
    const opp = careerTeamInfo(c, oppId);
    const me = careerTeamInfo(c, USER_ID);
    const oppTeam = careerEntrantTeam(c, oppId);
    const vetoStarted = c.veto?.stage === pending.stage && c.veto.matchId === pending.match.id;
    return (
      <section className="panel next-match cr-next" aria-labelledby="cr-next-title">
        <h2 id="cr-next-title" className="next-title">
          Próxima partida
        </h2>
        <p className="context">
          {CAREER_STAGE_LABELS[pending.stage]} · {pending.match.label} · MD{pending.match.bestOf}
        </p>
        <div className="versus">
          <span className="vs-team mine">
            <OrgEmblem emblem={c.org.emblem} tag={c.org.tag} size={32} />
            <strong>{me.name}</strong>
            <YouTag />
            <span className="small muted">
              seed {me.seed} · força {formatDecimal(me.strength)}
            </span>
          </span>
          <span className="vs">vs</span>
          <span className="vs-team">
            <TeamLogo teamId={oppTeam.teamId} {...(oppTeam.eventId ? { eventId: oppTeam.eventId } : {})} name={opp.name} size={32} />
            <strong>{opp.name}</strong>
            <span className="small muted">
              {REGION_LABELS[opp.region]} · seed {opp.seed} · força {formatDecimal(opp.strength)}
            </span>
          </span>
        </div>
        <div className="cr-next-actions">
          <button type="button" className="primary" onClick={onVeto}>
            {vetoStarted ? 'Continuar veto' : 'Ir para o veto'}
          </button>
          <button type="button" className="secondary" onClick={onAutoMatch}>
            <Icon name="skip" /> Simular partida
          </button>
          <button type="button" className="secondary" onClick={onSimulate}>
            <Icon name="skip" /> Simular até a próxima pausa
          </button>
        </div>
        <p className="small muted">Simular usa o veto automático (como a IA) e não mexe no elenco. A pausa é a janela do meio ou o fim da temporada.</p>
      </section>
    );
  }

  if (c.phase === 'offseason' || c.phase === 'midseason') {
    const blocks = startBlocks(c);
    const off = c.phase === 'offseason';
    const leaving = off ? c.players.filter((p) => p.contract.years <= 0) : [];
    const league = careerStageOutcome(c, 'league').place;
    const qual = !off && league ? (league.rank <= 3 ? `Liga ${league.label}: você vai ao Masters e ao Champions.` : league.rank === 4 ? 'Liga 4º: o Masters é jogado sem você; você está no Champions.' : `Liga ${league.label}: fora do Masters e do Champions. A temporada segue sem você até o relatório.`) : null;
    const w = c.window;
    const start = () => {
      setConfirm(null);
      act(startStage, off ? 'A liga começou: folha paga e patrocínio fixo no caixa' : 'Janela fechada');
    };
    return (
      <section className="panel cr-next" aria-labelledby="cr-next-title">
        <h2 id="cr-next-title" className="next-title">
          {off ? 'Pré-temporada' : 'Janela do meio da temporada'}
        </h2>
        <p className="small muted measure">
          {off
            ? 'Monte o elenco (5 titulares com contrato), feche patrocínios, contrate um coach e use os scrims. A folha salarial é paga quando a liga começa.'
            : `Até ${w?.maxSignings ?? 2} contratações (${w?.signings ?? 0} feitas), pagando metade do salário na hora. Scrims contam para o Masters.`}
        </p>
        {qual && <p className="cr-qual">{qual}</p>}
        {blocks.length > 0 ? (
          <ul className="cr-plain cr-blocks-list" id="cr-start-blocks">
            {blocks.map((b) => (
              <li key={b}>
                <Icon name="lock" /> {b}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cr-ready small">
            <Icon name="check" /> Tudo pronto para {off ? 'a liga' : 'seguir'}.
          </p>
        )}
        {confirm === 'auto-off' || confirm === 'auto-mid' ? (
          <ConfirmBar
            title={off ? 'Deixar o gerente automático montar a pré-temporada?' : 'Deixar o gerente automático fazer a janela?'}
            text={
              off
                ? 'Ele renova quem ainda serve, aceita os patrocínios que mais pagam, contrata coach e jogadores dentro do caixa, escala o time e usa os scrims. Gasta dinheiro de verdade; confira o elenco depois.'
                : 'Ele preenche vagas, faz até 1 troca que suba a força, promove da base quem alcançou o time e usa os scrims.'
            }
            confirmLabel="Usar o automático"
            onConfirm={() => {
              setConfirm(null);
              act((x) => (off ? autoOffseason(x) : autoMidseason(x)), off ? 'Pré-temporada montada pelo automático: confira o elenco' : 'Janela feita pelo automático');
            }}
            onCancel={() => setConfirm(null)}
          />
        ) : confirm === 'start' ? (
          <ConfirmBar
            title="Começar a liga?"
            text={`${leaving.map((p) => playerCard(p, false).handle).join(', ')} ${leaving.length === 1 ? 'sai' : 'saem'} sem contrato. A folha é paga agora e o mercado fecha até o meio da temporada.`}
            confirmLabel="Começar a liga"
            onConfirm={start}
            onCancel={() => setConfirm(null)}
          />
        ) : (
          <div className="cr-next-actions">
            <button
              type="button"
              className="primary"
              disabled={blocks.length > 0}
              aria-describedby={blocks.length > 0 ? 'cr-start-blocks' : undefined}
              onClick={() => (leaving.length > 0 ? setConfirm('start') : start())}
            >
              {off ? 'Começar a liga' : 'Fechar a janela e seguir'}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirm(off ? 'auto-off' : 'auto-mid')}>
              <Icon name="dice" /> Auto: {off ? 'montar a pré-temporada' : 'fazer a janela'}
            </button>
            <button type="button" className="ghost" onClick={() => onTab(off ? 'roster' : 'market')}>
              {off ? 'Ver elenco' : 'Ver mercado'}
            </button>
          </div>
        )}
      </section>
    );
  }

  if (c.phase === 'report' || c.phase === 'over') {
    return (
      <section className="panel cr-next" aria-labelledby="cr-next-title">
        <h2 id="cr-next-title" className="next-title">
          Temporada encerrada
        </h2>
        <p className="small muted">O relatório tem as colocações, os prêmios, os patrocínios e o dinheiro da temporada.</p>
        <div className="cr-next-actions">
          <button type="button" className="primary" onClick={onReport}>
            Ver relatório da temporada
          </button>
        </div>
      </section>
    );
  }
  return null;
}
