import type { ComponentType } from 'react';
import type { IconName } from '../../components/Icon';
import { lazyScreen } from '../../lazyScreen';

/**
 * The cards of the "Outros modos" hub, in order. Data-driven: a new mode is one entry here. An entry with a `screen`
 * opens it (a lazy chunk, receiving `onBack`); `status: 'soon'` shows the card as "em breve", not clickable.
 */
export interface OtherModeEntry {
  id: string;
  title: string;
  blurb: string;
  icon: IconName;
  status: 'live' | 'soon';
  /** Games or parts of the mode, shown as tags on the card. */
  tags?: readonly string[];
  screen?: ComponentType<{ onBack: () => void }> & { preload?: () => Promise<unknown> };
}

const ValdleCena = lazyScreen(() => import('../valdle/Valdle').then((m) => m.ValdleCena));
const ValdleClassico = lazyScreen(() => import('../valdle/Valdle').then((m) => m.ValdleClassico));
const Ace = lazyScreen(() => import('../ace/Ace').then((m) => m.Ace));

export const OTHER_MODES: readonly OtherModeEntry[] = [
  {
    id: 'valdle-cena',
    title: 'Valdle — Cena pro',
    blurb: 'Adivinhe pros, preencha a grade, ache as conexões e descubra o time pela comp. Tudo da cena real.',
    icon: 'search',
    status: 'live',
    tags: ['Pro Clássico', 'Grade 3x3', 'Conexões', 'Comp Misteriosa'],
    screen: ValdleCena,
  },
  {
    id: 'valdle-classico',
    title: 'Valdle — Jogo clássico',
    blurb: 'Só o Valorant em si: agentes, habilidades, mapas, callouts e armas.',
    icon: 'target',
    status: 'live',
    tags: ['Agente', 'Habilidade', 'Mapa', 'Callout', 'Arma'],
    screen: ValdleClassico,
  },
  {
    id: 'ace',
    title: 'Acerte o ace',
    blurb: 'Assista a um ace famoso e descubra de quem é.',
    icon: 'kill',
    status: 'live',
    tags: ['Vídeo do ace', '5 tentativas', 'Diário', 'Modo livre'],
    screen: Ace,
  },
];
