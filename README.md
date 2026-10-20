# Road to Champions

Simulador de Valorant no navegador: monte um dream team com jogadores históricos do VCT, faça o veto de mapas
e tente vencer o Champions. Projeto de fã, gratuito, em português.

## Status

Jogável de ponta a ponta, no celular e no computador, e instalável como app (PWA, funciona offline depois da
primeira visita).

- **Cards reais**: 3.570 cards (jogador + evento, ex.: "aspas @ LOUD, Champions 2022") de 57 eventos do VCT: os
  18 internacionais (Masters, LOCK//IN e Champions, 2021–2026) e 39 etapas das ligas regionais (Americas, EMEA,
  Pacific e China, 2023–2026). Todo número sai de uma fórmula documentada sobre os stats do VLR.gg e os elencos,
  técnicos e IGLs da Liquipedia; stat ausente aparece como "—", nunca chute.
- **Modos**
  - *Draft clássico*: roleta de time + evento, 1 jogador por giro, 3 rerolls; depois o técnico e o Champions de
    16 times (grupos GSL + playoffs em dupla eliminação, final MD5).
  - *Ultimate Draft*: 5 opções fixas por pick, sem reroll.
  - *Complete Trials*: escolha o servidor e o campo (Atual ou Prime), drafte só com times da região e dispute a
    liga regional, o Masters e o Champions, com **mercado de transferências** entre as etapas.
- **Dificuldade**: Fácil, Normal, Difícil e Lendário (rerolls, elites no campo, bônus da IA, veto e scouting).
- **Partidas**: veto de mapas contra a IA, simulação round a round (forma do dia, agentes por mapa, economia,
  clutch, aura) e **reprodução ao vivo** da série, com placar, MVP e rating de cada jogador.
- **Estatísticas** do seu time e de todos os jogadores do torneio (comparação lado a lado), **Ranking** dos
  maiores OVRs de todos os tempos e de cada ano, e **Histórico** das runs terminadas.
- Resultado para compartilhar sem spoiler (texto puro, sem emoji), pronto para WhatsApp e X.

## Rodando

Requer Node 22 ou mais novo.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve o dist/ (com o service worker)
```

O build de produção carrega rápido no celular: a primeira tela (início) vem num pacote pequeno e aparece antes
de os cards carregarem; o jogo, os dados e cada tela vêm em pacotes separados. O deploy previsto é estático (na
Vercel, configurado em `vercel.json`).

## Dados

Os dados ficam versionados no repositório; os comandos abaixo só são necessários para atualizá-los (atrás de um
proxy, eles já usam `NODE_USE_ENV_PROXY=1`). Detalhes de cada fonte em [docs/data.md](docs/data.md).

| Comando | O que faz |
|---|---|
| `npm run data:vlr` | Stats dos eventos do VLR.gg (internacionais e ligas regionais) → `src/data/real/vlr/` |
| `npm run data:vlr-agents` | Agentes por mapa de cada jogador, dos placares do VLR.gg → `agent-stats.json` |
| `npm run data:liquipedia` | Elencos, técnicos e IGLs da Liquipedia → `src/data/real/liquipedia/` |
| `npm run data:media` | Logos, fotos de jogadores, mapas e agentes → `public/media/` |
| `npm run data:game` | Agentes, habilidades, mapas e callouts do valorant-api.com → `src/data/game/` |
| `npm run icons` | Ícones do app (PWA) a partir do emblema → `public/icons/` |

## Documentação

- [Design do jogo](docs/design.md)
- [Dados: fontes, coleta e cards](docs/data.md)
- [Ideias futuras (em espera)](docs/ideias-futuras.md)

## Créditos

- Stats por evento: [VLR.gg](https://www.vlr.gg).
- Elencos, técnicos, IGLs, logos e fotos: [Liquipedia](https://liquipedia.net/valorant/), sob
  [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Retiramos qualquer imagem a pedido do titular.
- Agentes, mapas e callouts: [valorant-api.com](https://valorant-api.com) (API comunitária, não oficial); nomes e
  imagens do jogo são da Riot Games.
- Fonte Barlow Condensed (Google Fonts, SIL Open Font License).

---

Road to Champions é um projeto de fã, não oficial, e não é endossado pela Riot Games. Não reflete as opiniões de
ninguém oficialmente envolvido na produção ou gestão de propriedades da Riot Games. Riot Games e todas as
propriedades associadas são marcas registradas da Riot Games, Inc.
