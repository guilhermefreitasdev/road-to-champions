# Pesquisa: táticas, IGL e parâmetros para o motor (Modelo v2)

Pesquisa feita em 2026-10-19 a partir do pedido: "a função de IGL não está bem separada; deveria ficar explícito que,
sem IGL, o time perde tomada de decisão. Pesquise bastante sobre táticas para melhorar os cálculos e separar as coisas."

Este documento **não muda código**. Ele junta (1) o que se sabe sobre o papel do IGL e sobre táticas, (2) números de
round que servem de parâmetro, a maioria **medida por nós** em páginas públicas do VLR.gg, e (3) uma proposta concreta
de "Modelo v2" para `src/engine/`.

## Sumário

1. Os números mais úteis vieram de dados próprios: 91 séries de eventos internacionais (2021–2026) no VLR, com 272 mapas e
   5.818 rounds com lado e forma de vitória, mais 262 mapas com economia por round, plants, defuses e clutches.
2. **Economia domina a correlação entre rounds.** O vencedor do pistol leva o round 2 em 87% das vezes, mas só 38% do round 3
   (round bônus). Hoje o motor dá ~55% no R2 (`ANTI_ECO_EDGE = 6` com escala 30), muito abaixo do real.
3. **Não existe "momentum" quando os dois times compram tudo.** Em full buy contra full buy, quem venceu o round anterior vence
   o próximo em 49,9% (n = 2.649). Os 57% brutos de "repetir o vencedor" vêm todos da economia.
4. **Estrutura do round:** há plant em 69% dos rounds. Depois do plant o ataque vence 71% (a defesa só ganha desarmando).
   Sem plant, a defesa leva quase tudo: o ataque só vence 2% dos rounds sem plantar.
5. **Vantagem numérica:** a primeira kill vale ~69–70% do round. Uma cadeia simples de duelos com peso pelo número de vivos
   (α = 0,5) reproduz ao mesmo tempo esse número (68%), o sucesso em clutch (13,8% no modelo, 14,2% no real) e a frequência de
   clutches (0,58 contra 0,55 por time e round). Dá para simular duelo → vantagem → round com dois parâmetros.
6. **O IGL some do scoreboard.** IGLs têm rating 0,05 menor que os companheiros (0,934 contra 0,985), ACS −17, KPR −10%,
   menos duelos de abertura (8,0% contra 10,3% dos rounds) e **mais assistências** (+21%). KAST e clutch são iguais. Como o OVR
   vem de stats, ele subestima o IGL, e é por isso que o valor do IGL precisa de uma dimensão própria ("Tomada de decisão").
7. **Controlador é obrigatório de fato:** 0 de 2.534 composições time×mapa em eventos internacionais jogou sem controlador.
   Jogar sem sentinela é comum (19%) e não perde nada (50,6% de vitórias). A penalidade de sentinela do motor (−2) não tem apoio
   nos dados.
8. Sobre "time sem IGL", a evidência é **qualitativa** (entrevistas, casos). Nenhuma fonte mede o efeito em % de vitória. A
   proposta abaixo põe o custo de "sem IGL" nos lugares onde o IGL atua (compras, pós-plant e retake, adaptação na série, OT)
   e calibra o tamanho pela dispersão real entre times nessas situações.

---

## 1. Fontes e método

**Dados próprios (alta confiança):**
- Páginas de partida do VLR já em cache do pipeline (`.cache/vlr/<id>/…`): 91 séries de playoffs, até 12 por evento, da final
  para trás, em 18 eventos internacionais (Masters, LOCK//IN e Champions de 2021 a 2026). Delas saem 272 mapas e 5.818 rounds
  com vencedor, lado (ataque/defesa) e forma da vitória (eliminação, explosão da spike, defuse, tempo).
- Abas `tab=economy` e `tab=performance` dessas mesmas 91 séries, baixadas uma vez para esta pesquisa (182 páginas, 3 s entre
  pedidos, mesmo User-Agent do pipeline, `robots.txt` respeitado). Delas saem 262 mapas e 5.495 rounds com valor de equipamento e
  classe de compra (pistol, eco < 10k, half 10–18k, full 18k+), além de plants, defuses, multikills e clutches por situação
  (1v1…1v5).
- O snapshot do projeto (`src/data/real/vlr/events/*.json` + `src/data/real/liquipedia/events.json`): 26.832 situações de
  clutch, 173 pares IGL-evento casados com stats, 2.534 composições time×mapa (páginas de agentes dos eventos, em cache).
- **Viés da amostra:** quase tudo é playoff de evento internacional (times de topo, partidas equilibradas). Para o jogo isso é
  bom, porque é exatamente o recorte que ele simula.

**Fontes externas:** só `vlr.gg` e `liquipedia.net` responderam direto neste ambiente; as demais foram lidas via resultados
de busca (resumos). Em cada item marcamos **[dado]** (número medido com amostra conhecida), **[estudo]** (trabalho acadêmico ou
análise com método) ou **[anedota]** (entrevista, opinião, caso isolado).

---

## 2. O que um IGL faz (e o que não faz)

### 2.1 Funções

| Função | O que é | Evidência |
|---|---|---|
| Plano pré-round | Escolhe default, execução, site, fake; distribui utilitários | Guias e glossários convergem [anedota]: [critfeed](https://critfeed.com/what-is-igl-in-valorant/), [guildorder](https://guildorder.com/games/valorant/guides/comms-and-callouts) |
| Mid-round | Filtra a informação e decide: rotacionar, segurar, fingir, flanquear ou comprometer | Mesmas fontes. Boaster (Fnatic) conta que trocou "set plays estruturados" por default + mid-round e que passou a defender de forma mais proativa: [Esports Insider, 2025](https://esportsinsider.com/2025/04/boaster-interview-on-fnatics-comeback-formula) [anedota] |
| Economia | Decide comprar, salvar ou forçar | [critfeed](https://critfeed.com/igl-meaning-in-valorant/) [anedota]. É a área onde o dado mostra mais impacto (seção 3.3) |
| Leitura e anti-strat | Ajusta contra o adversário durante a série | Boaster, depois de perder o mapa 1 para a PRX: ficou "sobrecarregado" e precisou de um "reset" para achar as calls; a Fnatic venceu por 2–1 ([Hotspawn, EWC](https://www.hotspawn.com/valorant/news/boaster-ewc-valorant-final-interview)) [anedota] |
| Posicionar os colegas | Pôr cada jogador onde ele rende | Boostio diz que copiou do Saadhak "como ele põe os jogadores em posição de render" ([ONE Esports](https://www.oneesports.gg/valorant/exclusive-eg-boostio-loud-saadhak/)) [anedota] |
| Sacrifício individual | Joga agentes de suporte e faz menos duelos de entrada | **[dado]**, seção 2.4 |

### 2.2 IGL × coach: quem decide o quê

- Pelas regras da VCT, o coach **só fala com os jogadores** durante seleção de mapa e agentes, timeouts, intervalo, antes da
  prorrogação e entre mapas ([regulamento VCT EMEA 2024](https://liquipedia.net/commons/images/4/40/VCT_2024_EMEA_Official_Competiton_Rulebook.pdf),
  [Challengers EMEA 2025](https://liquipedia.net/commons/images/f/f1/VCT_EMEA_Challengers_Tournament_Rules_Version_1_1.pdf)).
  Cada time tem **dois timeouts de 60 s por mapa** no tempo regulamentar, pedidos nos primeiros 20 s da fase de compra. [dado/regra]
- Consequência para o modelo: **o coach não substitui o mid-round.** Ele age na preparação (veto, anti-strat, plano de jogo), no
  intervalo e em até 2 pausas por mapa. Um coach forte compensa só em parte a falta de IGL.
- ShahZaM conta que a Sentinels jogou sem coach até 2021, e por isso o IGL acumulava a preparação; a chegada do coach tirou carga
  dele ([Sportskeeda](https://sportskeeda.com/valorant/news-it-s-hard-get-good-practice-make-productive-rawkus-helped-lot-that-sentinels-valorant-pro-shahzeb-shahzam-khan)). [anedota]
- **Efeito de timeout:**
  - No Valorant, só 34,4% dos timeouts do Masters Berlin 2021 viraram round ganho para quem pediu ([Upcomer](https://upcomer.com/answering-valorant-masters-3-berlin-questions-part-2)). [dado fraco, 1 evento]
  - No CS:GO, um timeout técnico (exógeno) aumenta em 14,8 pp a chance de o perdedor do round anterior vencer o seguinte
    (103 partidas; [Gómez Seeber, UdeSA](https://repositorio.udesa.edu.ar/items/4c7a1080-47ef-4178-90d3-ca44a8a0af9c)). [estudo]
  - Nos nossos dados, porém, não há embalo para "quebrar" em rounds com compra completa dos dois lados (seção 3.4). Por isso
    o efeito do timeout no modelo deve ser pequeno.

### 2.3 Chamada dividida e times "sem IGL"

- **Paper Rex:** d4v41 disse que "não existe um único IGL" no time: todos dão ideias, e o duelista chama o que quer fazer
  ([Sportskeeda](https://www.sportskeeda.com/valorant/news-i-want-lift-trophy-paper-rex-d4v41-lays-personal-goals-ahead-vct-masters-shanghai-exclusive)).
  No Masters Madrid 2024, Monyet contou que foi "difícil, com certeza" se adaptar a jogar sem IGL
  ([Sportskeeda](https://sportskeeda.com/valorant/news-it-s-hard-sure-paper-rex-s-monyet-playing-without-igl-vct-masters-madrid-exclusive)),
  e mesmo assim a PRX ficou em 3º. [anedota] Lição: um time sem IGL fixo pode ser forte, desde que tenha decisão distribuída
  (vários jogadores com experiência de call). Daí a proposta de usar o **melhor tomador de decisão** como piso quando não há IGL.
- **LOUD 2022:** Saadhak era o IGL. Fãs atribuem ao Sacy (e ao pANcada) o papel de segunda voz no mid-round
  ([fórum VLR](https://www.vlr.gg/post/1740896/why-did-sen-get-dephh)), e a imprensa diz que Sacy "ajudava Saadhak a guiar os
  mais novos". [anedota fraca]
- **EDward Gaming:** a Liquipedia marca como Captain um jogador diferente do IGL de infobox em 2022–2024, e o pipeline grava
  `conflict` (ver `docs/data.md`). É exemplo de que "capitão" ≠ "quem faz as calls".
- **Idioma:** times com duas línguas precisam traduzir calls, o que gera atraso e erro, sobretudo em 2v2 (Northeption, coreano e
  japonês: [ONE Esports](https://www.oneesports.gg/valorant/northeption-comms-two-languages/)) [anedota]. Estudos de gestão
  mostram que a barreira de idioma reduz a participação na comunicação e aumenta a carga cognitiva em equipes multilíngues
  ([2021](https://ideas.repec.org/a/eee/worbus/v56y2021i2s1090951620301127.html),
  [2016](https://ideas.repec.org/a/pal/jintbs/v47y2016i4p427-452.html)). [estudo, fora do esport]

### 2.4 O IGL nos números (dados próprios)

173 pares IGL-evento do snapshot (o IGL vem da Liquipedia, as stats do VLR; titulares com ≥ 50 rounds):

| Métrica (média) | IGL | Companheiros | Diferença |
|---|---|---|---|
| Rating VLR | 0,934 | 0,985 | −0,05 (IGL abaixo da média do time em 64% dos casos; o pior do time em 35%) |
| ACS | 182 | 199 | −17 |
| Kills por round | 0,625 | 0,695 | −10% |
| ADR | 119,5 | 129,9 | −8% |
| **Assistências por round** | **0,317** | **0,263** | **+21%** |
| % de rounds com first kill | 8,0% | 10,3% | −2,3 pp |
| % de rounds com first death | 9,5% | 10,3% | −0,8 pp |
| KAST | 70,2% | 70,2% | 0 |
| Clutch (% vencidos) | 14,5% (n = 4.293) | 14,1% (n = 16.144) | ≈ 0 |
| Função do agente principal | iniciador 39%, controlador 36%, sentinela 19%, duelista 5% | | |

Só os 78 casos de fonte mais confiável (Captain no evento ou no elenco) dão a mesma direção, com diferença menor (rating −0,025).
No CS, a HLTV mediu um déficit de rating ~0,07 para IGLs riflers, com mais flashes por round
([HLTV](https://www.hltv.org/news/38747/why-more-and-more-igls-are-taking-up-the-supportive-rotator-role)). [estudo]
Uma análise de fã com z-score na VCT 2024 chega a conclusão parecida ([Medium](https://medium.com/@_SushantJha/the-igl-debacle-f599217cbba8)). [anedota]

**Implicações para o jogo:**
1. O OVR (rating/ACS/KAST) **subestima** o IGL. Times de topo aceitam perder ~0,05 de rating para ter um. Isso é uma
   preferência revelada: as calls valem pelo menos o que esse rating custa.
2. Por isso o valor do IGL **não deve** entrar como bônus de OVR nem de "mira". Ele precisa de uma dimensão própria, que aja
   onde as calls agem.
3. O atributo `utility` (APR + KAST) já captura parte do perfil de suporte do IGL. Em clutch, o IGL é igual aos outros.

### 2.5 Casos de troca de IGL

Todos [anedota]. São casos, não experimentos. Ajudam a dar o tom, não o tamanho do efeito.

| Caso | O que aconteceu |
|---|---|
| EG + Boostio (IGL) e potter (coach), 2023 | Boostio foi contratado como IGL e potter passou a head coach. A EG venceu o Champions 2023 (3–1 na PRX) ([Nerd Street](https://nerdstreet.com/news/2023/8/evil-geniuses-win-valorant-champions-2023), [Liquipedia](https://liquipedia.net/valorant/Evil_Geniuses)). Boostio credita o próprio desenvolvimento como IGL ([ONE Esports](https://www.oneesports.gg/valorant/exclusive-eg-boostio-loud-saadhak/)) |
| Sentinels + johnqt (IGL), 2024 | Depois de ficar fora de todos os eventos internacionais de 2022 e 2023, trouxe johnqt e Zellsis e venceu o Masters Madrid 2024 (3–2 na Gen.G) ([VLR](https://www.vlr.gg/322297/sentinels-triumph-at-masters-madrid), [Dexerto](https://www.dexerto.com/valorant/sentinels-take-close-series-to-win-third-masters-title-at-madrid-2608720/)) |
| Sentinels 2022 (declínio com o IGL ShahZaM) | Ficou fora de todos os internacionais de 2022. A imprensa cita a falta de atualização de estratégias; ShahZaM saiu no fim do ano ([esports.gg](https://esports.gg/news/valorant/sentinels-2022-vct-seasonloss-to-faze-clan), [Sportskeeda](https://www.sportskeeda.com/valorant/shahzam-reportedly-dropped-sentinels-valorant-roster)) |
| FNS | IGL da OpTic campeã do Masters Reykjavík 2022 e vice no Champions 2022; depois foi para a NRG, 3ª no Champions 2023 (snapshot do projeto) |
| Ethan na NRG, 2025 | IGL de um time com três estreantes; campeão do Champions 2025 (3–2 na Fnatic) ([Sheep Esports](https://www.sheepesports.com/es/articles/valorant-champions-2025-nrg-is-your-2025-valorant-world-champions/en)) |
| LOUD + erde, 2026 | Elenco reconstruído com um IGL de 18 anos, campeão do Champions 2026 ([Dot Esports](https://dotesports.com/valorant/news/vct-champions-2026-grand-finals)). Contraexemplo útil: um IGL jovem também pode funcionar |
| FPX + ANGE1 | IGL veterano (32 anos), campeão do Masters Copenhagen 2022 ([ONE Esports](https://www.oneesports.gg/valorant/fpx-ange1-on-drx-masters-copenhagen-win/)) |

Nenhuma fonte isola o efeito do IGL do resto das mudanças, como novos jogadores e coach. Por isso o tamanho do efeito no
modelo é **decisão de design**, calibrada nos números da seção 3.

---

## 3. Dinâmica de round: números para parâmetros

Salvo indicação, os números vêm dos **dados próprios** (seção 1): playoffs internacionais de 2021 a 2026.

### 3.1 Lado

- Ataque vence **51,1%** dos rounds (2.973/5.818). Pistols: 49,0% (n = 541). Full buy contra full buy: 48,5% (n = 2.649).
  **O lado é quase neutro no agregado.**
- Por mapa, só regulamentar (amostras de 92 a 738 rounds; Summit, com 85, ficou de fora):

  | Mapa | Ataque | Mapa | Ataque |
  |---|---|---|---|
  | Sunset | 57,3% | Pearl | 49,5% |
  | Icebox | 56,2% | Fracture | 48,8% |
  | Lotus | 55,0% | Split | 48,3% |
  | Bind | 52,8% | Abyss | 47,7% |
  | Haven | 50,0% | Breeze | 47,0% |
  | Ascent | 49,9% | Corrode | 46,7% |

- O lado varia com patch e ano (ataque 45,7% em 2021, 53,3% em 2024, 47,0% em 2026). Com n pequeno, um viés por mapa de
  ±3 pp é razoável. O ranked mostra a mesma ordem de grandeza ([valking.gg](https://valking.gg/en/maps)), e dados antigos
  davam 46–48% ao ataque ([win.gg](https://win.gg/news/stats-show-that-every-valorant-map-favors-the-defense/)).

### 3.2 Como o round termina (plant, pós-plant, retake)

| Fato | Valor | n |
|---|---|---|
| Rounds com plant | **69,1%** | 3.885/5.625 |
| Ataque vence depois do plant | **71,1%** (defuse 28,9%) | 1.121 defuses (a soma por jogador bate exatamente com os ícones de defuse) |
| Defesa vence sem plant, por eliminação | 25,5% dos rounds | |
| Defesa vence por tempo | 3,5% dos rounds | |
| Ataque vence sem plantar (elimina todos antes) | ≈ 2% dos rounds | derivado |
| Formas de vitória | eliminação 66%, defuse 20%, explosão 10%, tempo 3,5% | 5.818 |

- Referência de dispersão entre times: na VCT 2023 a melhor equipe em pós-plant de ataque (Fnatic) converteu **74,8%**, e a
  melhor em retake (também a Fnatic) desarmou **39,1%** ([Riot, VALORANT Data Drop VCT 2023](https://playvalorant.com/en-us/news/dev/valorant-data-drop-vct-2023/),
  [esports.gg](https://esports.gg/news/valorant/valorant-delivers-a-data-drop-for-a-variety-of-vct-2023-categories/)).
  Contra a nossa média (71,1% e 28,9%), **o melhor time de retake fica ~10 pp acima da média** e o melhor de pós-plant ~4 pp.
  Isso é o teto para o efeito de "tática/utilidade" nessas situações.
- Retake por site (2022): Bind B 28%, Haven B 47%, Pearl e Fracture 30–35% ([ONE Esports](https://www.oneesports.gg/valorant/easiest-hardest-sites-retake-valorant/)). [dado antigo]
- Utilitário de pós-plant que atrasa o retake pune retakes apressados ([shattered.io](https://shattered.io/post-plant-utility-stalls-fast-retakes-pro-valorant/)). [anedota]

### 3.3 Economia

**Classe de compra × classe de compra** (% de vitória do time da linha; 5.495 rounds, cada um contado pelos dois lados):

| | vs Eco | vs Half | vs Full |
|---|---|---|---|
| **Eco** (< 10k) | — | 9,7% (n = 476) | 19,1% (n = 669) |
| **Half** (10–18k) | 90,3% (n = 476) | 50% | **35,1%** (n = 1.128) |
| **Full** (18k+) | 80,9% (n = 669) | 64,9% (n = 1.128) | 50% (n = 5.298) |

- O par Half × Eco é quase sempre o round 2 (bônus do vencedor do pistol contra o eco de quem perdeu).
- **Diferença de equipamento** (time − adversário, em mil créditos; regressão logística, rounds fora do pistol):
  logit(vitória) = 0,017 + **0,093 × Δequipamento** + 0,019 × (ataque? +1 : −1). A curva não é linear: fica plana entre −7,5k e
  +7,5k (45–55%) e sobe depressa depois (+10–12,5k: 76%; +15–17,5k: 84%). [dado]
- Uma regressão com 1.301 rounds (VCT 2024 Pacific/EMEA) também acha o equipamento o fator mais forte, acima de ultimates
  ([TechRxiv](https://www.techrxiv.org/doi/pdf/10.36227/techrxiv.174742078.82022650/v1)). [estudo] Em ranked, o estudo Roux/Omnic
  (via [Games Press](https://www.gamespress.com/en-US/145-million-rounds-what-actually-predicts-a-Valorant-round-win)) dá full
  contra eco = 85,0% e eco contra full = 15,9%. [estudo, ranked]
- **Pistol e conversão** (n = 541 pistols, estável entre 2021 e 2026):

  | Round | Vencedor do pistol vence | Por ano |
  |---|---|---|
  | R2 (anti-eco) | **87,4%** | 84–92% |
  | R3 (round bônus: o perdedor já tem full buy) | **38,3%** | 31–46% |
  | R4 | 54,8% | |

  - Mapa vencido por quem levou um pistol: 59,1%. Por quem levou os dois: **70,3%** (n = 118). Uma análise de tier 1 em 2025 cita
    ~74% ([Vortex](https://vortexgaming.io/en/postdetail/578940)) e o VCT Berlin 2021 dá números parecidos
    ([Medium](https://medium.com/@_SushantJha/importance-of-the-first-pistol-round-a-story-from-vct-berlin-c5935b34f138)).

**Decisões de compra observadas** (a política "pro", que serve de cadeia de Markov sem precisar modelar créditos):

| Contexto (rounds 4+ de cada metade) | Compra seguinte |
|---|---|
| Venceu com full | full 99% |
| Perdeu 1 com full | full 70%, half 18%, eco 13% (n = 1.525) |
| Perdeu 2 seguidas, a última com full | half 38%, full 37%, eco 25% (n = 521) |
| Perdeu 3+ seguidas, a última com full | half 43%, eco 29%, full 28% (n = 724) |
| Fez eco no round anterior | full 99–100% |
| Perdeu o pistol → R2 | eco 96% |
| Venceu o pistol → R2 | half 94% |
| Venceu R2 com half → R3 | half 51%, full 48% |

É aqui que mora a "decisão econômica": depois de perder com full, forçar (half, 35% contra full) ou salvar (eco, 19% agora e
full garantido depois). Um IGL pior erra mais essa escolha (seção 6.3).

**Ultimates:** não achamos número público de vitória por vantagem de ultimates. O estudo de 2024 acha um efeito menor que o do
equipamento (ver acima), e guias só descrevem o mecanismo
([Mobalytics](https://mobalytics.gg/blog/valorant/ultimate-economy-guide/)). Não vale a pena modelar no v2.

### 3.4 Embalo (momentum)

- Bruto: o vencedor do round anterior vence o seguinte em **57,0%** dos rounds com arma (n = 4.597).
- **Controlando a economia** (full contra full): **49,9%** (n = 2.649). Depois de 3 derrotas seguidas, o time que vinha perdendo
  vence **47,3%** (n = 842), ou seja, não há "virada" nem embalo. [dado]
- Um estudo amador no fórum do VLR achou ~62% depois de 5 vitórias seguidas, mas os próprios comentários apontam a economia como
  confundidor ([VLR](https://www.vlr.gg/post/4659774/momentum-in-valorant-update)). Nossos dados confirmam a crítica.
- **Decisão de modelo:** nada de bônus de momentum. A correlação entre rounds deve vir da economia simulada.

### 3.5 Primeira kill e vantagem numérica

- Quem faz a primeira kill vence o round **68,6%** das vezes (145 milhões de rounds, ranked, estudo do Roux Institute/Northeastern
  com dados da Omnic, via [Games Press](https://www.gamespress.com/en-US/145-million-rounds-what-actually-predicts-a-Valorant-round-win)).
  Uma análise de fã da VCT 2022 dá ~70%. [estudo, ranked; uma única fonte de imprensa]
  - Defesa com first kill que impede o plant: 79,0%. Ataque com first kill que planta e não sofre defuse: 73,9% (mesma fonte).
- Não há estatística pública de 4v3, 3v2 etc. no Valorant pro. No CS, a HLTV publica por time (exemplo: 80% em 5v4 e 22% em 4v5
  num mapa; [scope.gg](https://blog.scope.gg/usability-of-hltv-stats-for-pro-teams-first-duels-en/)).
- **Calibração própria (cadeia de duelos):** cada duelo é vencido pelo lado com `a` vivos contra `b` com probabilidade
  `a^α / (a^α + b^α)` (mais um desvio de habilidade). Calculando exatamente:

  | α | P(5v4) | P(4v3) | P(3v2) | P(2v1) | P(1v2) | Sucesso em clutch | Clutches por time e round |
  |---|---|---|---|---|---|---|---|
  | 0 | 0,64 | 0,66 | 0,69 | 0,75 | 0,25 | 21,5% | 0,64 |
  | **0,5** | **0,68** | **0,70** | **0,73** | **0,79** | **0,21** | **13,8%** | **0,58** |
  | 1 | 0,72 | 0,74 | 0,78 | 0,83 | 0,17 | 7,9% | 0,54 |
  | **Real** | ~0,69–0,70 | — | — | — | — | **14,2%** (3.799/26.832) | **0,55** |

  Com α = 0,5, **três números independentes batem** (first kill → round, sucesso em clutch e frequência de clutch). Esse é o
  principal motivo para propor a estrutura duelo → vantagem → round.
- Distribuição real dos clutches vencidos: 1v1 **61%**, 1v2 31%, 1v3 7,0%, 1v4 0,8%, 1v5 0,2% (n = 884). O modelo com α = 0,5
  gera mais 1v3 e 1v4 do que o real (52/32/14/5/1). Situações de muitos contra um terminam na spike ou no tempo antes do
  duelo. Dá para corrigir com um α maior quando a = 1 (por exemplo 0,8).
- **Conversão útil:** perto de 50%, um desvio de `t` no logit de cada duelo vira ~**2,4·t** no logit do round
  (t = 0,1 → round 56%; t = 0,2 → 62%).
- Multikills observados em 262 mapas: 2K 6.994, 3K 2.075, 4K 457, 5K 38 (validação do feed de kills).

### 3.6 Clutch, troca de kills e prorrogação

- Sucesso médio em clutch: 14,2% (acima). Jogadores variam: a stat `clutchPct` do card já existe.
- **Troca de kill:** não há número público de "% de mortes trocadas" no Valorant pro ([esports.net](https://www.esports.net/wiki/guides/what-is-kast-valorant/)
  só define o termo; janela de 3–5 s). A comunicação entra no modelo justamente como chance de trocar.
- **Prorrogação:** 13,6% dos mapas (37/272). Nos rounds de OT o ataque vence 50% (n = 134).
- **Margem final** (272 mapas): diferença de 2 rounds (13–11 ou OT) em 27%, 3–5 em 33%, 6–9 em 32% e 10+ em 8%. Serve de alvo
  de calibração.

### 3.7 Série

- Quem vence o próprio pick de mapa: **57,5%** (126/219). [dado, n moderado] É a medida mais direta de "conforto no mapa":
  equivale a ~+3 pontos de força na calibragem atual.
- Quem vence o mapa 1 leva a série em 72,5% (n = 80). O perdedor do mapa 1 vence o mapa 2 em 51,2%, e o mapa 2 costuma ser pick
  dele. **Não aparece um efeito forte de "adaptação" na série no agregado** (n pequeno). [dado fraco]

---

## 4. Fatores de time além da mira

### 4.1 Composição

2.534 composições time×mapa (páginas de agentes dos 18 eventos internacionais em cache):

| Composição | Frequência | % de vitórias |
|---|---|---|
| **0 controladores** | **0 casos (0%)** | — |
| 1 controlador | 58,4% | 49,0% |
| 2 controladores | 41,2% | 51,6% |
| 0 duelistas | 4,1% (n = 103) | 41,7% |
| 2 duelistas | 25,5% | 50,4% |
| 0 iniciadores | 1,2% (n = 30) | 60% (n pequeno) |
| 2 iniciadores | 42,3% | 47,6% |
| 0 sentinelas | **19,0%** | **50,6%** |
| 2 sentinelas | 11,9% | 53,5% |

Formatos (duelista-iniciador-controlador-sentinela) mais comuns: 1-2-1-1 (30%, 49,3%), 1-1-2-1 (22,5%, 51,4%),
2-1-1-1 (14,6%, 47,4%), 1-1-1-2 (8,8%, 53,6%), 2-1-2-0 (8,6%, 57,3%), 1-2-2-0 (8,3%, 48,3%).

Leitura:
- O controlador é estrutural: sem smoke não há execução nem retake. Dar mais peso à falta dele é justo, e guias concordam
  ([dodge.gg](https://www.dodge.gg/en-US/valorant/news/controller-guide-2026), [metabot.gg](https://metabot.gg/en/valorant/guides/valorant-agent-roles-explained)).
- **Sentinela é opcional** (19% das comps, sem perda). Hoje o motor tira 2 pontos por isso. Proposta: tirar 0, ou 0,5 se o time
  também não tem segundo controlador.
- Jogar sem duelista é raro e rende menos (41,7%, n = 103), então −2 é razoável.
- Jogar sem iniciador é raríssimo (n = 30): manter −3 por coerência com o meta, com confiança baixa.
- Cuidado: a % de vitória por composição sofre viés de seleção (times bons escolhem comps de meta). Use **frequência** como
  evidência de "obrigatório" e % de vitória só como indício.

### 4.2 Flex e encaixe de função

O motor já tem `roleFit` (1 / 0,9 flex / 0,75 fora da função). Os dados por jogador do VLR trazem os 3 agentes mais jogados com
%, o que permitiria um encaixe **por agente** (ex.: o card que joga 40% de Sova e 35% de Viper encaixa bem como iniciador e como
controlador). Fica como melhoria futura, sem relação com o IGL.

### 4.3 Comunicação, idioma e química

- O motor já dá química por dupla de companheiros (+0,5) e de compatriotas (+0,25), até +2.
- O país é um fato do dado; o idioma pode sair de uma tabela país → idioma, que também é um fato e não uma estatística.
  A evidência sobre idioma é qualitativa (seção 2.3). Se entrar, deve ser uma penalidade **pequena** e só quando nenhum idioma
  é falado por pelo menos 4 dos 5 jogadores.
- **Tempo junto e troca de time** (CS:GO): jogador que acaba de mudar de time rende menos, o time também, e a recuperação é lenta
  ([Zhang, Muric e Ferrara, 2022](https://arxiv.org/pdf/2205.09693)). [estudo] É a base para a química por "mesmo time e evento".
- Diferença grande de habilidade dentro do time tem efeito de incentivo negativo no CS:GO
  ([Rejthar, 2025](https://onlinelibrary.wiley.com/doi/10.1002/mde.70018)). [estudo; não propomos modelar]

### 4.4 Mapa, anti-strat e meta

- Conforto no mapa: pick próprio = 57,5% (seção 3.7). O `mapAffinity` do veto deve ficar perto de +2 a +4 pontos.
- Anti-strat: é trabalho de preparação do coach e do IGL ([VP Esports](https://vpesports.com/valorant/masters-london-veto-pressure-becomes-the-hidden-final-weekend-story/),
  [fórum VLR](https://www.vlr.gg/20092/difference-igl-and-coach)) [anedota]. Nos dados agregados o efeito ao longo da série é
  pequeno (seção 3.7), então o peso extra da Tática em mapas posteriores deve ser modesto.
- Meta e patch: o lado e a composição mudam por ano (seção 3.1). Os cards já carregam o evento, e com ele o meta da época.

---

## 5. Como outros simuladores fazem (inspiração)

- **Football Manager:** atributos mentais visíveis (*Decisions*, *Teamwork*, *Leadership*, *Composure*) influenciam a escolha
  da melhor opção em cada lance e se ela dá certo ([passion4fm](https://www.passion4fm.com/football-manager-player-attributes/);
  as análises do FM 2021 notaram mais peso para *decisions* e *teamwork*). Lição: **separar "o que o jogador consegue fazer"
  (técnica) de "o que ele escolhe fazer" (decisão)** e mostrar os dois.
- **CS e HLTV:** a HLTV publica por time "5v4 e 4v5 win rate" (seção 3.5), e o Rating 3.0 pesa mais kills em desvantagem
  numérica ([escorenews](https://escorenews.com/en/csgo/article/71475-how-hltv-rating-3-0-formula-actually-works-round-swing-and-eco-adjustment-explained)).
  Modelos de probabilidade de round no CS usam uma matriz de vivos por lado
  ([Bayes Esports](https://sc.bayesesports.com/portal/en/kb/articles/round-outcomes-in-counter-strike-global-offensive),
  [PandaScore](https://www.pandascore.co/blog/cs-go-round-modeling)), a mesma ideia da cadeia de duelos.
- **Road to Major e afins:** não achamos documentação do motor. Os parecidos são o CS.LEGENDS-UP (draft de 5 + coach em
  elencos históricos; [dust2.us](https://www.dust2.us/news/74884/new-cs-team-builder-web-game-cslegends-up-lets-you-build-a-major-winning-roster))
  e o "Esport Manager: Road To Major" (gestão). Nenhum publica o modelo.

---

## 6. Proposta: Modelo v2

Objetivos: (1) separar a força em **dimensões explicáveis** e mostradas na UI; (2) fazer "sem IGL" doer **onde o IGL atua**,
com texto claro; (3) calibrar com os números da seção 3; (4) continuar puro TS, com RNG de seed, sem estatística inventada.

### 6.1 Dimensões do time (0–100, mostradas na tela "Seu time")

`f(p) = roleFit(p.card.role, p.slot)`. Os atributos são os do card (0–100).

| Dimensão | Fórmula | De onde vem |
|---|---|---|
| **Mecânica** (MEC) | média de `f·(0,6·aim + 0,4·entry)` nos 5 | stats VLR (HS%, KPR, ADR, FK, net) |
| **Utilidade** (UTI) | média de `f·utility` × cobertura. Cobertura: sem controlador ×0,70; sem iniciador ×0,90; 2 controladores com ≥ 1 iniciador +3 | APR + KAST; composição (seção 4.1) |
| **Tomada de decisão** (TAT) | ver 6.2 | `decision` (antiga `leadership`) + IGL + coach |
| **Comunicação e química** (COM) | `min(100, 50 + 6·duplasCompanheiras + 3·duplasCompatriotas)`; −5 com dois IGLs; −10 opcional sem idioma comum a ≥ 4 | pares já calculados em `chemistryPairs` |
| **Clutch e compostura** (CLU) | `0,5·média(clutch) + 0,3·max(clutch) + 0,2·média(consistency)` | clutch% do VLR (amostra encolhida) |

"Força geral" continua sendo a média de `OVR × encaixe` (é a métrica com mais dado por trás). As dimensões **não somam pontos
fixos**: elas agem em situações específicas do round (6.4), centradas na média do pool, de modo que um time mediano em todas
fica com 0. Assim o OVR, que já embute parte da mecânica, não é contado duas vezes.

### 6.2 Tomada de decisão e o IGL

Cada card tem `decision` (renomeia `leadership`, mesma escala de hoje: Captain 90, IGL de infobox 80, ex-IGL em outro evento 60,
demais 45; ver `LEADERSHIP` em `src/data/real/cards.ts`). É uma **escala do jogo derivada de fatos da Liquipedia** (quem é IGL),
não uma estatística, e a UI deve dizer isso. Refinamento possível, também factual: +2 por evento internacional anterior como IGL
nos dados, até +10, como já é feito com a experiência do coach.

`coachTat = 40 + 20 × coach.tacticBonus` (0–3 → 40–100; sem coach = 40).

```
umIGL:    TAT = 0,70·decision(IGL) + 0,15·max(decision dos outros) + 0,15·coachTat
semIGL:   base = 0,70·max(decision dos 5) + 0,15·(2º maior decision) + 0,15·coachTat
          TAT  = min(55, 0,75·base)                 // "Sem IGL: −25%, teto 55"
doisIGLs: TAT = fórmula umIGL com o melhor IGL + 5   // segunda voz no mid-round
          COM −5                                    // "duas vozes"
iglKnown === false (elenco da IA sem dado): trata como umIGL com decision 70 (neutro, sem punir falta de dado)
```

Exemplos com o pool atual:
- IGL Captain (90) + ex-IGL (60) + coach campeão (100): TAT = 63 + 9 + 15 = **87**.
- IGL de infobox (80), resto 45, coach 0: 56 + 6,75 + 6 = **68,75**.
- Sem IGL, resto 45, coach 0: base = 31,5 + 6,75 + 6 = 44,25 → TAT = **33**.
- Sem IGL, com um ex-IGL (60) e coach top: base = 42 + 6,75 + 15 = 63,75 → TAT = 47,8 (coach e ex-IGL **compensam em parte**,
  mas o teto de 55 impede igualar um time com IGL).

### 6.3 Onde "sem IGL" dói (e quanto)

| Mecanismo | Regra proposta | Por quê / calibração |
|---|---|---|
| 1. Compras piores | Nos rounds de decisão (perdeu o anterior com full; ~25% dos rounds), chance extra de **compra errada** = `clamp(0,30 − 0,0035·TAT, 0,02, 0,20)`. TAT 75 → 4%; TAT 33 → 18%. Compra errada = joga half contra full (35% em vez de 50% ou eco) e o próximo round sai com compra pior | Matriz de compra e transições da seção 3.3 |
| 2. Pós-plant e retake desorganizados | No pós-plant, desvio por duelo `ρ = ρ0 + 0,003·(TAT_atk − TAT_def) + 0,002·(UTI_atk − UTI_def)` | Dispersão real: melhor retake ~+10 pp, melhor pós-plant ~+4 pp sobre a média (seção 3.2). Uma diferença de 35 de TAT dá ~5–6 pp |
| 3. Pouca adaptação na série | Peso da TAT ×1,0 no mapa 1, ×1,25 no 2, ×1,5 do 3 em diante; +0,25 na 2ª metade (ajuste no intervalo) | Anti-strat e intervalo (seção 2.2). O efeito agregado é pequeno (3.7), então o aumento é modesto |
| 4. OT e pressão | Na prorrogação, peso de TAT e CLU ×1,5 | Decisão de design: cada OT reinicia a economia (5.000 créditos), então pesam calls e compostura. Não há dado específico de OT por time |
| 5. Timeouts do coach | 2 por mapa: depois de 3 derrotas seguidas, +0,05 no logit do duelo no round seguinte (efeito pequeno) | Sem embalo em full × full (3.4); 34% no Berlin; o estudo do CS é exógeno |

**Alvo de calibração:** "sem IGL" (TAT ~33 contra ~70) deve custar **3–4 pp de rounds no mapa 1** (≈ 4–5 pontos de força na
escala atual) e ~5 pp no mapa 3 de uma série. Hoje é −4 contra +2 (6 pontos fixos em todos os rounds). O tamanho total fica
parecido, mas agora é **situacional e explicado**.

### 6.4 Estrutura do round v2: duelo → vantagem → round

**Opção A (incremental, cabe no `simulateMap` atual):** mantém uma logística por round e troca o termo fixo por termos de
contexto:

```
logit = ΔBase/30 + forma + lado + E(compras) + Σ_d peso_d(contexto)·(D_A − D_B)/k_d
E: R2 → +1,9 para o vencedor do pistol (87%); R3 → −0,48 (38%, round bônus); demais rounds pela matriz
   (Full×Half 0,62; Full×Eco 1,44; Half×Eco 2,23; Half×Full −0,62) ou 0,093·Δequipamento(k)
pesos: MEC 1 em rounds com arma e 0,5 em eco; UTI 1 (×1,2 em full × full);
       TAT 0,5 de base, ×2 em rounds com diferença de compra, × fatores de série e OT (6.3);
       COM 0,5; CLU só na OT
```

Bastaria corrigir a economia (R2 e R3) com a cadeia de compras da seção 3.3 para alinhar o motor a dois dos números mais
robustos que achamos.

**Opção B (recomendada; deixa o feed de kills coerente com o resultado):**

1. **Compra:** cada time recebe uma classe (pistol, eco, half, full) pela cadeia da seção 3.3. A TAT altera as escolhas em
   rounds de decisão (6.3, item 1). Termo de economia por duelo: `τ_E = E/2,4`.
2. **Duelos antes do plant** a partir de 5v5. Para cada duelo:
   ```
   logit P(A vence) = 0,5·ln(a/b) + τ
   τ = 0,0139·ΔBase                       // calibra +10 de força ≈ +0,33 no logit do round, como hoje
     + k_mec·ΔMEC                         // 1º duelo usa MEC com peso de entry (0,7·entry + 0,3·aim)
     + k_uti·ΔUTI                         // execução de ataque / segurar site
     + k_com·ΔCOM se o lado acabou de perder um jogador (troca)
     + k_clu·CLU quando o lado tem 1 vivo (com α_clutch = 0,8)
     + τ_E + viés de lado do mapa
   ```
   Valores iniciais: `k_mec = k_uti = 0,004`, `k_com = 0,003`, `k_clu = 0,004`; ajustar no `balance.test`.
3. **Plant:** depois do 2º duelo (ou quando a defesa cai para ≤ 2), o ataque planta com
   `P = logistic(c0 + 0,6·(a − b) + 0,003·(TAT_atk − TAT_def) + 0,002·ΔUTI)`, com `c0` ajustado para **69% de plant** entre
   times iguais. Se o ataque elimina todos antes, vence (≈ 2% dos rounds).
4. **Depois do plant:** a cadeia continua com o desvio de pós-plant `ρ` (6.3, item 2). `ρ0` é ajustado para o ataque vencer
   **71%**. A defesa só vence eliminando todos (é o defuse). Sem plant, a defesa vence por eliminação ou por tempo: com
   probabilidade 3,5/31 dos rounds sem plant, termina no tempo.
5. **Kills:** saem da própria cadeia (quem venceu cada duelo), com a escolha de quem mata e de quem morre como hoje (`killWeight`,
   `deathWeight`). O placar VLR (FK, clutches, multikills) passa a ser **consequência** do round, e não sorteado depois.

**Metas de calibração** (para um teste novo em `src/game/balance.test.ts`, times iguais, muitos mapas com seed):

| Métrica | Alvo | Tolerância |
|---|---|---|
| Ataque vence o round | 51% | ±2 pp |
| Rounds com plant | 69% | ±3 |
| Ataque vence depois do plant | 71% | ±3 |
| Time com a first kill vence o round | 69% | ±3 |
| Sucesso em clutch | 14% | ±2 |
| Clutches por time e round | 0,55 | ±0,05 |
| 1v1 entre os clutches vencidos | ~60% | ±8 |
| Vencedor do pistol vence R2 / R3 | 87% / 38% | ±3 / ±4 |
| Mapa para quem venceu os dois pistols | 70% | ±5 |
| Mapas com prorrogação | 13,6% | ±3 |
| Full × full: repete o vencedor do round anterior | 50% | ±2 |
| +10 de força no mapa (meta já existente) | ~75–78% | — |

### 6.5 O que muda nos cards e nos tipos

- `Attributes.leadership` → **`decision`** (UI: "DECISÃO"). Mesma escala e mesma origem (Liquipedia). Para não inventar número,
  quem não é IGL nem ex-IGL fica no valor base (45). Não deriva de stat de mira.
- `Card.isIGL` continua uma **etiqueta separada da função do agente**: o IGL pode ser controlador, iniciador ou sentinela. Os
  dados mostram 95% em funções de suporte. Na UI: selo "IGL" no card, independente do slot.
- O OVR não ganha bônus de IGL: o valor do IGL está na TAT.
- `Coach.tacticBonus` passa a entrar na TAT (15% do peso), em vez de somar pontos fixos. `vetoBonus` segue como está.
- `MISSING_ROLE_PENALTY` vira cobertura de Utilidade: sem controlador ×0,70, sem iniciador ×0,90, sem duelista −2 em MEC no 1º
  duelo, sem sentinela 0 (seção 4.1).
- Novo, opcional: `Lineup.iglKnown` continua; quando falta dado do IGL nos elencos da IA, TAT fica neutra (70).

### 6.6 Textos para a UI (pt-BR)

- Barras na tela "Seu time": **Mecânica 78 · Utilidade 71 · Tomada de decisão 33 · Comunicação 62 · Clutch 55**
- Aviso sem IGL: **"Sem IGL: Tomada de decisão −25% (máx. 55)"**
- Detalhe (tooltip): "Sem alguém para fazer as calls, o time compra pior depois de perder, organiza mal pós-plant e retake e se
  adapta menos ao adversário ao longo da série."
- Efeitos listados:
  - "Compras: +14% de chance de forçar na hora errada"
  - "Retake: −6% de defuse"
  - "Série: a diferença de decisão pesa 50% mais a partir do 3º mapa"
- Compensação: "Coach {nome}: responde por 15% da Tomada de decisão (preparação, intervalo e timeouts), mas não faz calls durante o round."
- Dois IGLs: "Dois IGLs: segunda voz no mid-round (Decisão +5), mas duas vozes nas calls (Comunicação −5)."
- Sem controlador: "Sem controlador: Utilidade −30%. Em 2.534 composições de eventos internacionais, nenhum time jogou sem um."
- No placar de rounds: "R2: anti-eco (quem vence o pistol leva 87%)" · "R3: round bônus (o time do pistol leva só 38%)"
- Card: "DECISÃO 90: IGL (Captain na Liquipedia). Escala do jogo, não estatística."

### 6.7 Ordem sugerida

1. Economia: cadeia de compras + R2 e R3 (Opção A). Maior ganho de realismo e menor risco.
2. TAT e IGL (6.2 e 6.3) com os textos de UI.
3. Cadeia de duelos (Opção B) com as metas de 6.4.
4. COM e idioma, encaixe por agente: opcionais.

---

## 7. Tabela de parâmetros candidatos

| Parâmetro | Valor | Faixa ou IC | Fonte | Confiança |
|---|---|---|---|---|
| Vencedor do pistol vence R2 | 87,4% | 84–92% por ano (n = 541) | dados próprios VLR | Alta |
| Vencedor do pistol vence R3 | 38,3% | 31–46% | dados próprios VLR | Alta |
| Mapa para quem venceu 1 / 2 pistols | 59,1% / 70,3% | n = 541 / 118 | dados próprios VLR; ~74% em [Vortex](https://vortexgaming.io/en/postdetail/578940) | Média |
| Ataque vence o round (geral / full × full / pistol) | 51,1% / 48,5% / 49,0% | por mapa 46–57% | dados próprios VLR | Alta (geral), baixa (por mapa) |
| Rounds com plant | 69,1% | n = 5.625 | dados próprios VLR | Alta |
| Ataque vence depois do plant | 71,1% | melhor time 74,8% (2023) | dados próprios; [Riot](https://playvalorant.com/en-us/news/dev/valorant-data-drop-vct-2023/) | Alta |
| Defuse (retake) | 28,9% | melhor time 39,1% | idem | Alta |
| Rounds que terminam no tempo | 3,5% | — | dados próprios | Alta |
| Matriz de compra (F×H, F×E, H×E) | 64,9% / 80,9% / 90,3% | n = 1.128 / 669 / 476 | dados próprios | Alta |
| Logit por mil créditos de diferença | 0,093 | curva plana em ±7,5k | dados próprios (~10 mil time-rounds) | Alta |
| Cadeia de compras (perdeu com full → full/half/eco) | 70/18/13; depois de 2 derrotas 37/38/25 | tabela 3.3 | dados próprios | Alta |
| Embalo em full × full | 0 (49,9%) | n = 2.649 | dados próprios | Alta |
| First kill → round | 68,6–70% | — | [Roux/Omnic](https://www.gamespress.com/en-US/145-million-rounds-what-actually-predicts-a-Valorant-round-win) (ranked) + VCT 2022 (fã) + cadeia α = 0,5 (68%) | Média-alta |
| α da cadeia de duelos | 0,5 | 0,5–1 (clutch de 1 vs muitos) | ajuste próprio a 3 números | Média-alta |
| Sucesso em clutch | 14,2% | IGL 14,5%, outros 14,1% | snapshot (26.832 situações) | Alta |
| Clutches por time e round | 0,55 | — | snapshot | Alta |
| Clutches vencidos 1v1/1v2/1v3/1v4/1v5 | 61/31/7/0,8/0,2% | n = 884 | dados próprios | Alta |
| Mapas com OT | 13,6% | n = 272 | dados próprios | Média |
| Vence o próprio pick | 57,5% | n = 219 (±3,3) | snapshot | Média |
| IGL: rating, ACS, APR em relação aos colegas | −0,05; −17; +21% | n = 173 | snapshot | Alta (direção), média (fonte do IGL) |
| Comps sem controlador | 0% | n = 2.534 | snapshot (páginas de agentes) | Alta |
| Comps sem sentinela / % de vitórias | 19% / 50,6% | n = 482 | idem | Alta / Média |
| Comps sem duelista / % de vitórias | 4,1% / 41,7% | n = 103 | idem | Média |
| Timeout: vitória de quem pediu | 34,4% | 1 evento | [Upcomer](https://upcomer.com/answering-valorant-masters-3-berlin-questions-part-2) | Baixa |
| Timeout técnico no CS (reversão) | +14,8 pp | 103 partidas | [UdeSA](https://repositorio.udesa.edu.ar/items/4c7a1080-47ef-4178-90d3-ca44a8a0af9c) | Média (outro jogo) |
| Custo-alvo de "sem IGL" | 3–4 pp de rounds (mapa 1), ~5 pp (mapa 3) | — | **decisão de design**, limitada pela dispersão de retake e pós-plant | Design |

---

## 8. Riscos

- **Complexidade:** cinco dimensões, cadeia de compras e cadeia de duelos é muita coisa para explicar. Mitigação: mostrar só as
  barras e os avisos; os detalhes ficam no tooltip; implementar em etapas (6.7).
- **Balanceamento:** com R2 em 87% e R3 em 38%, o pistol vale mais e a variância por mapa sobe. Talvez seja preciso reduzir
  `FORM_SWING` para manter "+10 ≈ 75–78%". Todos os testes de `src/game/balance.test.ts` precisam rodar de novo.
- **Contagem dupla:** o OVR já carrega mecânica. Por isso as dimensões entram centradas e por situação, não como soma fixa.
- **Dados do IGL:** `infobox-unique` é função de carreira e não do evento; 43 elencos estão com `none` (ex.: DRX 2022 e Sentinels
  2021, que tinham IGL conhecido) e 15 com `infobox-ambiguous` ou `conflict`. Penalizar "sem IGL" em elenco da IA por falta de dado
  seria injusto: manter a regra de `iglKnown: false` → neutro e, se necessário, um arquivo separado de correções manuais (como
  `docs/data.md` já prevê).
- **Economia sem dado no snapshot:** as stats de evento do VLR não têm economia por round. Os números da seção 3.3 vêm das abas de
  economia das partidas (que o pipeline poderia passar a guardar). Para o motor basta a tabela agregada, sem dado por time.
- **Fontes externas fracas:** o 68,6% de first kill vem de ranked e de uma única fonte de imprensa. Tudo que é "IGL mudou o time" é
  caso, não experimento. O tamanho do efeito "sem IGL" é escolha de design, e a UI não deve apresentá-lo como estatística.
- **Viés da amostra:** playoffs de topo. Times fracos podem ter conversões diferentes (por exemplo, R2 menor).
- **Determinismo:** tudo continua no `Rng` com seed. A cadeia de duelos consome mais números aleatórios por round, o que muda as
  seeds atuais; é preciso atualizar os snapshots de teste.

---

## 9. Referências

Dados próprios (2026-10-19): páginas públicas do [VLR.gg](https://www.vlr.gg) (abas visão geral, `economy` e `performance` de 91
séries; páginas de stats e de agentes de 18 eventos) e da [Liquipedia](https://liquipedia.net/valorant/) (elencos, IGL e coach;
CC-BY-SA 3.0), já usados pelo pipeline do projeto.

- Riot Games, *VALORANT Data Drop: VCT 2023*: https://playvalorant.com/en-us/news/dev/valorant-data-drop-vct-2023/ (resumo: https://esports.gg/news/valorant/valorant-delivers-a-data-drop-for-a-variety-of-vct-2023-categories/)
- Games Press / Roux Institute (Northeastern) com Omnic, *145 million rounds: what actually predicts a Valorant round win*: https://www.gamespress.com/en-US/145-million-rounds-what-actually-predicts-a-Valorant-round-win
- Wang, *A Predictive Analysis of Valorant Esports: Win Probability Through Economy and Ultimate Ability* (TechRxiv): https://www.techrxiv.org/doi/pdf/10.36227/techrxiv.174742078.82022650/v1
- Regulamento VCT EMEA 2024: https://liquipedia.net/commons/images/4/40/VCT_2024_EMEA_Official_Competiton_Rulebook.pdf
- Regulamento VCT Challengers EMEA 2025: https://liquipedia.net/commons/images/f/f1/VCT_EMEA_Challengers_Tournament_Rules_Version_1_1.pdf
- HLTV, *Why more and more IGLs are taking up the 'supportive rotator' role*: https://www.hltv.org/news/38747/why-more-and-more-igls-are-taking-up-the-supportive-rotator-role
- Zhang, Muric e Ferrara, *Individual and Collective Performance Deteriorate in a New Team: A Case Study of CS:GO Tournaments* (2022): https://arxiv.org/pdf/2205.09693
- Gómez Seeber, *The effect of timeouts on team performance: evidence from e-sports* (UdeSA): https://repositorio.udesa.edu.ar/items/4c7a1080-47ef-4178-90d3-ca44a8a0af9c
- Upcomer, timeouts no Masters Berlin: https://upcomer.com/answering-valorant-masters-3-berlin-questions-part-2
- Esports Insider, entrevista com Boaster (2025): https://esportsinsider.com/2025/04/boaster-interview-on-fnatics-comeback-formula
- Hotspawn, Boaster na EWC: https://www.hotspawn.com/valorant/news/boaster-ewc-valorant-final-interview
- ONE Esports, Boostio e Saadhak: https://www.oneesports.gg/valorant/exclusive-eg-boostio-loud-saadhak/
- Sportskeeda, Monyet sobre jogar sem IGL: https://sportskeeda.com/valorant/news-it-s-hard-sure-paper-rex-s-monyet-playing-without-igl-vct-masters-madrid-exclusive
- Sportskeeda, d4v41: https://www.sportskeeda.com/valorant/news-i-want-lift-trophy-paper-rex-d4v41-lays-personal-goals-ahead-vct-masters-shanghai-exclusive
- ONE Esports, Northeption e as duas línguas: https://www.oneesports.gg/valorant/northeption-comms-two-languages/
- VLR, *Sentinels triumph at Masters Madrid*: https://www.vlr.gg/322297/sentinels-triumph-at-masters-madrid
- VLR fórum, *Momentum in VALORANT: Update*: https://www.vlr.gg/post/4659774/momentum-in-valorant-update
- ONE Esports, retakes por site: https://www.oneesports.gg/valorant/easiest-hardest-sites-retake-valorant/
- scope.gg, stats de first duel da HLTV: https://blog.scope.gg/usability-of-hltv-stats-for-pro-teams-first-duels-en/
- Medium, *Importance of the first pistol round* (VCT Berlin): https://medium.com/@_SushantJha/importance-of-the-first-pistol-round-a-story-from-vct-berlin-c5935b34f138
- Medium, *The IGL Debacle*: https://medium.com/@_SushantJha/the-igl-debacle-f599217cbba8
- passion4fm, atributos do Football Manager: https://www.passion4fm.com/football-manager-player-attributes/
- dust2.us, CS.LEGENDS-UP: https://www.dust2.us/news/74884/new-cs-team-builder-web-game-cslegends-up-lets-you-build-a-major-winning-roster
