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
- As imagens (ícones de agentes e habilidades, minimapas, splashes) **não são copiadas** para o repositório: guardamos só as URLs servidas por `media.valorant-api.com`.

# Stats de eventos internacionais (VLR.gg)

Snapshot dos eventos internacionais do VCT já encerrados (Masters, LOCK//IN e Champions, de 2021 em diante), tirado do [VLR.gg](https://www.vlr.gg). É a base real dos cards ("jogador @ time, evento") e substitui aos poucos o `src/data/sample.ts` fictício.

## O que tem

Arquivos gerados em `src/data/real/vlr/` (não editar à mão):

- `events.json`: índice (id do VLR, nome, nome curto, tier `masters` | `champions`, ano, datas, local, nº de times e jogadores, mapas, caminho do arquivo).
- `events/<slug>.json` (ex.: `champions-2022.json`), um por evento:
  - meta: `id`, `name`, `shortName`, `year`, `tier`, `startDate`/`endDate`, `location`, `prize` e um bloco `source` (URLs usadas e `fetchedAt`, só a data).
  - `players`: uma linha por jogador, da página de stats do evento (todos os mapas e fases, `min_rounds=0`): id e handle do VLR, `teamId`/`teamTag`, país (código da bandeira), agentes como aparecem (`{agent, pct}`, nomes iguais aos de `src/data/game/agents.json`), `maps`, `rounds`, `rating`, `acs`, `kd`, `kast`, `adr`, `kpr`, `apr`, `fkfd`, `fkPct`/`fdPct` (% dos rounds com first kill/death, como o VLR mostra), `hsPct`, `clutchPct`, `clutches` ("2/18") + `clutchesWon`/`clutchesPlayed`, `kmax`, `k`, `d`, `a`, `fk`, `fd`. Números crus, sem nenhum valor de jogo derivado.
  - `teams`: todos os times, com colocação final (quando a página mostra) e jogadores em ordem de rounds; os 5 com mais rounds têm `main: true`, os demais são reservas. Time que aparece na classificação mas não jogou (ex.: desistência) fica com `played: false`.
  - `mapPool`: mapas jogados no evento e quantas vezes (página de agentes do evento).
  - `matches`: algumas séries (da final para trás, até cobrir o pool, no máximo 12) com placar, mapas, quem escolheu cada mapa e o veto cru (`vetoRaw`, e `veto` só separado por `;`).
- Showmatches (times de streamers/all-star) ficam de fora: as abas "Showmatch" são ignoradas e as stats usam o filtro `exclude` do próprio VLR quando a fase aparece nelas.
- Limite conhecido: o VLR mostra só os 3 agentes mais jogados de cada jogador e um "+N"; guardamos os 3 e `agentsHidden: N`, sem adivinhar os outros.

## Como regenerar

```bash
npm run data:vlr                     # tudo (usa o cache quando existe)
npm run data:vlr -- --event 1015     # só um evento (id do VLR)
npm run data:vlr -- --offline        # reconstrói o JSON só a partir do cache, sem rede
npm run data:vlr -- --refresh        # baixa de novo páginas já em cache
```

O script (`scripts/vlr/`, Node 22, única dependência `cheerio`) tem três partes: `fetch.mjs` (HTTP, cache e limites), `parse.mjs` (parsers puros) e `run.mjs` (descoberta dos eventos em `/events/?tier=60` e montagem do JSON). Toda página baixada fica em `.cache/vlr/<caminho>.html` (fora do git). Uma rodada nova só busca o que falta, e `--offline` gera arquivos idênticos byte a byte. Para um evento novo, basta rodar de novo depois que ele terminar: a listagem fica em cache, então use `--refresh` para enxergar eventos novos (isso baixa tudo de novo e demora).

Validação: `npx vitest run src/data/real/vlr` testa os parsers com trechos de HTML salvos em `scripts/vlr/__fixtures__/` e confere o snapshot (≥ 8 times por evento, 5 titulares por time, números em faixas plausíveis, agentes e mapas conhecidos).

## Regras de educação com o site

- Requisições em sequência, com no mínimo 2,5 s entre elas; User-Agent `RoadToChampions/0.1 (fan project; github.com/guilhermefreitasdev/road-to-champions)`; `Accept-Encoding: gzip`.
- 429/5xx: até 3 novas tentativas com espera exponencial; 5 falhas seguidas abortam a rodada.
- O `robots.txt` é lido no início de cada rodada e caminhos proibidos (`/search/auto`, `/rr/`) são recusados.
- Nada é baixado duas vezes sem `--refresh`. Uma rodada completa sem cache fez cerca de 170 requisições (uns 7 minutos).

## Fonte e crédito

- Fonte: [VLR.gg](https://www.vlr.gg). Não existe API oficial; usamos só o que está visível nas páginas públicas e mostramos os dados **com atribuição ao VLR.gg**.
- Nunca completamos lacunas com chute: campo ausente na página vira `null`.
- Os nomes de times mostrados são os atuais no VLR (ex.: "KIWOOM DRX" no Champions 2022); a tag (`teamTag`) é a da tabela de stats do evento.
