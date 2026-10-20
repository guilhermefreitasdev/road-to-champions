# Acerte o ace: dados e regras

Modo "Acerte o ace" (ideia em `docs/ideias-futuras.md`): **vídeo primeiro**. O jogador dá play num ace real de um pro,
dentro da nossa página (YouTube embutido só depois do clique), e tenta adivinhar **de quem é**. Este documento cobre a
base de dados (como os aces são escolhidos e conferidos), as regras do jogo, o uso do YouTube e a política de remoção.
A interface (`src/ui/screens/ace/`, regras de tela e de embed em "Outros modos" no `docs/design.md`) usa só a API de
`src/game/aces/`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `scripts/aces/curated.json` | Lista curada, editada à mão: a partida no VLR, o mapa e o jogador de cada ace, o vídeo do YouTube (link, título, como foi conferido), como o vídeo foi ligado a esse 5K, a descrição em pt-BR e fontes extras. |
| `scripts/aces/build.mjs` | Gera `src/data/real/aces.json`: confere cada entrada curada contra as páginas do VLR (cache em `.cache/vlr`) e preenche os fatos (round, vítimas, agente, clutch, lado, placar). |
| `scripts/aces/parse.mjs` | Parsers puros da aba Performance (5Ks com round e vítimas, clutches vencidos) e da faixa de rounds da visão geral. |
| `scripts/aces/check-videos.mjs` | Confere todos os vídeos no oEmbed do YouTube (título, canal, se aceita ser embutido) e grava o resultado na lista curada. |
| `src/data/real/aces.json` | Gerado (não editar à mão). Um registro por ace curado. |
| `src/data/real/aces.ts` | Carrega o JSON e resolve os times para os ids do pool (`ACES`). |
| `src/game/aces/` | Lógica pura do modo (puzzle, palpites, comparação, dicas, pontos, Diário, modo livre, revelação, save, compartilhar). Testes em `aces.test.ts`. |

## Como gerar

```bash
NODE_USE_ENV_PROXY=1 node scripts/aces/build.mjs            # = npm run data:aces; só do cache (sem rede), lê só as partidas curadas
NODE_USE_ENV_PROXY=1 node scripts/aces/build.mjs --plan     # mostra o que --fetch baixaria
NODE_USE_ENV_PROXY=1 node scripts/aces/build.mjs --fetch    # baixa as páginas que faltam e gera
NODE_USE_ENV_PROXY=1 node scripts/aces/build.mjs --list     # lista todos os 5Ks internacionais em .cache/aces/vlr-5ks.tsv
NODE_USE_ENV_PROXY=1 node scripts/aces/check-videos.mjs --write   # = npm run data:aces-check; oEmbed do YouTube (máquina com acesso ao YouTube)
```

O `--fetch` usa o cliente educado de `scripts/vlr/fetch.mjs`: uma requisição por vez, no mínimo 2,5 s entre elas,
User-Agent do projeto, `robots.txt` relido a cada execução e cache em `.cache/vlr` (página em cache nunca é baixada de
novo). Ele baixa a visão geral e a aba Performance (`/{id}/{slug}/?game=all&tab=performance`) de todas as séries
concluídas dos eventos internacionais do snapshot (Masters, LOCK//IN, Champions de 2021 a 2026: 475 séries; a primeira
carga baixou 316 abas Performance, o resto já estava em cache) e as das partidas curadas fora deles (ligas regionais).
Teto padrão de 400 páginas novas por execução.

O VLR registra 208 5Ks nesses eventos. O Masters Shanghai 2024 não tem a aba Performance preenchida no VLR, então
nenhum ace dele pode entrar.

## Curadoria

1. **Candidatos**: aces famosos e reconhecíveis de eventos internacionais (Masters, LOCK//IN, Champions) de 2021 a
   2026 e grandes momentos regionais, buscados na web (clipes, compilações, reações, listas de "melhores aces"). A
   lista de todos os 5Ks do VLR (`--list`) mostra a partida, o mapa e o round de cada um.
2. **Ligar o vídeo ao 5K**: o título ou a descrição do vídeo precisa citar o pro e o adversário (ou o evento), e o VLR
   precisa ter **exatamente um** 5K que bata com isso. Quando o título traz mais detalhe ("first round", "pistol",
   "1v4", "3rd ace", "on Icebox"), ele tem de bater com o VLR (round 1/13, clutch 1v4 da aba Performance, ordem dos
   aces na série, mapa). Se houver dois 5Ks possíveis e nada que os separe, a entrada fica de fora.
3. **Mistura**: épocas, regiões e funções variadas; o mesmo pro pode aparecer mais de uma vez, mas o Diário nunca põe
   o mesmo pro em dois dias seguidos.
4. **Títulos neutros primeiro**: o player do YouTube pode mostrar o título ao passar o mouse ou pausar, e muitos
   títulos dizem o nome do pro. A base marca isso em `youtube.titleRevealsPlayer` (o handle ou um apelido aparece no
   título, sem diferenciar maiúsculas, acentos e 0/1/3/4/5 no lugar de letras; nomes de 4+ letras contam mesmo dentro
   de uma palavra, de propósito: um falso alarme só rebaixa o vídeo) e o Diário prefere os neutros ("Quickest Ace this
   Major?"), sem descartar os outros.
5. **Descrição**: frases em pt-BR só com fatos conferidos no VLR (quem, de que time, contra quem, agente, round, mapa,
   lado, placar antes do round, fase e evento, clutch, se fechou o mapa) e, quando citado, o que o título do vídeo diz
   (arma, apelido do lance). Nada que nenhuma fonte diga.

## Verificação

Cada registro diz em `verified` como cada campo foi conferido:

| Campo | Valor | Como |
| --- | --- | --- |
| `fiveK`, `round`, `victims` | `vlr-performance` | A célula 5K da aba Performance do VLR, naquele mapa, lista o round e as cinco vítimas. Entrada curada sem esse 5K no VLR é erro do build e nunca vai para o JSON. |
| `agent`, `clutch` | `vlr-performance` | Ícone do agente na linha do jogador naquele mapa; clutch (1v1 a 1v5) vencido no mesmo round, das células de clutch. |
| `map`, `teams`, `event` | `vlr-overview` | Cabeçalho e placar do mapa na visão geral da partida. |
| `side`, `scoreBefore` | `vlr-rounds` | Faixa de rounds do mapa: lado do vencedor de cada round (ataque/defesa) e placar depois de cada um. Só aparecem quando a faixa é consistente. |
| `video` | `youtube-oembed` ou `web-search` | `youtube-oembed`: título e canal vieram do oEmbed do YouTube. `web-search`: o link e o título exato vieram de um resultado de busca restrito ao youtube.com (a consulta fica em `curated.json`, campo `query`); o canal fica vazio. |
| `videoMatch` | texto | Como o vídeo foi ligado a este 5K (regra 2 da curadoria). |
| `embeddable` | `youtube-oembed` | Só existe depois do `check-videos.mjs`: oEmbed responde 200 para vídeo que aceita ser embutido e 401/403 quando o dono desligou (ou o vídeo é privado). Sem checagem, `embeddable` fica `null`. |
| `start`, `end` | URL | Segundos de início e fim do ace no vídeo, só quando uma fonte citada os dá (capítulos da descrição, por exemplo). Sem fonte, `null`: o player começa do início (a maioria é clipe de um lance só). |
| `weapon` | URL | Só quando uma fonte citada diz a arma (hoje, títulos de vídeo). |

Nunca se chuta link, round, agente, arma ou minuto. O que não foi conferido fica `null`.

### Estado atual (2026-10-20)

- 41 aces, todos com vídeo, todos de pros do pool, de 16 eventos internacionais de 2021 a 2026 (22 de Masters/LOCK//IN, 19 de Champions; 31 pros diferentes).
- Os 41 vídeos foram ligados por `web-search`: neste ambiente o YouTube (inclusive o oEmbed) não estava acessível.
  Falta rodar `check-videos.mjs --write` numa máquina com acesso, para trazer o canal, confirmar o título e marcar
  `embeddable`; depois, `build.mjs` de novo. Vídeo que o oEmbed recusar sai do jogo sozinho (`embeddable: false`).
- Nenhum tem `start`/`end` (nenhuma fonte dava o minuto).

## Regras do jogo (src/game/aces)

- **Antes do palpite, nada revela o pro.** O puzzle (`AcePuzzle`) é só um id neutro (partida, mapa, round) e o
  `embed` (id do vídeo, `start`, `end`); o Diário traz também a data e o número. Título, canal, descrição, link
  original, fatos e fontes saem só de `revealAce` / `reveal`, que devolve `null` enquanto a rodada está aberta.
- **Player**: a interface mostra um marcador próprio e neutro ("Assistir ao ace", sem a miniatura do YouTube, que pode
  mostrar rosto ou nome) e só no clique carrega o iframe de `embedSrc(...)`:
  `https://www.youtube-nocookie.com/embed/<id>?start=S&end=E&rel=0&playsinline=1&autoplay=1`. Nada toca antes do
  clique. O player do YouTube não é coberto nem mascarado (as políticas da API do YouTube não permitem), por isso ele
  pode mostrar o título: a interface avisa ("vale a honestidade") e o Diário prefere títulos neutros.
- **Palpites**: até 5. O palpite vem do autocomplete do pool (id do jogador) ou digitado (handle ou apelido, sem
  diferenciar maiúsculas e acentos).
- **Comparação de um palpite errado**: o pro chutado contra a resposta em fatos que o vídeo não mostra: país, região,
  função principal, ano de estreia nos dados (antes/depois) e se ele jogava no time do ace naquele evento. Mapa,
  agente e round estão no vídeo, então nunca são pistas.
- **Dicas**: depois de 2 erros, o evento e a fase ("Champions 2022 · Playoffs · Grande final"); depois de 4, o time
  do pro.
- **Pontos**: 5, 4, 3, 2 ou 1 conforme a tentativa que acertou; 0 se errar as 5 ou desistir.
- **Revelação** (`reveal`): o ace inteiro (pro, times, evento, mapa, round, agente, placar, vítimas, clutch), a
  descrição, o vídeo original com título e canal como crédito e link para o YouTube, o link da partida no VLR e as
  fontes.
- **Diário**: um ace por dia do calendário de São Paulo, igual para todos, numerado como o Diário
  (`src/game/daily/calendar.ts`, #1 em 2026-10-01). Entram só aces jogáveis (vídeo conferido, não recusado para
  embutir, pro do pool). Com pelo menos 14 vídeos de título neutro, o Diário usa só eles; com menos, usa todos, os
  neutros primeiro em cada ciclo e, dentro de cada grupo, os com `embeddable: true` primeiro. Cada ciclo é uma ordem
  com seed (`aces:cycle:N`): nenhum ace se repete antes de todos terem saído, e nunca o mesmo pro em dois dias
  seguidos. Acrescentar entradas muda a ordem (inclusive do arquivo); o progresso salvo guarda o `aceId` e
  `progressFor` recomeça o dia se o ace mudou.
- **Modo livre**: sorteio com seed entre os aces jogáveis, com filtros (ano, nível do evento, só títulos neutros) e
  evitando os últimos 30 vistos.
- **Compartilhar** (sem emoji, sem spoiler):
  `Road to Champions · Acerte o ace #12 · 4/5 pts` e `acertei na 2ª tentativa · erro, acerto`.
- **Save** (`AcesSave`, versão 1, na chave `rtc:aces:v1` da interface, `src/ui/acesStorage.ts`, junto com os aces que o player recusou neste navegador): progresso por dia do Diário,
  totais do modo livre, os ids recentes e a rodada livre em andamento. `parseAcesSave` descarta o que estiver
  malformado; outra versão começa vazia. Estatísticas: jogados, acertos, média, sequência de dias acertados no próprio
  dia (zera quando o dia de hoje é perdido), melhor sequência e distribuição por tentativa.

## Como acrescentar um ace

1. Ache a partida no VLR e confira na aba Performance do mapa que o pro tem um 5K (o número da coluna 5K abre o round
   e as vítimas). `build.mjs --list` já lista todos os 5Ks dos eventos internacionais.
2. Ache um vídeo do YouTube que mostre esse ace. Prefira clipes de um lance só, títulos que não digam o nome do pro e
   vídeos que aceitem ser embutidos. Confira título, canal e embed no oEmbed:
   `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` (401 = não pode embutir).
3. Acrescente a entrada em `scripts/aces/curated.json`:

```json
{
  "key": "apelido-curto-unico",
  "match": "https://www.vlr.gg/<id>/<slug>",
  "map": "Fracture",
  "handle": "crashies",
  "round": 11,
  "agent": "KAY/O",
  "aliases": [],
  "youtube": {
    "url": "https://www.youtube.com/watch?v=<11 caracteres>",
    "title": "título exato",
    "channel": "canal (ou null)",
    "channelUrl": null,
    "embeddable": true,
    "start": null,
    "startSource": null,
    "end": null,
    "endSource": null,
    "check": "youtube-oembed",
    "checkedAt": "AAAA-MM-DD",
    "query": "busca usada, quando check = web-search"
  },
  "videoMatch": "como o vídeo foi ligado a este 5K",
  "description": "Frases factuais em pt-BR.",
  "sources": []
}
```

   `round` e `agent` são conferidos contra o VLR (e `round` escolhe entre dois 5Ks do mesmo pro no mesmo mapa).
   `weapon` (`{ "name", "source" }`) só com fonte. `start`/`end` só com `startSource`/`endSource`.
4. Rode `node scripts/aces/build.mjs --fetch` e `npm test`. O build falha se o VLR não tiver exatamente um 5K que bata.

## YouTube, créditos e fontes

- **YouTube**: o vídeo é embutido só depois do clique do jogador, pelo domínio `youtube-nocookie.com`, sem autoplay
  antes disso, sem miniatura carregada antes do clique, sem cobrir o player e sem baixar, copiar ou reenviar nada. Na
  revelação aparecem o título, o canal (crédito) e o link para o vídeo original no YouTube. Os direitos dos vídeos são
  dos canais e da Riot Games. Vídeo que não aceita ser embutido (oEmbed 401/403) não entra no jogo.
- **VLR.gg** (vlr.gg): partidas, aba Performance e faixa de rounds. Sem API oficial; dados exibidos com atribuição,
  como o resto do projeto (`docs/data.md`).
- **Liquipedia** (liquipedia.net, CC-BY-SA 3.0): só fonte de consulta na curadoria quando citada em `sources`; nenhum
  texto é copiado.
- Projeto de fã, gratuito, sem afiliação com a Riot Games ("Legal Jibber Jabber").

## Remoção

Qualquer titular (canal do vídeo, jogador, organização ou a Riot) pode pedir a retirada de uma entrada: ela sai de
`scripts/aces/curated.json` e do JSON gerado no mesmo dia, sem discussão. Um vídeo removido, privado ou que deixou de
aceitar ser embutido (`check-videos.mjs` acusa) também sai. Saves antigos não quebram: o progresso guarda o id do ace
(`aceId`) e `progressFor` recomeça o dia se o ace mudou.
