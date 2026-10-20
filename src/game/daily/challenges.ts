/** The Daily's four challenges (no data dependency: the home page reads them before the pool loads). */
export type ChallengeId = 'linhas' | 'pro' | 'impostor' | 'placar';
export const CHALLENGES: readonly ChallengeId[] = ['linhas', 'pro', 'impostor', 'placar'];

export const CHALLENGE_LABELS: Record<ChallengeId, string> = {
  linhas: 'Linhas Históricas',
  pro: 'Quem é o Pro',
  impostor: 'O Impostor',
  placar: 'Placar Clássico',
};
