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
- `src/game/`: cola do jogo, pura e testada. `run.ts` = RunState JSON de uma run (draft → coach → Champions, veto do usuário, partidas da IA, composição do campo) + seletores, sobre o pool real; `explain.ts` = rótulos pt-BR e explicação da força; `balance.test.ts` mede o balanceamento.
- `src/data/`: dados.
  - `real/`: snapshots do VLR (`vlr/`) e da Liquipedia (`liquipedia/`); `cards.ts` = construtor puro e testado dos cards reais (fórmulas em `docs/design.md`, "Cards reais"); `index.ts` = `REAL_ROSTERS`, `realLineup`, `REAL_MAP_POOL`, o pool que o jogo usa.
  - `game/`: snapshot do valorant-api.com (agentes com função, mapas, callouts).
  - `sample.ts` e `mapPools.ts`: FICTÍCIOS, só para testes unitários do motor.
- `src/ui/`: React. `App.tsx` = máquina de telas; `screens/` (Início, Draft, Coach, Seu time, Torneio, Veto, Série, Fim); `components/`; `storage.ts` salva a run em localStorage (`rtc:run:v2`; saves `v1` do pool fictício são descartados).
- `docs/`: design e decisões.

## Regras
- O motor nunca usa `Math.random`: toda aleatoriedade vem do `Rng` com seed, para que Daily, Ultimate e as partidas sejam reproduzíveis.
- O motor não importa nada de `src/ui`.
- Nunca inventar estatísticas para jogadores reais. Dados reais vêm só do pipeline (VLR + Liquipedia + valorant-api.com), com crédito ao VLR.gg e à Liquipedia (CC-BY-SA) no rodapé. Todo número de um card sai de `src/data/real/cards.ts` por fórmula documentada; stat ausente vira percentil neutro e aparece como "—", nunca chute.
- Mudou o formato da run ou o pool de forma que saves antigos não fazem sentido: suba `RUN_VERSION` (`run.ts`) e a chave em `storage.ts`.
- Texto da interface e dos docs em português (pt-BR); identificadores e comentários de código em inglês.
- Projeto de fã: gratuito, seguindo a política "Legal Jibber Jabber" da Riot e com aviso de não afiliação. Logos de times e fotos de jogadores são usados por decisão do dono do projeto (19/10/2026): da época do evento quando a fonte tiver, senão os atuais; sempre com crédito da fonte e retirada imediata se o titular pedir.
