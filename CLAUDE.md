# Road to Champions

Simulador/manager de Valorant no navegador, inspirado no Road to Major (CS) e no 7a0.
O jogador monta um dream team com cards de jogadores históricos (card = jogador + evento,
ex.: "aspas @ LOUD, Champions 2022") e disputa um Champions simulado.

Modo secundário "Complete Trials" (região → liga regional → Masters → Champions, campo Atual/Prime): seção "Modo Complete Trials" em `docs/design.md`.

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
  - `team.ts`: força do time v2 = base (OVR × encaixe) + composição + cinco dimensões explicáveis (Mecânica, Utilidade, Tomada de decisão com IGL e coach, Comunicação, Clutch); "sem IGL" = decisão ×0,75 com teto 55
  - `match.ts`: simulação de mapa round a round (13 rounds, troca no 12, OT vence por 2) e placar; economia pós-pistol (R2 87% / R3 38%), termos de decisão e clutch por contexto; Modelo v3: forma por jogador por mapa (seed por partida+mapa+card), cadeia de multikill e trade, rating estimado, MVP, aura em decisivo/OT, encaixe de meta
  - `form.ts`: constantes e helpers do Modelo v3 (forma do dia, fase do torneio, aura, prodígio, encaixe de meta); `form.test.ts` = calibração contra as metas de `docs/pesquisa-variancia.md`
  - `tournament.ts`: Champions de 16 (grupos GSL + playoffs); `league.ts`: liga regional de 12 (2 grupos de 6, turno único, playoffs de 6); `bracket.ts`: chave de dupla eliminação de 8 avulsa (Masters) sobre o esqueleto do `tournament.ts`
- `src/game/`: cola do jogo, pura e testada. `run.ts` = RunState JSON de uma run (draft → coach → Champions, veto do usuário, partidas da IA, composição do campo) + seletores, sobre o pool real; `season.ts` = SeasonState JSON do modo Complete Trials (região → draft → liga → Masters → Champions, campo Atual/Prime via `fieldRosterFor`) com os mesmos seletores de `run.ts`; `explain.ts` = rótulos pt-BR e explicação da força; `balance.test.ts` mede o balanceamento (`season.test.ts` com `TRIALS_REPORT=1` mede o do Complete Trials).
- `src/data/`: dados.
  - `real/`: snapshots do VLR (`vlr/`) e da Liquipedia (`liquipedia/`); `cards.ts` = construtor puro e testado dos cards reais (fórmulas em `docs/design.md`, "Cards reais"; aura/durão/prodígio só de fatos); `meta.ts` = meta de agentes por mapa e ano (tabela da pesquisa); `index.ts` = `REAL_ROSTERS`, `realLineup`, `REAL_MAP_POOL`, `REAL_META`, o pool que o jogo usa.
  - `game/`: snapshot do valorant-api.com (agentes com função, mapas, callouts).
  - `sample.ts` e `mapPools.ts`: FICTÍCIOS, só para testes unitários do motor.
- `src/ui/`: React. `App.tsx` = máquina de telas dos dois modos; `screens/` (Início, Região, Draft, Coach, Seu time, Torneio/Hub, Hub da temporada, Veto, Série, Fim, Fim da temporada; Draft, Coach, Seu time, Veto e Série recebem props genéricas e servem aos dois modos); `components/` (chaves `Bracket`/`LeagueBracket`/`GroupStage` sobre `BracketCanvas`, tabelas, `TrialsPath`, `SharePanel`); `storage.ts` salva a run (`rtc:run:v5`) e a temporada (`rtc:season:v2`) em localStorage, em slots separados; saves antigos são descartados.
- `docs/`: design e decisões.

## Regras
- O motor nunca usa `Math.random`: toda aleatoriedade vem do `Rng` com seed, para que Daily, Ultimate e as partidas sejam reproduzíveis.
- O motor não importa nada de `src/ui`.
- Nunca inventar estatísticas para jogadores reais. Dados reais vêm só do pipeline (VLR + Liquipedia + valorant-api.com), com crédito ao VLR.gg e à Liquipedia (CC-BY-SA) no rodapé. Todo número de um card sai de `src/data/real/cards.ts` por fórmula documentada; stat ausente vira percentil neutro e aparece como "—", nunca chute.
- Mudou o formato da run ou o pool de forma que saves antigos não fazem sentido: suba `RUN_VERSION` (`run.ts`) e a chave em `storage.ts`; o mesmo para `SEASON_VERSION` (`season.ts`) e `rtc:season:vN`.
- CSS: um bloco por tela em `src/ui/styles.css`; o modo Complete Trials fica na seção `/* --- Complete Trials --- */` e os selos de forma, MVP e aura em `/* --- Form & aura --- */`.
- Texto da interface e dos docs em português (pt-BR); identificadores e comentários de código em inglês.
- Projeto de fã: gratuito, seguindo a política "Legal Jibber Jabber" da Riot e com aviso de não afiliação. Logos de times e fotos de jogadores são usados por decisão do dono do projeto (19/10/2026): da época do evento quando a fonte tiver, senão os atuais; sempre com crédito da fonte e retirada imediata se o titular pedir.
