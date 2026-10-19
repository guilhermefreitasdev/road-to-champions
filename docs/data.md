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
