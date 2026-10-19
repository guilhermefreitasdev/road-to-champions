# Road to Champions

Simulador/manager de Valorant no navegador, inspirado no Road to Major (CS) e no 7a0.
O jogador monta um dream team com cards de jogadores históricos (card = jogador + evento,
ex.: "aspas @ LOUD, Champions 2022") e disputa um Champions simulado.

Design completo: `docs/design.md`. Ideias guardadas, que ainda NÃO devem ser implementadas: `docs/ideias-futuras.md`
(dados em tempo real). O modo Diário/Valdle está aprovado no design, mas ainda não foi iniciado.

## Comandos
- `npm run dev`: servidor de desenvolvimento
- `npm test`: testes (Vitest)
- `npm run build`: typecheck + build de produção
- `npm run typecheck`

## Estrutura
- `src/engine/`: motor de simulação em TypeScript puro (sem React/DOM), sempre testado.
  - `rng.ts`: RNG com seed (mulberry32) + `hashSeed`
  - `team.ts`: força do time (encaixe de função, composição, IGL, química)
  - `match.ts`: simulação de mapa round a round (13 rounds, troca no 12, OT vence por 2) e placar
- `src/data/`: dados. `sample.ts` é FICTÍCIO e só serve enquanto o pipeline real não existe.
- `src/ui/`: React.
- `docs/`: design e decisões.

## Regras
- O motor nunca usa `Math.random`: toda aleatoriedade vem do `Rng` com seed, para que Daily, Ultimate e as partidas sejam reproduzíveis.
- O motor não importa nada de `src/ui`.
- Nunca inventar estatísticas para jogadores reais. Dados reais vêm só do pipeline (VLR + Liquipedia + valorant-api.com), com crédito à Liquipedia (CC-BY-SA).
- Texto da interface e dos docs em português (pt-BR); identificadores e comentários de código em inglês.
- Projeto de fã: gratuito, seguindo a política "Legal Jibber Jabber" da Riot e com aviso de não afiliação. Sem fotos de jogadores e sem logos de times.
