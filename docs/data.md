# Dados do jogo (snapshot do valorant-api.com)

Snapshot local e reproduzível dos dados reais do Valorant usados pelo modo Diário (Valdle) e pelo resto do jogo.

## O que tem

Arquivos gerados em `src/data/game/` (não editar à mão):

- `agents.json`: agentes jogáveis, ordenados pelo nome em inglês. Para cada um: `uuid`, `name` (inglês), `displayName` (pt-BR), `role` (`duelist` | `initiator` | `controller` | `sentinel`), `roleDisplayName` (pt-BR), `description` (bio curta em pt-BR), `displayIcon` (URL) e `abilities` na ordem C, Q, E, X e passiva (se houver), cada uma com `slot`, `name` (inglês), `displayName` (pt-BR) e `displayIcon` (URL; algumas passivas não têm ícone).
- `maps.json`: só os mapas competitivos padrão (com bombsites, transformação de minimapa e callouts), ordenados pelo nome em inglês. Ficam de fora The Range, Treinamento Básico, Contenda (Gauntlet), os mapas de Duelo (Skirmish) e os de Mata-mata (District, Kasbah, Drift, Glitch, Piazza). Cada mapa traz `uuid`, `name` (inglês, igual ao `MapName` do motor, ex.: `Ascent`), `displayName` (pt-BR), `coordinates`, `displayIcon` (minimapa), `splash`, os quatro campos `xMultiplier`/`yMultiplier`/`xScalarToAdd`/`yScalarToAdd` e `callouts` (`regionName` e `superRegionName` em pt-BR, `regionNameEn` e `superRegionNameEn` em inglês, `location` {x, y} em unidades do mundo).

`src/data/game/index.ts` exporta `AGENTS`, `MAPS`, os tipos `GameAgent`, `GameMap` e `Callout`, e os helpers `agentByName`, `mapByName` e `calloutToMinimap(map, callout)`. Este último converte a posição do callout em coordenadas normalizadas [0..1] sobre a imagem do minimapa. Os eixos são trocados, segundo a convenção da API: o x da imagem usa o y do mundo, e vice-versa. O teste `game.test.ts` confere se todos os callouts caem dentro do minimapa.

## Como regenerar

```bash
npm run data:game
```

O script (`scripts/fetch-game-data.mjs`, Node 22, sem dependências) faz quatro requisições em sequência (agentes e mapas, em pt-BR e en-US), corta os campos que não usamos, ordena tudo de forma determinística e grava JSON formatado. Rodar duas vezes seguidas sem mudança na API gera arquivos idênticos, então o diff no git mostra só o que mudou de verdade no jogo (agente novo, mapa novo, callout renomeado). Atrás de um proxy HTTP, rode com `NODE_USE_ENV_PROXY=1`.

Depois de regenerar, rode `npx vitest run src/data/game` para validar o snapshot.

## Fonte e licença

- Fonte: [valorant-api.com](https://valorant-api.com), uma API **comunitária e não oficial**, gratuita e sem chave. Não é afiliada à Riot Games.
- Os nomes, textos e imagens são da Riot Games. Usamos esse material sob a política de conteúdo de fãs da Riot ("Legal Jibber Jabber"), em um projeto gratuito e com aviso de não afiliação.
- As imagens de habilidades e os minimapas **não são copiadas** para o repositório: guardamos só as URLs servidas por `media.valorant-api.com`. Os ícones de agentes e as imagens de mapa que o jogo mostra ficam locais (seção "Mídia" abaixo); a URL do valorant-api.com continua no JSON como reserva.

# Stats de eventos do VCT (VLR.gg)

Snapshot dos eventos do VCT já encerrados, tirado do [VLR.gg](https://www.vlr.gg): os **internacionais** (Masters, LOCK//IN e Champions, de 2021 em diante) e as **ligas regionais** da era das franquias (Americas, EMEA, Pacific e China: a liga única de 2023 e, de 2024 em diante, Kickoff, Stage 1 e Stage 2). É a base real dos cards ("jogador @ time, evento") e substitui aos poucos o `src/data/sample.ts` fictício.

## O que tem

Arquivos gerados em `src/data/real/vlr/` (não editar à mão):

- `events.json`: índice (id do VLR, nome, nome curto, tier `masters` | `champions` | `regional`, `region` e `stage` (só nas ligas), ano, datas, local, nº de times e jogadores, mapas, caminho do arquivo).
- `events/<slug>.json` (ex.: `champions-2022.json`, `americas-kickoff-2024.json`, `pacific-league-2023.json`), um por evento:
  - meta: `id`, `name`, `shortName`, `year`, `tier`, `region` (`americas` | `emea` | `pacific` | `china`, `null` nos internacionais), `stage` (`league` | `kickoff` | `stage1` | `stage2`, `null` nos internacionais), `startDate`/`endDate`, `location`, `prize` e um bloco `source` (URLs usadas e `fetchedAt`, só a data).
  - `players`: uma linha por jogador, da página de stats do evento (todos os mapas e fases, `min_rounds=0`): id e handle do VLR, `teamId`/`teamTag`, país (código da bandeira), agentes como aparecem (`{agent, pct}`, nomes iguais aos de `src/data/game/agents.json`), `maps`, `rounds`, `rating`, `acs`, `kd`, `kast`, `adr`, `kpr`, `apr`, `fkfd`, `fkPct`/`fdPct` (% dos rounds com first kill/death, como o VLR mostra), `hsPct`, `clutchPct`, `clutches` ("2/18") + `clutchesWon`/`clutchesPlayed`, `kmax`, `k`, `d`, `a`, `fk`, `fd`. Números crus, sem nenhum valor de jogo derivado.
  - `teams`: todos os times, com `countryName` (país como o VLR mostra na classificação; "Europe" para times multinacionais da Europa), colocação final (quando a página mostra) e jogadores em ordem de rounds; os 5 com mais rounds têm `main: true`, os demais são reservas. Time que aparece na classificação mas não jogou (ex.: desistência) fica com `played: false`.
  - Colocação: a aba padrão do evento no VLR (a fase final) classifica o evento inteiro; uma fase anterior (grupos, play-in, temporada regular) classifica só ela mesma, então dela entram apenas os times que ela eliminou, isto é, faixas que começam abaixo de tudo que já foi colocado ("7th–9th" depois de um playoff "1st…4th"; nunca o "2nd" de um play-in). Quem o VLR não classifica assim fica sem colocação (`null`), nunca com chute.
  - Elenco sem jogadores na página da fase (acontece nas ligas da China em 2024): o time é resolvido pelo placar de uma série dele (a aba "All" da página da partida lista os ids dos jogadores de cada lado), uma página a mais por time.
  - `mapPool`: mapas jogados no evento e quantas vezes (página de agentes do evento).
  - `matches`: algumas séries (da final para trás, até cobrir o pool, no máximo 12) com placar, mapas, quem escolheu cada mapa e o veto cru (`vetoRaw`, e `veto` só separado por `;`).
- `slim.json`: o que o jogo empacota. É exatamente o subconjunto que `src/data/real/cards.ts` lê (`VlrEventData`): meta, pool de mapas, times (com `countryName`, colocação e a lista `{ playerId, main }`), só os titulares (`main`) com os stats que viram atributos, e as séries reduzidas a times, mapas (com quem escolheu) e veto. Gerado por `slimEvent()` (`scripts/vlr/parse.mjs`) a partir dos arquivos completos a cada rodada; o teste confere que é idêntico a `slimEvent()` de cada arquivo. Os arquivos completos continuam sendo a fonte da verdade (e são o que os testes de verificação leem); `index.ts` e `regions.ts` importam só o `slim.json`, para o bundle não crescer com reservas, URLs e colunas que o jogo não usa.
- Showmatches (times de streamers/all-star) ficam de fora: as abas "Showmatch" são ignoradas e as stats usam o filtro `exclude` do próprio VLR quando a fase aparece nelas.
- Limite conhecido: o VLR mostra só os 3 agentes mais jogados de cada jogador e um "+N"; guardamos os 3 e `agentsHidden: N`, sem adivinhar os outros. O pool completo vem dos placares por mapa (seção "Agentes por mapa" abaixo).

### Ligas regionais

- Descoberta: a mesma listagem `/events/?tier=60` ("VCT") do VLR. Entra o que tem título "Champions Tour AAAA: <Região> League" (2023) ou "Champions Tour AAAA: <Região> Kickoff | Stage 1 | Stage 2" (2024) / "VCT AAAA: <Região> …" (2025+). Ficam de fora qualificatórias (LCQ, "Champions China Qualifier"), Challengers, Ascension e a China Evolution Series (segunda divisão chinesa). Em 2023 não existia liga da China (EDG, BLG e FPX foram aos internacionais por qualificatória), então 2023 tem só Americas, EMEA e Pacific.
- Nome curto `"<Região> <Fase> <ano>"` (ex.: "Americas Kickoff 2024", "Pacific League 2023") e slug `<região>-<fase>-<ano>` (`emea-stage-1-2025`).
- Mesma forma dos internacionais: stats de todos os jogadores, 5 titulares por time, pool de mapas e algumas séries com veto (da final para trás até cobrir o pool).
- Tamanhos (2026-10-19): 57 arquivos completos somam 4,4 MB (18 internacionais 1,5 MB + 39 regionais 2,9 MB); `slim.json` tem 3,2 MB formatado, 1,5 MB compacto, e o bundle do jogo foi de 1,54 MB para 2,42 MB (405 KB gzip). As etapas de 2026 Stage 2 têm 16 times (14 na China): abriram com um play-in de times de Challengers; os eliminados nele ficam sem colocação.
- Correção que veio com a regra de colocação: no Masters Tokyo 2023 a tabela da fase de grupos do VLR é por fase, então T1, FUT, ASE e NAVI (9º–12º de fato) ficavam com "5th–6th"/"7th–8th" e seus técnicos com tática 1; agora ficam sem colocação (tática 0). Nenhum outro card internacional mudou.
- Eventos coletados (id do VLR): 2023 — Americas 1189, EMEA 1190, Pacific 1191. 2024 — Kickoff: Americas 1923, Pacific 1924, EMEA 1925, China 1926; Stage 1: EMEA 1998, Pacific 2002, Americas 2004, China 2006; Stage 2: EMEA 2094, Americas 2095, China 2096, Pacific 2005. 2025 — Kickoff: Americas 2274, China 2275, EMEA 2276, Pacific 2277; Stage 1: Americas 2347, China 2359, Pacific 2379, EMEA 2380; Stage 2: EMEA 2498, China 2499, Pacific 2500, Americas 2501. 2026 — Kickoff: Americas 2682, Pacific 2683, EMEA 2684, China 2685; Stage 1: Pacific 2775, Americas 2860, EMEA 2863, China 2864; Stage 2: Pacific 2776, EMEA 2976, Americas 2977, China 2978.

### Agentes por mapa (`agent-stats.json`)

O VLR só mostra os 3 agentes mais jogados de cada jogador por evento. Para o pool de agentes real de cada card (`Card.agentPool`) e para o "flex nato" (`Card.flexRoles`), lemos o placar **de cada mapa** das páginas de partida (`/{id}/{slug}`, aba padrão), onde aparece o agente que cada jogador usou naquele mapa e os números do mapa.

- `vlr/agent-stats.json` (gerado por `scripts/vlr/agents.mjs`, não editar à mão): `players` → id do jogador no VLR → ano (do evento) → agente → `{maps, rounds, rating, acs, k, d}`. `rating` (Rating 2.0) e `acs` são médias ponderadas pelos rounds do mapa (soma dos dois placares), só sobre os mapas que têm o número; `k` e `d` são somas. Sem o número no VLR → `null`. Agentes em ordem de mapas (desc.), ids e anos em ordem crescente; uma linha por jogador, para o diff ficar legível.
- Só os titulares (`main`) de algum evento do `slim.json` entram; reservas e times de fora não.
- Linha sem exatamente um ícone de agente não conta (não adivinhamos o agente). O VLR não publica Rating nos mapas da liga da China de 2024 até o início de 2025 nem no Masters Shanghai 2024: nesses mapas `rating` fica `null` (ACS, K e D existem).
- Fonte: as séries concluídas (sem showmatch) das listas de partidas dos eventos de `events.json`. Parser puro `parseMatchMapStats` e agregação `aggregateAgentStats` em `parse.mjs`, testados com `scripts/vlr/__fixtures__/match-maps-130685.html` (trecho do placar do Ascent da final do Champions 2022).
- Cobertura (2026-10-20): 1.159 das 1.968 séries concluídas dos 57 eventos (todas as dos 18 internacionais; nas etapas regionais, pelo menos 1–2 séries por time e mais nos playoffs), 3.016 mapas, 30.158 linhas jogador-mapa (8 sem agente único), 637 jogadores, 6.122 células jogador-ano-agente. O arquivo tem 454 KB (82 KB gzip). Destas séries, 600 foram baixadas para isto em 2026-10-20 (601 pedidos, cerca de 25 min: 259 dos internacionais de 2021–2024 e 341 regionais); as outras 559 já estavam no cache.
- Pesquisa por trás (docs/pesquisa-variancia.md §9.1): o desempenho jogador × agente medido é quase todo ruído de amostra. Por isso os números por agente aparecem com o tamanho da amostra (`maps`) e o motor só os usa encolhidos pela amostra e limitados (`src/engine/agents.ts`).

## Como regenerar

```bash
npm run data:vlr                     # tudo (usa o cache quando existe)
npm run data:vlr -- --tier regional  # só as ligas regionais (ou: international, all)
npm run data:vlr -- --event 1015     # só um evento (id do VLR)
npm run data:vlr -- --offline        # reconstrói o JSON só a partir do cache, sem rede
npm run data:vlr -- --refresh        # baixa de novo páginas já em cache
npm run data:vlr-agents              # agent-stats.json só a partir do cache (sem rede)
npm run data:vlr-agents -- --plan    # mostra o que --fetch baixaria (sem rede) e gera o JSON
npm run data:vlr-agents -- --fetch   # baixa páginas de partida que faltam (máx. 600 por rodada, --max-new N) e gera o JSON
```

Ordem do `--fetch` de `data:vlr-agents`: primeiro todas as séries dos internacionais que faltam no cache; depois, nas etapas regionais, séries escolhidas para que todo time da etapa tenha pelo menos 1, depois 2, depois 3 séries no cache (cada nível em todas as etapas antes do seguinte, para o teto se espalhar por igual). Usa o mesmo cliente educado (`fetch.mjs`).

O script (`scripts/vlr/`, Node 22, única dependência `cheerio`) tem três partes: `fetch.mjs` (HTTP, cache e limites), `parse.mjs` (parsers puros) e `run.mjs` (descoberta dos eventos em `/events/?tier=60` e montagem do JSON). Toda página baixada fica em `.cache/vlr/<caminho>.html` (fora do git). Uma rodada nova só busca o que falta, e `--offline` gera arquivos idênticos byte a byte. Para um evento novo, basta rodar de novo depois que ele terminar: a listagem fica em cache, então use `--refresh` para enxergar eventos novos (isso baixa tudo de novo e demora). As 39 etapas regionais custaram cerca de 530 requisições (uns 25 min) na primeira vez; com o cache, a rodada completa dos 57 eventos leva menos de 2 min e `--offline` gera os mesmos bytes.

Validação: `npx vitest run src/data/real/vlr` testa os parsers com trechos de HTML salvos em `scripts/vlr/__fixtures__/` e confere o snapshot (≥ 8 times por evento e a liga inteira nas etapas regionais — 10 times em 2023, 11–12 depois —, 5 titulares por time, números em faixas plausíveis, agentes e mapas conhecidos, uma etapa por região/fase/ano).

## Regras de educação com o site

- Requisições em sequência, com no mínimo 2,5 s entre elas; User-Agent `RoadToChampions/0.1 (fan project; github.com/guilhermefreitasdev/road-to-champions)`; `Accept-Encoding: gzip`.
- 429/5xx: até 3 novas tentativas com espera exponencial; 5 falhas seguidas abortam a rodada.
- O `robots.txt` é lido no início de cada rodada e caminhos proibidos (`/search/auto`, `/rr/`) são recusados.
- Nada é baixado duas vezes sem `--refresh`. Uma rodada completa sem cache fez cerca de 170 requisições (uns 7 minutos).

## Fonte e crédito

- Fonte: [VLR.gg](https://www.vlr.gg). Não existe API oficial; usamos só o que está visível nas páginas públicas e mostramos os dados **com atribuição ao VLR.gg**.
- Nunca completamos lacunas com chute: campo ausente na página vira `null`.
- Os nomes de times mostrados são os atuais no VLR (ex.: "KIWOOM DRX" no Champions 2022); a tag (`teamTag`) é a da tabela de stats do evento.

# Elencos, técnicos e IGLs (Liquipedia)

O VLR não diz quem é o IGL nem, de forma confiável, quem era o técnico em cada evento. Isso vem da [Liquipedia](https://liquipedia.net/valorant/), só pela API MediaWiki e dentro dos [termos de uso da API](https://liquipedia.net/api-terms-of-use).

## O que tem

`src/data/real/liquipedia/events.json` (gerado, não editar à mão). Para cada evento internacional concluído (Masters, LOCK//IN e Champions de 2021 a 2026, mesmos `id` dos arquivos do VLR, ex.: `champions-2022`):

- `liquipedia`: título da página, `revid` (revisão usada), URL, formato da página (`TeamCard` ou `TeamParticipants`) e de onde veio o elenco (`wikitext` ou `expandtemplates`); `vlrEventId` quando a página traz; datas; `withdrawn` (times que desistiram antes do evento e ficaram de fora).
- `teams[]`: `name` (como aparece na página do evento), `liquipediaPage` e `vlrTeamId` (do infobox do time, quando existe), `players[]` com `liquipediaId` (título canônico da página do jogador), `handle` (como aparece no evento), `flag` (ISO 3166-1 alfa-2, igual a `Card.country`), `isSub`, `dnp` (reserva que não jogou) e `vlrPlayerId` (do infobox do jogador); `coach` `{ name, liquipediaId }` ou `null` (o head coach; se ninguém estiver marcado assim, o primeiro "coach"); `staff[]` com todos os membros da comissão e a função; `igl` (handle) ou `null`; `iglSource`; `iglCandidates` quando é ambíguo.
- `sources[]`: todas as páginas lidas (evento, jogadores, técnicos, times) com `revid`, para a atribuição exigida pela licença.

### Como o IGL é decidido (nunca chutamos)

A Liquipedia marca o IGL como "Captain" no elenco. Em ordem de confiança:

1. `event-captain`: um único jogador marcado como Captain na própria página do evento (só existe nas páginas novas, 2026).
2. `squad-captain`: um único titular marcado como Captain no elenco do time na Liquipedia na data do evento (vem do banco de elencos/transferências, pedido via importação; é escasso nos eventos antigos).
3. `infobox-unique`: um único titular com a função `igl` no infobox do jogador. **É a função de carreira, não por evento**: um jogador que virou IGL depois pode aparecer como IGL num evento antigo. Use como dica, não como verdade.
4. `infobox-ambiguous` / `event-ambiguous`: dois ou mais candidatos → `igl: null`, com `iglCandidates`. `conflict`: o Captain do elenco (2) é um jogador e o único IGL de infobox (3) é outro → `igl: null`, os dois em `iglCandidates` (Captain nem sempre é quem faz as calls; ex.: EDward Gaming 2022–2024).
5. `none`: sem informação → `igl: null`.

Correções manuais, quando vierem, devem ficar num arquivo separado (não no JSON gerado).

## Como regenerar

```bash
NODE_USE_ENV_PROXY=1 node scripts/liquipedia/run.mjs              # baixa o que não está em cache
node scripts/liquipedia/run.mjs --offline                         # só cache, sem rede
node scripts/liquipedia/run.mjs --event champions-2022,masters-tokyo-2023   # só esses eventos
node scripts/liquipedia/run.mjs --refresh                         # baixa de novo tudo que usa
```

Arquivos: `scripts/liquipedia/api.mjs` (cliente com limite de taxa e cache), `parse.mjs` (parsers puros de wikitext, testados em `src/data/real/liquipedia/parse.test.ts` com fixtures em `scripts/liquipedia/__fixtures__/`) e `run.mjs`. O teste `events.test.ts` valida o JSON gerado (≥ 8 times por evento, técnico na maioria dos times, nenhum time com dois IGLs).

## Regras da API que seguimos

- Só `api.php` (API MediaWiki). Nunca baixamos páginas HTML renderizadas e nunca usamos `action=parse`.
- Wikitext via `action=query&prop=revisions&rvprop=content&rvslots=main`, com até 50 títulos por requisição (`titles=A|B|C`) e redirecionamentos resolvidos.
- No máximo 1 requisição a cada 2 s (usamos 2,1 s, com a marca de tempo gravada em disco para valer entre execuções). Em 429/5xx, espera (`Retry-After` ou 60 s, 120 s…) e tenta de novo.
- `action=expandtemplates` (roda os módulos Lua da Liquipedia, custo parecido com `parse`) é tratado como `parse`: no mínimo 30 s entre chamadas; usamos 65 s porque o servidor respondeu 429 com 30 s. Serve para dois casos: elencos com `import=true` (os jogadores não estão no wikitext, vêm do banco da Liquipedia) e as marcas de Captain do elenco na data do evento. É uma chamada de cada tipo por evento, no máximo.
- User-Agent `RoadToChampions/0.1 (fan project; github.com/guilhermefreitasdev/road-to-champions)`, `Accept-Encoding: gzip` e conexão reaproveitada (o `fetch` do Node mantém keep-alive).
- Cache de toda resposta em `.cache/liquipedia/` (fora do git). Um título em cache nunca é pedido de novo, a não ser com `--refresh`. Uma execução do zero faz cerca de 35 requisições e leva uns 20 min, quase tudo pela espera entre chamadas de `expandtemplates`. Com o cache, leva menos de 1 s.

## Licença e crédito

O conteúdo da Liquipedia é [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Por isso:

- O JSON guarda o título e a revisão de cada página usada (`sources`), e `source.credit` traz o texto de crédito.
- O jogo vai mostrar, na tela "Sobre/Créditos" e no rodapé das telas que usam elencos, técnicos ou IGLs: "Elencos, técnicos e IGLs: Liquipedia (liquipedia.net/valorant), CC-BY-SA 3.0", com link para a Liquipedia e para a licença. Os dados derivados (o `events.json`) seguem sob a mesma licença CC-BY-SA 3.0.
- Logos de times e fotos de jogadores vêm da Liquipedia pela API (seção "Mídia" abaixo), com a página de cada arquivo guardada para crédito e retirada a pedido.

# Cards do jogo (VLR + Liquipedia → cards)

`src/data/real/cards.ts` transforma os dois snapshots acima nos elencos que o jogo usa, exportados por `src/data/real/index.ts`: `REAL_ROSTERS` (internacionais, tier `international`), `REGIONAL_ROSTERS` (etapas das ligas regionais, tier `regional`), `ALL_ROSTERS` (os dois juntos), `REGIONAL_EVENTS` (as etapas, com região, fase, datas e pool), `teamRegion`, `realLineup` e `REAL_MAP_POOL`. É código puro e determinístico, rodado no carregamento da página; não há JSON de cards gerado. As fórmulas (função pelos agentes, percentis no ano, encolhimento por amostra, OVR, liderança, coach, conforto de mapa e pool do veto) estão em `docs/design.md`, seção "Cards reais".

- Casamento VLR ↔ Liquipedia: um time da Liquipedia é o do VLR quando tem pelo menos 3 dos 5 titulares em comum (pelo `vlrPlayerId` do perfil ou pelo handle normalizado, ex.: "FNS" na Liquipedia é o "FiNESSE" do VLR pelo id 817). Os 250 elencos internacionais casam.
- Cobertura (internacionais): IGL conhecido em 187 de 250 elencos, técnico em 249.
- Todo elenco dos dois pools carrega `region` (seção "Regiões" abaixo) e `tier`.
- Cobertura (ligas): 464 elencos (2.320 cards) em 39 etapas; IGL conhecido em 176 (pela regra do mesmo ano, abaixo); nenhum técnico. OVR mín./p10/mediana/p90/máx. 63/68/76/84/90 (internacionais: 68/72/79/87/94).
- Testes: `cards.test.ts` (fórmulas com dados sintéticos), `real.test.ts` (os pools reais: 5 cards por elenco, ids únicos entre os dois pools, stats copiados sem alteração, faixa de OVR, funções, IGL e coach batendo com a Liquipedia; ≥ 8 elencos por etapa regional) e `regions.test.ts`. `REAL_REPORT=1 npx vitest run src/data/real/real --silent=false` imprime a distribuição de OVR e os melhores cards com os stats de origem (dos dois pools); o mesmo com `src/data/real/regions` imprime os elencos por região e ano.
- O jogo mostra os créditos no rodapé: VLR.gg e Liquipedia (CC-BY-SA 3.0), com links.
- **Pool de agentes (`agentPool`)** e **flex nato (`flexRoles`)**, de `vlr/agent-stats.json` (seção "Agentes por mapa"), em `cards.ts` (`agentWindow`, `agentPoolFor`, `flexRolesFor`):
  - Janela: o **ano do card** quando o jogador tem pelo menos 8 mapas nele (`AGENT_YEAR_MIN_MAPS`); senão, a carreira até aquele ano (todos os anos ≤ o do card). Nunca um ano posterior. Dentro do ano entram também os mapas de eventos do mesmo ano posteriores ao do card (o dado é por ano).
  - `agentPool`: os agentes da janela por mapas (desc.), no máximo 6 (`AGENT_POOL_SIZE`), cada um com `maps`, `rating` (0,01), `acs` (inteiro) e `kd` (K/D, 0,01) ou `null` quando o VLR não tem; depois, se faltar algum, os agentes do próprio evento (`card.agents`, o top 3 do VLR) com os números da janela ou `maps: 0` e `null`. Card sem nenhum mapa nos dados fica só com o top 3 do evento, `maps: 0` e stats `null`. Nada é inventado.
  - `flexRoles`: participação de cada função nos mapas da janela (função do agente em `src/data/game`). Funções com ≥ 25% (`FLEX_ROLE_SHARE`) contam como jogadas de verdade; com duas ou mais, `flexRoles = [função do card, ...as outras por participação]` (flex nato); senão `[função do card]`. Janela com menos de 8 mapas → `[função do card]`. A função do card (`role`) não muda com isso.
  - Cobertura e contagem (2026-10-20): todo card tem `agentPool` (média de 4,6 agentes nos internacionais, 5,0 nas ligas); só 1 dos 3.570 cards não tem nenhum mapa nos dados (fica com o top 3 do evento). Janela no ano do card em 91–92% dos cards, na carreira no resto. Flex nato: 398 de 1.250 cards internacionais (32%) e 770 de 2.320 de liga (33%); o par mais comum é controlador + sentinela (jogadores de Viper que também jogam Killjoy/Cypher), seguido de controlador + iniciador. Exemplos (função: participação nos mapas da janela): erde (LOUD, Champions 2026) controlador 59% / sentinela 41% de 39 mapas; Demon1 (EG, Champions 2023) duelista 65% / controlador 25% de 52; ShahZaM (Sentinels, Masters Reykjavík 2021) iniciador 67% / duelista 33% de 30; Chronicle (FNATIC, Masters Tokyo 2023) iniciador 57% / controlador 34% de 47; Less (LOUD, Champions 2022) sentinela 62% / controlador 38% de 34.
  - `agents.test.ts` testa as regras com dados sintéticos, valida o `agent-stats.json` (agentes conhecidos, faixas plausíveis, ordem) e confere todo card (pool com ≥ 1 agente, incluindo os do evento; `flexRoles[0] === role`; proporção de flex numa faixa plausível). `AGENTS_REPORT=1 npx vitest run src/data/real/agents --silent=false` imprime a cobertura, a contagem de flex e exemplos.

## Elencos das ligas regionais (`REGIONAL_ROSTERS`)

Mesmo construtor, mesmas fórmulas, com estas diferenças (todas em `cards.ts`):

- **Ranking separado.** Os percentis (de cada stat e do desempenho para o OVR) são tirados dentro do ano **e do grupo** (internacional ou regional): um titular de liga é comparado só com os titulares de liga daquele ano, e o pool internacional mantém exatamente os números que tinha antes das ligas entrarem (o teste `real.test.ts` garante que nada muda; os ids de time também não mudam quando um time só de liga tem o mesmo slug de um internacional — `regions.ts`, `teamIdResolver`). Motivo: um mesmo jogador tem uma linha na liga e outra no Masters do mesmo ano; misturar as duas num ranking só mudaria o pool original e faria o nível das ligas depender de quantos times fortes foram aos internacionais.
- **Bônus.** Tier −2 (`REGIONAL_TIER_BONUS`; Champions +2, Masters 0) e colocação na etapa: campeão +2, vice +1 (no internacional é +3/+2/+1 até o 4º). Resultado: a mediana de OVR das ligas fica uns 2 pontos abaixo da dos internacionais e o teto um pouco abaixo (veja o relatório).
- **Função.** O desempate pela carreira usa só eventos internacionais para as linhas internacionais (para não mover cards existentes) e todos os eventos para as linhas de liga.
- **IGL.** A Liquipedia não entra nas ligas (nenhuma página a mais é lida). O IGL de um elenco de liga vem só de um fato já nos dados: o mesmo time (id do VLR) teve, num evento internacional **do mesmo ano**, um IGL conhecido pela Liquipedia, e ele é um dos 5 titulares da etapa → `isIGL` com `iglSource: 'same-year-international'` e decisão 80 (a mesma do IGL de infobox). Dois nomes diferentes no ano → desconhecido. Sem isso, `iglKnown: false` (decisão neutra no motor). Limite conhecido: uma troca de IGL no meio do ano não é detectada.
- **Técnico.** Nenhum (`coach` ausente): o VLR não diz quem era, e não lemos a Liquipedia para as ligas.
- **Pool do veto** (`REAL_MAP_POOL`) continua sendo o do internacional mais recente com 7 mapas; o pool de cada etapa fica em `REGIONAL_EVENTS[].maps` e em `REAL_POOL.eventMapPools`.

## Regiões (`src/data/real/regions.ts`)

`teamRegion(teamId, eventId | ano)` dá a região (`americas` | `emea` | `pacific` | `china`) de um time do pool num evento ou num ano, só a partir dos dados versionados, nesta ordem:

1. Etapa de liga regional: a região da própria etapa (do título na listagem do VLR).
2. Era das franquias (2023+): a liga em que o time (id do VLR) jogou naquele ano. Times chineses nos internacionais de 2023 (antes da liga da China) caem na regra 3 e viram `china`.
3. Senão (2021–22, ou time sem liga nos dados): o país que o VLR mostra na classificação do evento (`countryName`), mapeado para a sub-região de onde o time se classificou: NA/BR/LATAM → `americas`; EU/CIS/TR → `emea`; KR/JP/SEA/OCE/Sul da Ásia → `pacific`; CN → `china` (tabela `COUNTRY_REGION`; "Europe" é como o VLR mostra times europeus multinacionais).
4. `REGION_OVERRIDES` (vazio hoje): só para time sem país no VLR, com a fonte em comentário.

`regions.test.ts` garante que todo elenco de `ALL_ROSTERS` tem região, que `teamRegion` concorda com `RosterEntry.region` e que todo país presente nos dados está na tabela.

# Mídia (logos, fotos, mapas e agentes)

Por decisão do dono do projeto (19/10/2026), o jogo mostra logos de times e fotos de jogadores: da época do evento quando a fonte tem, senão os atuais; sempre com crédito e com retirada imediata se o titular pedir. Tudo é baixado em tempo de build de dados e commitado em `public/media/` como WebP, para aparecer sempre, inclusive em previews cuja CSP bloqueia imagens externas.

## O que tem

- `public/media/maps/<mapa>.webp` (640×360, 13 mapas), `public/media/agents/<agente>.webp` (64×64, 29 agentes), `public/media/teams/<time>[-<evento>].webp` (até 96 px, `fit: inside`) e `public/media/players/<vlrPlayerId>[@<evento>].webp` (128×128, corte "attention").
- `src/data/game/media.json`: `maps[nome]` → `{ image, source, sourceUrl, file, credit }` e `agents[nome]` → `{ icon, … }`. Os JSONs de agentes e mapas continuam com `displayIcon`/`splash` remotos como reserva.
- `src/data/real/media.json`: `teams[chave]` → `{ logo, eraSpecific, … }`, onde a chave é `${teamId}-${eventId}` (logo da época) ou só `${teamId}` (logo atual); `players[chave]` → `{ photo, eraSpecific, liquipediaId, … }`, chave `${vlrPlayerId}@${eventId}` (foto tirada no evento) ou só `${vlrPlayerId}` (foto atual do infobox). Cada entrada guarda `sourceUrl` (página do arquivo na Liquipedia) e `credit`.
- `src/data/media.ts`: `mapMedia`, `agentMedia`, `teamMedia(teamId, eventId)` (tenta a época, depois a atual), `playerMedia(playerId, eventId)` e `mediaUrl` (prefixa o `BASE_URL` do Vite). Os componentes `TeamLogo`, `PlayerPhoto`, `AgentIcon` e `MapSplash` sempre desenham o fallback (iniciais, bandeira, placeholder colorido) por baixo da imagem.
- `src/data/currentMapPool.ts`: `CURRENT_MAP_POOL` (7 mapas) e `CURRENT_MAP_POOL_SOURCE` (página, `revid` e data da revisão), da lista "Current Competitive Map Pool" de `Portal:Maps` na Liquipedia.

## De onde vem cada imagem

- **Mapas**: `|image=` do `{{Infobox map}}` da página do mapa (ex.: `Ascent Map.png`, 1024×512, arte da Riot).
- **Agentes**: ícone atual de `Module:CharacterIcon/Data` (ex.: `Jett VALORANT Icon.png`, 128×128).
- **Logos da época**: os ícones de time que a Liquipedia renderiza na página do evento (os *team templates* resolvem pela data do evento: `Fnatic 2020 allmode.png` no Champions 2022, `Furia eSports.png` em 2021). Vêm das mesmas expansões (`expandtemplates`) que o coletor de elencos já guarda em cache, então custam zero requisições novas; um evento novo custa uma chamada. Com variantes claro/escuro, usamos a escura (a interface é escura).
- **Logos atuais** (fallback): `|imagedark=`/`|image=` do `{{Infobox team}}`.
- **Fotos no evento**: um arquivo da página do jogador cujo nome cita o evento (`Alfajer at VCT 2023 LOCKIN São Paulo.jpg`); ano no nome tem que bater com o do evento. **Fotos atuais** (fallback): `|image=` do `{{Infobox player}}`.
- O VLR não é usado como fonte de imagem (o `owcdn.net` não é alcançável do ambiente de build); o crédito no rodapé cita VLR.gg porque nomes e ids de times/jogadores vêm de lá.

Tudo passa só pela API MediaWiki (`prop=imageinfo` com `iiurlwidth` para thumbnails, 50 títulos por requisição) e pelos arquivos servidos em `liquipedia.net`, com o mesmo cliente de `scripts/liquipedia/api.mjs` (1 requisição a cada 2 s, compartilhada entre processos; `.cache/liquipedia/imageinfo/` e `.cache/liquipedia/files/`). As imagens de mapas e agentes são da Riot Games (política de conteúdo de fãs); logos e fotos são dos seus titulares, hospedadas na Liquipedia (CC-BY-SA 3.0 para o conteúdo da wiki). `npx vitest run src/data/media` confere que todo arquivo citado existe, é pequeno (< 120 KB) e tem página de origem, e que o total fica abaixo de 8 MB.

## Como regenerar

```bash
npm run data:media                              # tudo (usa o cache; só baixa o que falta)
npm run data:media -- --only=maps,agents,pool    # só mapas, agentes e o pool atual
npm run data:media -- --only=teams               # só logos
npm run data:media -- --only=players             # só fotos (a parte mais longa: ~600 arquivos, uns 20 min)
npm run data:media -- --offline                  # só o cache, sem rede
npm run data:media -- --refresh                  # baixa de novo
```

Depende de `sharp` (devDependency) para redimensionar e converter. Rodar de novo sem mudanças na wiki gera arquivos idênticos. Para remover uma imagem a pedido do titular: apague o arquivo e a entrada no JSON (o fallback de iniciais assume), e anote o pedido para a próxima regeneração.
