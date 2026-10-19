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

`src/data/real/cards.ts` transforma os dois snapshots acima nos elencos que o jogo usa (`REAL_ROSTERS`, exportado por `src/data/real/index.ts` junto com `realLineup` e `REAL_MAP_POOL`). É código puro e determinístico, rodado no carregamento da página; não há JSON de cards gerado. As fórmulas (função pelos agentes, percentis no ano, encolhimento por amostra, OVR, liderança, coach, conforto de mapa e pool do veto) estão em `docs/design.md`, seção "Cards reais".

- Casamento VLR ↔ Liquipedia: um time da Liquipedia é o do VLR quando tem pelo menos 3 dos 5 titulares em comum (pelo `vlrPlayerId` do perfil ou pelo handle normalizado, ex.: "FNS" na Liquipedia é o "FiNESSE" do VLR pelo id 817). Os 250 elencos casam.
- Cobertura: IGL conhecido em 187 de 250 elencos, técnico em 249.
- Testes: `cards.test.ts` (fórmulas com dados sintéticos) e `real.test.ts` (o pool real: 5 cards por elenco, ids únicos, stats copiados sem alteração, faixa de OVR, funções, IGL e coach batendo com a Liquipedia). `REAL_REPORT=1 npx vitest run src/data/real/real --silent=false` imprime a distribuição de OVR e os melhores cards com os stats de origem.
- O jogo mostra os créditos no rodapé: VLR.gg e Liquipedia (CC-BY-SA 3.0), com links.

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
