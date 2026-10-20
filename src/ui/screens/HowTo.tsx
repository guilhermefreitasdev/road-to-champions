import { CLASSIC_REROLLS } from '../../engine/draft';
import { NO_IGL_CAP, NO_IGL_FACTOR } from '../../engine/team';
import { Icon, type IconName } from '../components/Icon';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'cards',
    title: 'Draft',
    text: `Cada card é um jogador num evento real ("aspas @ LOUD, Champions 2022"), com OVR e atributos calculados dos números do VLR.gg. No Draft clássico a roleta sorteia um time e um evento e você leva 1 jogador desse elenco (${CLASSIC_REROLLS} rerolls); no Ultimate Draft são 5 opções fixas por pick, sem reroll.`,
  },
  {
    icon: 'swap',
    title: 'Vagas e encaixe',
    text: 'Duelista, Iniciador, Controlador, Sentinela e Flex. Na própria função o card rende 100% do OVR, na vaga Flex 90% e fora da função 75%. Um flex nato (jogou duas ou mais funções) rende 100% nessas funções e no Flex.',
  },
  {
    icon: 'mic',
    title: 'IGL e coach',
    text: `O IGL faz as calls. Sem IGL, a Tomada de decisão cai ${Math.round((1 - NO_IGL_FACTOR) * 100)}% (máx. ${NO_IGL_CAP}): o time compra pior depois de perder e se adapta menos. O coach é o último pick: soma tática em todo mapa e revela o adversário no veto.`,
  },
  {
    icon: 'ban',
    title: 'Veto',
    text: 'Antes de cada série você e o adversário banem e escolhem mapas. Escolha os mapas em que seu time rende e tire os do rival.',
  },
  {
    icon: 'play',
    title: 'Partidas',
    text: 'Cada mapa é simulado round a round. Assista ao vivo em 1x, 2x ou 4x, pause ou pule para o fim; o placar completo, com o agente de cada jogador, fica salvo na série.',
  },
  {
    icon: 'trophy',
    title: 'Champions',
    text: '16 times em quatro grupos de dupla eliminação; os 2 primeiros de cada grupo vão aos playoffs, também em dupla eliminação. A run termina quando você é eliminado ou levanta a taça.',
  },
  {
    icon: 'globe',
    title: 'Complete Trials',
    text: 'Escolha um servidor (Americas, EMEA, Pacific ou China), drafte só com times de lá e jogue a liga regional de 12 times. Os 3 primeiros vão ao Masters; de lá, ao Champions.',
  },
  {
    icon: 'stats',
    title: 'Estatísticas e histórico',
    text: 'No torneio e no fim da run, veja K/D/A, ACS, rating, KAST e multikills dos seus cinco, com os agentes de cada um. Runs terminadas ficam no Histórico deste navegador.',
  },
];

/** "Como jogar": the rules in one page, numbers taken from the engine so they never drift. */
export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen howto">
      <header className="screen-head">
        <h1>Como jogar</h1>
        <p className="context">Do draft à taça em oito passos</p>
      </header>
      <ol className="howto-list">
        {STEPS.map((s) => (
          <li key={s.title} className="howto-item">
            <span className="howto-icon">
              <Icon name={s.icon} />
            </span>
            <span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="primary wide" onClick={onBack}>
        Jogar
      </button>
    </div>
  );
}
