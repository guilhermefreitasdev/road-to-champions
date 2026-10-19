# Pesquisa: variância, forma, afinidade e aura (Modelo v3 — Forma, explosão, afinidade e aura)

Pesquisa feita em 2026-10-19 a partir do pedido: "os jogadores estão consistentes demais, isso não existe na vida real.
Quero uma variável de jogador 'inspirado': jogadores que tendem a ser MVP da partida (lukxo no Champions 2026, tkzin que fez
3 aces numa partida do nada). Mas não pode ser qualquer jogador aleatório: um jogador muito bom também pode só jogar um pouco
acima da média. Analise isso e pesquise o que mais pode melhorar a previsão."

Este documento **não muda código**. Ele (1) mede, em dados próprios do VLR, quanto um jogador varia de mapa para mapa, se essa
variação é previsível e de onde vêm os "mapas inspirados"; (2) mede o mesmo no nível do time (forma por mapa, embalo na série,
zebras); (3) resume como outros simuladores e a literatura tratam forma e "mão quente"; e (4) propõe o **Modelo v3 — Forma e
explosão** para `src/engine/`, com alvos de calibração numéricos. As seções 9–12 estendem a pesquisa a três pedidos
seguintes: **afinidade jogador × agente × mapa e meta por mapa**, **"GOATs" e "durões" (aura)** e **prodígios**.

## Sumário

1. **O jogador varia muito de mapa para mapa, e de forma quase universal.** O rating VLR de um mapa fica a ±0,30 da média do
   jogador no evento (desvio padrão; n = 9.319 mapas de jogadores com ≥ 8 mapas no evento), com cauda direita leve (assimetria
   +0,25). Em 15,6% dos mapas o jogador fica ≥ +0,30 acima da própria média e em 5,2% fica ≥ +0,50. Hoje o motor não tem
   nenhuma forma individual por mapa: só a forma do time (±15 pontos).
2. **"Explosão" não é um traço do jogador: é função do nível.** O desvio padrão de um jogador em um evento **não prevê** o dele
   no evento seguinte (correlação −0,005, n = 522 pares; metade ímpar × par dos mapas: 0,017). Já a média é estável (0,33 a
   0,51). O mesmo vale para "pico de kills" (corr. −0,015, n = 1.905) e para "jogar melhor em playoff" (−0,07, n = 50). Portanto
   um atributo `volatility` medido por jogador seria ruído. O que é real: **estrelas têm teto e piso mais altos**. O p90 do
   mapa cresce mais rápido que a média (p90 = 0,21 + 1,18 × média; p10 = −0,20 + 0,82 × média). O quartil de cima (média 1,10)
   faz um mapa ≥ 1,5 em 11% das vezes e ≥ 1,8 em 2,6%; o quartil de baixo (0,89), em 2,5% e 0,3%.
3. **Ser MVP do mapa é previsível pela média, e só por ela.** A chance de ser o melhor rating dos 10 sobe de 7% (média 0,9–1,0)
   para 17% (1,1–1,2), 29% (1,2–1,3) e 38% (> 1,3). Descontada a média, a frequência de MVP em outros eventos não acrescenta
   nada (correlação parcial −0,01). O MVP do time num mapa é o melhor jogador do elenco (pela média) em 39% dos mapas, o 2º em
   26%, o pior em 7%. É exatamente o que o pedido descreve: a estrela "pode só jogar um pouco acima da média", e um coadjuvante
   explode às vezes, mas com frequência menor.
4. **Um jogador "inspirado" quase sempre está do lado que vence.** O melhor rating do mapa vem do time derrotado em só 15,2%
   dos mapas (14,0% nos internacionais de 2025–26). Quando alguém faz ≥ 1,4, o time dele vence 88% dos mapas; ≥ 1,5, 91,5%.
   Um terço da variância do rating por mapa é "forma do time" (comum aos 5, correlação 0,89 com o placar); dois terços são
   individuais (desvio 0,25 em torno da média do time no mapa).
5. **Mão quente existe, mas é pequena.** Dentro de uma série, a correlação do desvio de um mapa com o do mapa seguinte é 0,067
   (n = 6.409); depois de um mapa ≥ +0,3, o próximo fica em média +0,025 (19% de repetir contra 17% de base). "Fase boa no
   torneio" também existe, mas vale ±0,04 de rating (desvio verdadeiro entre eventos do mesmo jogador, descontado o ruído de
   amostra), contra ±0,32 de um mapa para o outro. lukxo no Champions 2026: 1,22 contra 1,14 no Stage 2 (+0,08, ≈ 2σ de
   "fase"), com 18 mapas. tkzin: 1,02 no Champions (4 aces em 18 mapas, 2 deles no mapa de estreia) contra 0,87 no Stage 2
   (0 aces em 19). Os dois são caso, não regra.
6. **Multikills são mais frequentes do que o motor produz, sobretudo para estrelas.** Por round e jogador (3.990 mapas de
   jogadores com aba de performance, 2025–26): 3K 3,80%, 4K 0,80%, ace 0,083% (um ace a cada 121 rounds; 16% dos mapas têm
   ace; 0,175 ace por mapa). Poisson com o mesmo KPR daria 2,7% / 0,47% / 0,07%: o round tem "cadeia". A taxa cresce
   exponencialmente com o KPR: ln(4K+) = −11,1 + 8,75 × KPR, então quem mata 0,84 por round faz 5× mais 4K e 12× mais aces que
   quem mata 0,55. Réplica do `simulateKills` atual: 3K 3,0%, 4K 0,5%, ace 0,04% para iguais, e 0,11% de ace para uma estrela
   (real: 0,24%). Descontado o KPR, "fazer multikill" não é traço (corr. parcial −0,02).
7. **No nível do time, o motor está na faixa certa.** O desvio residual do placar de um mapa, descontada a força dos dois
   times no evento, equivale a uma forma por mapa de σ ≈ 0,08–0,09 na probabilidade de round (diferença entre os dois
   times); o motor hoje dá ≈ 0,06 (`FORM_SWING = 10`). Não há embalo entre mapas: o vencedor do mapa 1 leva o mapa 2 em 54,4%,
   contra 53,4% esperado só pela força (n = 551); no 1–1, o vencedor do mapa 2 leva o 3º em 53,0% (n = 251). A curva de zebra
   do motor (+10 de força ≈ 74%) fica entre a curva "cards são a verdade" (84%, mesma amostra) e a curva "força do evento
   anterior" (56%).
8. **Proposta (seção 6):** forma individual por mapa sorteada para cada jogador (desvio em rating ≈ 0,25, com cauda direita e
   teto proporcional ao nível), que mexe nas kills, nas mortes, na chance de multikill (cadeia dentro do round) e um pouco na
   força do time; uma "fase do torneio" pequena e persistente por run; embalo de série quase nulo; selos "🔥 Inspirado",
   "MVP do mapa" e "MVP da série" na UI. Nada disso é atributo novo de card medido por jogador: o teto deriva do OVR.

---

## 1. Fontes e método

**Dados próprios (alta confiança):**
- **Páginas de partida do VLR** em cache (`.cache/vlr/<id>/…`): 563 séries de 57 eventos (2021–2026), 1.549 mapas,
  13.990 linhas jogador-mapa com Rating 2.0, ACS, K/D/A, KAST, ADR, HS%, FK e FD **por mapa**. Inclui **todas** as 158 séries
  dos seis eventos internacionais de 2025–2026 (Masters Bangkok, Toronto, Santiago e London; Champions 2025 e 2026: 399 mapas,
  3.545 jogador-mapas), baixadas para esta pesquisa com o cliente do pipeline (2,5 s entre pedidos, User-Agent do projeto,
  `robots.txt` respeitado; 288 pedidos). O resto são as séries de playoff de 2021–2024 e as de ligas regionais já em cache.
- **Aba `performance`** (`?game=all&tab=performance`) das mesmas 158 séries: 2K/3K/4K/5K, clutches 1v1…1v5, plants e defuses
  **por mapa** (3.990 jogador-mapas). A página "all" traz as tabelas de cada mapa, por isso uma página por série bastou.
- **Snapshot do projeto** (`src/data/real/vlr/events/*.json`): 3.357 linhas jogador-evento com `kmax` (máximo de kills num
  mapa), KPR, rating etc.; e os 714 elencos com força e atributos do jogo (gerados com `teamStrength` e `buildRealPool`, sem
  mudar código).
- **Definições.** "Resíduo" = rating do mapa − média do jogador no evento (ou, nos testes de embalo, média do jogador nos
  **outros** eventos, para não contaminar a correlação). "Top do mapa" = maior rating entre os 10. "MVP do time" = maior
  rating entre os 5. Reprodutível com os scripts em `scratchpad` desta sessão (parse e análise em Python).
- **Viés da amostra:** times de topo (internacionais + ligas franqueadas). Como o jogo simula exatamente esse recorte, é
  o viés certo. Ratings são **resultado** (dependem do placar), e o motor trabalha com **entradas**: por isso as metas de
  calibração da seção 6 são sobre o placar que o motor imprime, não sobre parâmetros diretos.

**Fontes externas:** neste ambiente só `vlr.gg` respondeu; HLTV, Medium, Springer e The Spike foram lidos via resumos de
busca. Marcamos **[dado]** (medido, amostra conhecida), **[estudo]** (trabalho com método), **[comunidade]** (guia ou
análise de fã) e **[anedota]** (caso isolado).

---

## 2. Quanto um jogador varia de mapa para mapa

### 2.1 Distribuição do resíduo (rating do mapa − média do jogador no evento)

Jogadores com ≥ 8 mapas no evento; n = 9.319 mapas (774 pares jogador-evento). [dado]

| Medida | Valor |
|---|---|
| Desvio padrão | **0,302** (2025–26 internacionais: 0,301; regionais 0,308) |
| Assimetria / curtose em excesso | +0,25 / +0,36 (quase normal, cauda direita leve) |
| p1 · p5 · p10 · p25 · p50 · p75 · p90 · p95 · p99 | −0,67 · −0,48 · −0,38 · −0,20 · −0,01 · +0,19 · +0,39 · +0,51 · +0,77 |
| Mapas ≥ +0,30 / ≥ +0,50 acima da média | 15,6% / 5,2% |
| Mapas ≤ −0,30 / ≤ −0,50 | 15,5% / 4,3% |
| Em outras stats (desvio do resíduo) | ACS 51 (média 200); KPR 0,20 (média 0,71); K/D 0,56; ADR 32; KAST 10,5 pp |

Decomposição (jogador-mapa em torno da **média do time naquele mapa**): o resíduo total 0,302 = componente comum aos 5
(0,174; 33% da variância; correlação 0,89 com o saldo de rounds: ganhar 13–5 sobe o rating dos 5 em ≈ 0,22) + componente
**individual 0,248** (assimetria +0,17; p95 +0,42; p99 +0,61; 11,1% dos mapas ≥ +0,30; 2,5% ≥ +0,50). Em KPR: total 0,203 =
time 0,096 + individual **0,180** (≈ ±26% das kills).

Para efeito de UI, no conjunto todo um mapa "inspirado" (rating ≥ 1,5) acontece em **7,7%** das linhas jogador-mapa; ≥ 1,3 em
19,5%; ≥ 1,8 em 1,6%; ≥ 2,0 em 0,45%; o máximo observado foi 2,54 (e 39 kills num mapa). Num evento de ≥ 10 mapas, 64% dos
jogadores têm pelo menos um mapa ≥ 1,5 e 18% um ≥ 1,8.

### 2.2 Função e nível

Desvio padrão por jogador-evento (≥ 8 mapas): [dado]

| Função | Pares | SD médio | Média |
|---|---|---|---|
| Duelista | 222 | **0,333** | 1,035 |
| Sentinela | 117 | 0,304 | 1,018 |
| Controlador | 221 | 0,301 | 1,006 |
| Iniciador | 214 | 0,289 | 1,014 |

Duelistas oscilam ~15% mais que iniciadores; a diferença é real mas pequena. Pela componente individual: duelista 0,262,
sentinela 0,251, controlador 0,243, iniciador 0,235.

Por nível (quartis da média no evento): SD 0,287 (Q1, média 0,87) → 0,298 → 0,311 → **0,332** (Q4, média 1,17); correlação
média × SD = 0,23. Regressão por jogador (≥ 15 mapas no conjunto, n = 233): `SD = 0,17 + 0,14 × média`. Ou seja, a estrela
oscila um pouco mais em termos absolutos, mas **o teto sobe mais que o piso**:

| Quartil (média) | Mapas | p10 | p90 | Melhor mapa (média) | ≥ 1,3 | ≥ 1,5 | ≥ 1,8 | ≤ 0,7 |
|---|---|---|---|---|---|---|---|---|
| Q1 (0,89) | 2.362 | 0,53 | 1,24 | 1,54 | 8,8% | 2,5% | 0,3% | 27,0% |
| Q2 (0,97) | 3.046 | 0,59 | 1,36 | 1,78 | 13,8% | 5,6% | 0,9% | 20,2% |
| Q3 (1,02) | 3.170 | 0,63 | 1,41 | 1,79 | 17,8% | 7,2% | 1,1% | 15,2% |
| Q4 (1,10) | 4.151 | 0,70 | 1,50 | 1,96 | 26,5% | 11,0% | 2,6% | 11,3% |

`p10 = −0,20 + 0,82 × média` (corr. 0,73) e `p90 = 0,21 + 1,18 × média` (corr. 0,82). Resposta direta ao pedido: estrelas
têm **piso e teto** mais altos; a "explosão" de uma estrela (≥ 1,8) é 9× mais comum que a de um jogador do quartil de baixo.

Ligação com o jogo: nos 772 cards casados com a amostra, `média do mapa = −0,285 + 0,0162 × OVR` (corr. 0,79). Por faixa de
OVR: ≤ 72 → 0,85; 76–80 → 1,00; 84–88 → 1,12; ≥ 88 → 1,19. Um ponto de OVR vale ≈ 0,016 de rating; o desvio individual de um
mapa (0,25) equivale a ≈ 15 pontos de OVR "efetivo" naquele mapa.

### 2.3 Volatilidade é traço? Não.

| Teste | n | Correlação |
|---|---|---|
| SD de mapas ímpares × pares do mesmo jogador (≥ 20 mapas) | 208 | **0,017** (a média: 0,51) |
| SD no evento A × SD no evento B seguinte (≥ 8 mapas cada) | 522 | **−0,005** (a média: 0,33) |
| SD residual (descontada a média) ímpar × par | 208 | −0,03 |
| `kmax / kills por mapa` ("pico") no evento A × B (snapshot, ≥ 8 mapas) | 1.905 | **−0,015** (KPR: 0,62) |
| Frequência de ser top do mapa, este evento × outros, **descontada a média** | 974 jogador-eventos | **−0,01** (MVP do time: +0,09) |
| Taxa de 3K+ ímpar × par descontado o KPR (≥ 400 rounds) | 82 | −0,02 (KPR: 0,78; 3K+ bruto: 0,53) |
| "Melhor em playoff" (resíduo playoff − grupos) evento A × B | 50 | −0,07 (média do ganho: −0,06) |

Conclusão forte: com os dados públicos, **nenhuma medida de "explosividade", "clutch de playoff" ou "propensão a MVP" por
jogador tem confiabilidade acima de zero**, enquanto a média tem 0,3–0,6. Um atributo por card medido assim seria sorteio
disfarçado de estatística (e a regra do projeto é não inventar número para jogador real). O que existe e é previsível é o
**nível** (OVR) e, um pouco, a **função**.

O atributo `consistency` atual (KAST + rating) tem correlação **0,76 com a média** do mapa e só **0,10 com o SD**: é um segundo
OVR, não mede regularidade. Rever o nome ou a definição (seção 6.7).

### 2.4 Quem é o MVP do mapa

| Métrica | Valor |
|---|---|
| Rating do top do mapa (n = 1.428 mapas) | média **1,54** (p10 1,30; p50 1,51; p90 1,84) |
| Top do mapa está no time derrotado | **15,2%** (2025–26 int.: 14,0%; por evento 10–19%) |
| Melhor do time derrotado > melhor do vencedor | 14,7% |
| Time vence quando alguém faz ≥ 1,3 / ≥ 1,4 / ≥ 1,5 / ≥ 1,7 | 84% / **88%** / 91,5% / 97% |
| Time derrotado tem alguém ≥ 1,3 / ≥ 1,5 | 20% / 2,4% |
| MVP do time é o melhor do elenco pela média / o 2º / o pior | **39% / 26% / 7%** |
| corr(média do time no mapa, saldo de rounds) / corr(melhor do time, saldo) | 0,94 / 0,75 |
| Top do mapa do time derrotado tem rating médio | 1,19 (vencedor: 1,53) |

Chance de ser o top dos 10 por faixa de média no evento: ≤ 0,8 → 0,6%; 0,8–0,9 → 3%; 0,9–1,0 → 7%; 1,0–1,1 → 12%; 1,1–1,2 →
17%; 1,2–1,3 → 29%; > 1,3 → 38%. (MVP do próprio time: 5% → 50% na mesma escala.)

Leitura para o modelo: "quem explode" é sorteado **com peso pelo nível**, não uniformemente; e a explosão quase sempre coincide
com a vitória, porque rating é consequência de rounds ganhos. Um motor em que as kills saem do resultado do round (como o
atual) reproduz isso de graça, desde que a forma individual pese também na força do time.

### 2.5 Mão quente e fase

Resíduo medido contra a média do jogador nos **outros** eventos (sem viés de média compartilhada): [dado]

| Teste | Valor | n |
|---|---|---|
| Autocorrelação lag 1 dentro da mesma série | **0,067** | 6.409 pares |
| Lag 1 entre séries do mesmo evento | 0,020 | 2.491 |
| Lag 2 | 0,053 | 7.986 |
| Próximo mapa depois de um mapa ≥ +0,3 / ≥ +0,5 | +0,025 / +0,042 | 1.586 / 611 |
| Próximo mapa depois de um mapa ≤ −0,3 | −0,023 | 1.442 |
| P(próximo ≥ +0,3) depois de quente / base / depois de frio | 18,8% / 16,9% / 15,3% | |
| "Fase do torneio": SD verdadeiro da média por evento, descontado o ruído de amostra (≥ 3 eventos de ≥ 6 mapas) | **0,041** (só no mesmo ano: 0,041) | 147 jogadores |
| Resíduo em playoffs × grupos (mesmo jogador) | −0,002 × +0,010 | 7.982 / 1.832 |

Lag 1 ≈ lag 2 sugere um componente persistente no evento ("fase"), não uma sequência de mapa para mapa. A fase vale ±0,04 de
rating (≈ ±2,5 OVR), 8× menor que a oscilação de um mapa. Não há "jogador de decisão": o resíduo em playoff é zero em média.

Literatura, na mesma direção: Rejthar e Kavřík (2025) testaram mão quente em KovaaK's (nenhuma) e em partidas profissionais
de CS:GO (evidência mista) e concluem que ponderar desempenho recente "tem pouco ou nenhum efeito" na previsão
([SN Computer Science](https://link.springer.com/article/10.1007/s42979-025-03817-5)) [estudo]; um estudo com 597.680
partidas de LoL testa o efeito com big data ([ACM 2024](https://dl.acm.org/doi/fullHtml/10.1145/3665463.3678787)) [estudo]; no
basquete, jogadores exibem mão quente em graus variados mas o jogador médio **regride** depois de uma sequência
([PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5809017/)) [estudo].

### 2.6 Multikills e aces

3.990 jogador-mapas com a aba de performance (internacionais 2025–26). A conta fecha: kills = 1·n1 + 2·2K + 3·3K + 4·4K + 5·5K
em 100% das linhas. [dado]

| Kills no round | 0 | 1 | 2 | 3 | 4 | 5 (ace) |
|---|---|---|---|---|---|---|
| Real (por jogador-round) | 53,8% | 29,4% | 12,1% | **3,80%** | **0,80%** | **0,083%** |
| Poisson com KPR 0,686 | 50,3% | 34,6% | 11,9% | 2,71% | 0,47% | 0,07% |
| Réplica do motor atual, 5 iguais (`aim` 75) | — | — | 11,2% | 3,0% | 0,53% | 0,04% |
| Réplica, estrela 97 entre quatro 72 | — | — | 13,7% | 5,4% (3K+) | 0,97% (4K+) | 0,11% |

- Por mapa (10 jogadores): 8,1 rounds com 3K, 1,7 com 4K, **0,175 aces**; 16% dos mapas têm ace; um ace a cada 121 rounds.
  Por evento: 0,12 (Toronto) a 0,24 (Bangkok) aces por mapa. O "3–4% dos rounds" que circula em guias
  ([ExpertBeacon](https://expertbeacon.com/how-many-kills-is-an-ace-in-val/)) é ranked, sem método: no profissional é **0,8%
  dos rounds** (somando os 10 jogadores).
- Kills totais por round: **6,86** real; a réplica do motor dá ≈ 6,1–6,3 (`WINNER_KILL_WEIGHTS` média 4,45 + `LOSER` 1,85,
  menos cortes quando um lado zera).
- Dependência do KPR (101 jogadores com ≥ 300 rounds): `ln(3K+ por round) = −5,76 + 3,84 × KPR` (corr. 0,91);
  `ln(4K+ por round) = −11,08 + 8,75 × KPR` (corr. 0,75).

| KPR do jogador | n | 3K+ | 4K+ | Ace |
|---|---|---|---|---|
| ≤ 0,60 (média 0,55) | 12 | 2,5% | 0,33% | 0,02% |
| 0,60–0,70 | 44 | 4,0% | 0,69% | 0,05% |
| 0,70–0,80 | 33 | 5,7% | 1,08% | 0,11% |
| > 0,80 (média 0,84) | 12 | 6,9% | 1,66% | **0,24%** |
| Duelistas / sentinelas / controladores / iniciadores | 29/15/28/29 | 6,0 / 5,0 / 4,2 / 3,8% | 1,2 / 1,0 / 0,8 / 0,6% | 0,17 / 0,08 / 0,03 / 0,07% |

- Time vence o mapa em 65% quando um jogador seu faz ace (n = 68) e em 59% com 4K+ (n = 682): o ace é "momento", não
  garantia. Rating médio do mapa com ace: 1,35.
- tkzin no Champions 2026 (18 mapas): Lotus 1,65 (28 kills, 2 aces), Summit 1,34 (1 ace), depois 0,57, 1,00, 0,68… e 1,99 na
  Sunset da fase final; 4 aces no evento inteiro contra 0 nos 19 mapas do Stage 2 (média 0,87). Três aces numa série foi
  recorde do Champions ([The Spike](https://www.thespike.gg/valorant/news/loud-tkzin-makes-valorant-champions-history-with-record-setting-debut/8927),
  [Strafe](https://www.strafe.com/news/read/loud-tkzin-sets-new-valorant-champions-record/)) [anedota]. lukxo: 1,34 e 64
  kills na final superior contra a Vitality ([Dot Esports](https://dotesports.com/valorant/news/vct-champions-2026-vit-vs-loud)),
  média 1,22 no evento, 1,89 no melhor mapa [anedota + dado].

Réplica com **cadeia dentro do round** (o último a matar tem peso × (1 + c × kills já feitas no round) na próxima kill) e
quotas de kills um pouco maiores (`[0,0,0,0,10,0,20,0,70]` e `[0,10,0,22,0,30,0,25,0,13]`, 6,4 kills/round):

| c | Iguais: 3K / 4K / ace | Estrela 97: 3K+ / 4K+ / ace | Colega 72: 4K+ / ace |
|---|---|---|---|
| 0 | 3,3% / 0,59% / 0,05% | 6,4% / 1,2% / 0,11% | 0,6% / 0,03% |
| **≈ 0,25** (interpolado) | 3,6% / **0,8%** / **0,1%** | 7,2% / **1,7%** / **0,25%** | 0,8% / 0,09% |
| 0,5 | 3,8% / 1,1% / 0,22% | 8,1% / 2,4% / 0,48% | 1,1% / 0,18% |
| 1,0 | 4,0% / 1,5% / 0,46% | 9,1% / 3,5% / 0,87% | 1,7% / 0,37% |

`c ≈ 0,25` reproduz os três alvos (média, estrela e coadjuvante) ao mesmo tempo. Acima de 0,5 os aces dobram o real.

---

## 3. Nível do time: forma por mapa, embalo e zebra

### 3.1 Oscilação de mapa para mapa do mesmo elenco

Para cada evento, ajustamos uma força por time por mínimos quadrados (ridge) sobre o saldo de rounds dos 1.542 mapas e olhamos
o resíduo. Como o ajuste "come" parte da variância, simulamos mapas sintéticos com as forças ajustadas e o mesmo ajuste. [dado]

| | SD do resíduo (rounds) |
|---|---|
| Real | **4,80** |
| Simulado, só ruído binomial (p fixo por mapa) | 3,95 |
| Simulado com forma por mapa σ_p = 0,04 / 0,06 / **0,08** / 0,10 (diferença entre os dois times, em prob. de round) | 4,19 / 4,36 / **4,62** / 4,96 |
| Motor hoje: `FORM_SWING = 10` por time → diferença σ = 7,1 pontos → /30 × 0,25 | σ_p ≈ **0,059** |

A forma real por mapa está entre 0,08 e 0,09, **mas inclui força específica de mapa** (quem escolhe o mapa vence 53,5%, n =
1.303; `mapAffinity` da IA cobre parte) e a soma das formas individuais. Logo ±12 do time está certo em ordem de grandeza; o
que falta é a parte **individual**, visível no placar. Se a forma individual entrar na força (6.2), `FORM_SWING` deve cair ou
ficar, nunca subir (seção 6.6).

### 3.2 Embalo na série

| | Observado | Esperado só pela força (leave-one-series-out) | n |
|---|---|---|---|
| Vencedor do mapa 1 vence o mapa 2 | 54,4% | 53,4% | 551 |
| … se venceu o mapa 1 por 1–3 / 4–6 / 7+ rounds | 53,8% / 49,4% / 60,9% | | 199 / 176 / 179 |
| No 1–1, vencedor do mapa 2 vence o 3º | 53,0% | ≈ 50% | 251 |

Embalo de série ≈ **+1 pp**: desprezível. Coerente com a pesquisa anterior (full × full repete o vencedor em 49,9%). A maior
margem do mapa 1 prevê o mapa 2 porque mede força, não embalo.

### 3.3 Zebras por diferença de força (com a força do jogo)

Mapas casados com a força v2 dos elencos do jogo (mesmo evento: 1.476 mapas). Atenção: a força sai das stats **do próprio
evento**, então a curva é "se os cards fossem a verdade" (otimista). A curva fora da amostra usa a força do **evento anterior**
do mesmo time (1.353 mapas; elencos mudam, pessimista). [dado]

| Diferença de força | n (mesmo evento) | Favorito vence | n (evento anterior) | Favorito vence |
|---|---|---|---|---|
| 0–2 | 404 | 55% | 369 | 49% |
| 2–4 | 391 | 65% | 327 | 59% |
| 4–6 | 319 | 71% | 266 | 50% |
| 6–8 | 193 | 79% | 141 | 53% |
| 8–10 | 101 | 77% | 101 | 57% |
| 10–15 | 61 | 85% | 135 | 54% |
| Escala logística (pontos por unidade) | | **6,0** (+10 → 84%) | | 43 (+10 → 56%) |
| Motor hoje | | ≈ 9,6 (+10 → 74%) | | |

O motor fica entre as duas curvas, mais perto da otimista, o que é o lugar certo para um jogo em que o usuário monta o time
pelos cards. **Não há razão nos dados para deixar o favorito mais fraco**; a sensação de "consistente demais" vem do
**placar individual**, não do resultado dos mapas.

---

## 4. Como outros simuladores e a literatura tratam forma

| Fonte | O que faz | Serve para |
|---|---|---|
| Football Manager (atributos ocultos *Consistency* e *Important Matches*) [comunidade] | Consistência = com que frequência o jogador rende perto do máximo; funciona jogo a jogo, influenciada por forma, moral e disciplina; um "dia ruim" costuma ser citado como ~10 pontos de CA abaixo, "com fator aleatório" (sem confirmação oficial). *Important Matches* governa derbies e finais ([VideoGamer](https://www.videogamer.com/features/exposing-the-hidden-attributes-of-football-manager-2024/), [FM Dossier](https://fmdossier.dev/guides/player-attributes-explained), [fm-arena](https://fm-arena.com/thread/8940-improving-hidden-attributes/)) | A ideia de "dia bom/dia ruim" por jogador. Mas nossos dados dizem que *Important Matches* e consistência por jogador não são mensuráveis no Valorant: usar só o sorteio, com teto por nível |
| EA FC 27 *Dynamic OVR* [comunidade] | OVR exibido sobe e desce com Forma, Moral e Condição; jovens "picam" mais, veteranos são mais estáveis ([Dexerto](https://www.dexerto.com/wikis/ea-fc-27/dynamic-overall-explained/), [mein-mmo](https://mein-mmo.de/en/ea-fc-27-2-new-features-promise-the-best-career-mode-in-recent-years,1580709/)) | Mostrar a "fase" como variação do OVR na tela, não como atributo escondido. Idade não testada nos nossos dados |
| Modelo de dois estados de Albert (beisebol) [estudo] | Rebatedor alterna entre estado "quente" e "frio" por cadeia de Markov; o simulador compara com probabilidade constante ([Albert](https://www.stat.berkeley.edu/~aldous/157/Papers/albert_streaky.pdf), [Chance](https://chance.amstat.org/?p=8787)) | Estrutura para a "fase do torneio" (estado persistente) separada do sorteio por mapa |
| Glicko-2 [estudo/doc] | Além do rating, *rating deviation* (incerteza) e *volatility* (quão erráticos são os resultados), que acelera ajustes depois de surpresas ([MetricGate](https://metricgate.com/docs/glicko-2-rating/), [HackerNoon](https://hackernoon.com/the-math-behind-odds-how-rating-systems-turn-team-strength-into-pre-match-probabilities)) | A "volatilidade" é incerteza do rating, não forma do jogador; o encolhimento por amostra que já existe nos cards cumpre esse papel |
| HLTV, *A look at inconsistency* (2022) [comunidade/dado] | Mede inconsistência por SD do rating por mapa e % de mapas acima de 1,00 ([HLTV](https://www.hltv.org/news/34617/a-look-at-inconsistency)); Rating 2.0 é definido em desvios padrão da média ([HLTV](https://www.hltv.org/news/20695/introducing-rating-20)) | Mesmo método desta pesquisa; o artigo não testa estabilidade do SD |
| *Measuring Consistency in VALORANT for VCT 2024* [comunidade] | SD do rating por mapa ao lado da média; "alta média + alta consistência é a combinação mais forte" ([Medium](https://medium.com/@_SushantJha/measuring-consistency-in-valorant-ee2a9c773486)) | Idem; sem teste de estabilidade |
| *The numbers behind the best: 2025 MVPs* [comunidade] | MVPs regionais de 2025 têm ratings parecidos (1,04–1,07); o que os separa é KAST e clutch, "consistência, não outliers" ([The Spike](https://www.thespike.gg/valorant/news/the-numbers-behind-the-best-analyzing-valorant-s-2025-mvp-performances/7435)) | Confirma: MVP = nível alto sustentado, não explosão |
| Preditor do Champions 2026 (arjfc) [comunidade] | Elo de time + média de rating dos 5 que jogaram, com encolhimento para quem tem poucas séries; mistura 50/50 porque a feature de jogador "não é estatisticamente provada" ([GitHub](https://github.com/arjfc/vct-champions-2026-predictor)) | Encolhimento por amostra (já temos) e força de time além dos jogadores (bônus de colocação, já temos) |
| Mão quente em esports [estudo] | Ver 2.5: efeito pequeno/misto; ponderar passado recente ajuda pouco | Embalo de série ≈ 0; fase pequena |
| OOTP [comunidade] | Sem documentação oficial encontrada; relatos de sequências curtas ([Operation Sports](https://forums.operationsports.com/fofc/archive/index.php/t-64554.html)) | — |

---

## 5. O que mais melhora a previsão (além da forma)

1. **Escala de força está boa** (3.3). Mexer no `ROUND_SCALE` ou no `FORM_SWING` não resolve o pedido; piora a calibração.
2. **Kills por round**: o motor produz ≈ 6,2 kills por round contra 6,86 reais; subir as quotas (seção 2.6) deixa o placar
   mais parecido com o VLR (K/D mais altos para todos) antes de qualquer forma.
3. **`consistency` é um segundo OVR** (corr. 0,76 com a média, 0,10 com o SD). Ou renomear para o que mede ("Presença",
   KAST) ou retirar da dimensão Clutch. Não dá para medir regularidade por jogador com os dados públicos (2.3).
4. **Força por mapa**: quem escolhe o mapa vence 53,5%; a IA já tem `mapAffinity` ±2. O usuário não tem nada equivalente;
   um "conforto de mapa" por card (agentes jogados por mapa existem na página de agentes do evento) seria dado real, não
   sorteio. Fora do escopo desta pesquisa, mas é a única fonte de variância **explicável** que falta no nível do time.
5. **Fase do torneio pequena** (±2,5 OVR) dá histórias ("lukxo em alta") sem quebrar a previsão, porque a soma de 5 fases
   independentes vale ≈ ±1,1 ponto de força.
6. O que **não** melhora: ponderar partidas recentes (literatura e 2.5), "jogador de final" (2.5), embalo de série (3.2).

---

## 6. Proposta (parte 1): forma e explosão

Princípios: (a) tudo sai do `Rng` com seed; (b) nenhum atributo novo medido por jogador: o teto deriva do OVR e da função;
(c) a forma individual é **visível** no placar e na UI, e **pequena** na força do time; (d) metas numéricas em `balance.test`.

### 6.1 Forma do dia por jogador (por mapa)

Para cada jogador e mapa, sorteio `z_i` com média 0, desvio 1 e cauda direita leve (ex.: `z = u + 0,15·(u² − 1)/2` com
`u` = soma de 3 uniformes normalizada, ou um `u` normal truncado em ±3; a assimetria alvo é +0,2). Multiplicador de forma:

```
sigma_i = 0,25 × (1 + 0,006 × (ovr_i − 80)) × roleFactor      // roleFactor: duelista 1,06, sentinela 1,01, controlador 0,98, iniciador 0,95
f_i     = exp(sigma_i × z_i)   limitado a [0,55; 1,9]           // ×0,78 a ×1,28 em ±1σ para um card de OVR 80
```

Onde age:
- `killWeight × f_i` (kills), `deathWeight / sqrt(f_i)` (mortes), `assist weight × sqrt(f_i)`.
- Cadeia de multikill (6.3) escala com `f_i`.
- **Força do time no mapa**: `+ K × Σ_i (f_i − 1) × share_i`, com `share_i = (ovr_i × fit_i) / Σ(ovr × fit)` e `K ≈ 9`.
  Um jogador em z = +2 (2,3% dos sorteios) soma ≈ +3,7 pontos ao time (≈ +9 pp de mapa, não decide sozinho); os cinco juntos
  dão σ ≈ 4 pontos. Com `FORM_SWING` reduzido de 10 para 8 (σ do time 4 → total ≈ 5,7 por time, diferença ≈ 8 pontos,
  σ_p ≈ 0,067), a variância total de mapa fica entre o motor atual e o real (0,08–0,09), sem passar dele.
- Os ratings por mapa que o placar mostra devem então ter **resíduo individual ≈ 0,25** (alvo), com os 33% de componente de
  time vindo do próprio resultado do mapa.

Por que o teto sobe com o nível sem um atributo: `f_i` multiplica um peso que já é maior para a estrela e o `sigma_i` cresce
6% a cada 10 OVR (medido: SD 0,29 → 0,33 do Q1 ao Q4). A estrela de OVR 92 com z = +1,3 ("inspirada") fica com ×1,42 nas
kills; o card de 72 com o mesmo z, ×1,35. Como as kills são partilhadas entre os 5, a estrela inspirada tira kills dos colegas:
é o "um jogador carrega" que o pedido descreve.

### 6.2 Fase do torneio (por run)

No início do Champions (e, opcionalmente, por fase: grupos / playoffs), sorteio por jogador `t_i ~ N(0, 2,5)` em pontos de
OVR, truncado em ±6, aplicado como deslocamento dos atributos `aim`, `entry` e `utility` daquele torneio (mesma proporção) e,
em consequência, do OVR efetivo e da força. Medido: SD verdadeiro da média por evento = 0,041 de rating ≈ 2,5 OVR. Mostrar na
tela "Seu time": **"Em alta neste Champions (+4)"** / **"Em baixa (−3)"** só quando |t| ≥ 2. Efeito na força do time:
σ ≈ 1,1 ponto; nunca domina.

### 6.3 Explosão dentro do round (multikills e aces)

No `simulateKills`:
1. Quotas de kills: `WINNER_KILL_WEIGHTS = [0,0,0,0,10,0,20,0,70]`, `LOSER_KILL_WEIGHTS = [0,10,0,22,0,30,0,25,0,13]`
   (alvo: 6,8–6,9 kills por round somando os dois times).
2. Cadeia: ao escolher o próximo matador do mesmo lado, o jogador que fez a **última** kill do round tem o peso
   multiplicado por `1 + CHAIN × killsNoRound × f_i`, com `CHAIN = 0,25` (réplica: 4K 0,8%, ace 0,10% para iguais; estrela
   4K+ 1,7%, ace 0,25%).
3. Eventos para a UI: `3K`, `4K`, `ACE` por round e por jogador no `RoundResult` (hoje só há a lista de kills; a contagem já
   dá para derivar em `buildLines`).

### 6.4 Embalo dentro da série (opcional, pequeno)

Forma do mapa n+1: `z_{n+1} = ρ × z_n + sqrt(1 − ρ²) × novo`, com **ρ = 0,10** para jogadores (medido 0,067) e **ρ = 0** para
o time (3.2). Serve só para o selo "🔥" persistir de vez em quando; se complicar o código, deixar de fora.

### 6.5 UI (pt-BR)

- Placar do mapa: **"🔥 Inspirado"** ao lado do nome quando `z_i ≥ 1,3` (≈ 10% dos jogador-mapas; para a estrela, a maioria
  desses mapas sai ≥ 1,5) e **"❄️ Apagado"** quando `z_i ≤ −1,5` (≈ 7%). Coluna **"3K/4K/ACE"** no placar estilo VLR.
- **"MVP do mapa"** (estrela) para o maior rating dos 10; **"MVP da série"** para o maior rating acumulado da série. Esperado:
  MVP do mapa do time derrotado em ≈ 15% dos mapas; o MVP do time é o melhor card do elenco em ≈ 39% e o pior em ≈ 7%.
- Feed de round: **"ACE de tkzin!"**, "4K", "clutch 1v2".
- Card (sem atributo novo): linha **"Teto: um mapa ≥ 1,5 a cada {1/p} mapas"**, com `p` da tabela 2.2 pelo OVR (Q1 2,5% …
  Q4 11%), e, como fato real já no snapshot, **"Melhor mapa no evento: {kmax} kills"**. Tooltip: "A explosão não é um
  atributo: nos dados, o quanto um jogador oscila não se repete de evento para evento; o que muda é o teto, que cresce com o
  nível."
- Tela "Seu time": "Fase neste Champions" por jogador (6.2), só quando relevante.
- Texto de ajuda em "Como funciona": "Forma do dia: cada jogador sorteia uma forma por mapa (±25% nas kills, com dias
  excepcionais raros). Estrelas têm teto maior, não sorte maior."

### 6.6 Metas de calibração (novo bloco em `src/game/balance.test.ts`, times iguais, muitos mapas com seed)

| Métrica (placar que o motor imprime) | Alvo | Tolerância | Fonte |
|---|---|---|---|
| Kills por round (10 jogadores) | 6,86 | ±0,2 | 2.6 |
| SD do KPR de um jogador entre mapas, descontada a média do time no mapa | 0,18 | ±0,03 | 2.1 |
| SD do KPR total (em torno da média do jogador) | 0,20 | ±0,03 | 2.1 |
| Assimetria do resíduo individual | +0,1 a +0,3 | | 2.1 |
| Jogador-mapas com KPR ≥ média + 0,25 (≈ rating ≥ 1,5 para o médio) | 7–8% | ±2 pp | 2.1 |
| MVP do time = melhor card do elenco / pior card | 39% / 7% | ±5 / ±3 pp | 2.4 |
| MVP do mapa no time derrotado | 15% | ±4 pp | 2.4 |
| Time vence quando alguém faz KPR ≥ 1,0 no mapa (≈ rating 1,4) | 85–90% | | 2.4 |
| P(3K) / P(4K) / P(ace) por jogador-round, jogadores iguais | 3,8% / 0,8% / 0,08% | ±0,5 / ±0,2 / ±0,04 pp | 2.6 |
| Idem para card de OVR ≥ 90 num time mediano | 6,5% / 1,6% / 0,22% | ±1 / ±0,4 / ±0,1 pp | 2.6 |
| Aces por mapa / mapas com ace | 0,175 / 16% | ±0,05 / ±4 pp | 2.6 |
| Autocorrelação da forma individual entre mapas da série | 0,05–0,10 | | 2.5 |
| Vencedor do mapa 1 vence o mapa 2 (times iguais) | 50–52% | | 3.2 |
| +10 de força vence o mapa (meta existente) | 72–76% | | 3.3 e design |
| SD da forma total do time por mapa (σ_p da diferença) | 0,065–0,085 | | 3.1 |
| Mapa com um "🔥 Inspirado" em cada time | ≈ 65% (1 − 0,9^5 por time) | | 6.5 |

Tudo o que já está em `balance.test` (playoffs do mediano, título do top 10%) precisa rodar de novo: a forma individual
aumenta um pouco a variância do mapa, por isso `FORM_SWING` cai de 10 para 8 ao mesmo tempo.

### 6.7 O que muda nos cards e nos tipos

- **Nenhum atributo novo medido.** `Attributes` fica igual; `sigma_i` e o "teto" são funções de `ovr` e `role`.
- `consistency`: renomear para o que é (sugestão: **`presence`**, "Presença", KAST + rating) e tirar o peso de 0,2 na dimensão
  Clutch, ou mantê-lo com o nome certo. Se um dia houver dado por mapa no pipeline, **não** derivar volatilidade dele (2.3).
- `MapResult.players[i]` ganha `form` (z do mapa), `multikills: {k3, k4, k5}` e `mvp: boolean`; `SeriesResult` ganha
  `mvpCardId`. `RoundResult` ganha os eventos de multikill (ou deriva na UI).
- `MapOptions` ganha `prevForm?: number[][]` para o embalo (6.4), passado por `simulateSeries`, e `tournamentForm` por lineup
  (6.2) vem do `RunState` (sorteado uma vez com a seed da run; sobe `RUN_VERSION`).
- `FORM_SWING` 10 → 8; `CHAIN = 0,25`; `FORM_SIGMA = 0,25`; `FORM_TEAM_K = 9`; `TOURNAMENT_FORM_SD = 2,5`.

### 6.8 O que NÃO fazer

- **Sorteio uniforme de quem explode** (ex.: "1 jogador aleatório por mapa fica inspirado"): nos dados, o top do mapa é o
  melhor do elenco 39% das vezes e o pior 7%. A forma tem que multiplicar pesos que já dependem do nível.
- **Atributo de volatilidade/explosão por card** medido de SD, `kmax`, playoff ou MVP: confiabilidade ≈ 0 (2.3). Seria
  número inventado com cara de estatística.
- **Forma dominando a força**: a soma das formas individuais deve ficar em σ ≈ 4 pontos de força (K ≈ 9) e a forma total do
  time em σ_p ≤ 0,085; acima disso o jogo vira cara ou coroa e a curva de +10 cai abaixo de 72%.
- **Embalo de série para o time** (0 medido) e **"jogador de final"** (0 medido).
- **Cadeia de multikill forte** (`CHAIN ≥ 0,5`): dobra os aces reais e faz 4K virar rotina.
- **Mostrar a forma antes do mapa** como se fosse previsão: ela é sorteio; a UI mostra "Inspirado" no placar e no feed,
  nunca na tela de escalação.

### 6.9 Ordem sugerida

1. Quotas de kills + cadeia (6.3) e colunas 3K/4K/ACE no placar: mais barato, mexe pouco no balanceamento.
2. Forma do dia por jogador (6.1) com `FORM_SWING` 8 e o bloco novo de metas (6.6); selos "Inspirado" e "MVP".
3. Fase do torneio (6.2) e texto na tela "Seu time"; `RUN_VERSION`.
4. Embalo de série ρ = 0,1 (6.4) e renomear `consistency` (6.7): opcionais.

---

## 7. Tabela de parâmetros candidatos

| Parâmetro | Valor | Faixa / n | Fonte | Confiança |
|---|---|---|---|---|
| SD do rating de um mapa em torno da média do jogador no evento | 0,302 | 0,29–0,31 por evento; n = 9.319 | dados próprios (VLR por mapa) | Alta |
| Componente individual (em torno da média do time no mapa) | 0,248 (KPR 0,180) | assimetria +0,17 | idem | Alta |
| Componente de time (comum aos 5) | 0,174; corr. 0,89 com o saldo | | idem | Alta |
| Assimetria / curtose do resíduo | +0,25 / +0,36 | | idem | Alta |
| Mapas ≥ +0,3 / ≥ +0,5 sobre a média | 15,6% / 5,2% | | idem | Alta |
| SD por função (duelista … iniciador) | 0,333 … 0,289 | 117–222 pares | idem | Alta (direção), média (tamanho) |
| SD por nível | 0,17 + 0,14 × média | n = 233 jogadores | idem | Média |
| Teto e piso | p90 = 0,21 + 1,18·média; p10 = −0,20 + 0,82·média | corr. 0,82 / 0,73 | idem | Alta |
| Mapas ≥ 1,5 por quartil de nível | 2,5 / 5,6 / 7,2 / 11,0% | 2.362–4.151 mapas | idem | Alta |
| Estabilidade do SD entre eventos | −0,005 | n = 522 | idem | Alta (é zero) |
| Estabilidade do "pico de kills" | −0,015 | n = 1.905 | snapshot | Alta (é zero) |
| MVP do time = melhor / 2º / pior do elenco | 39% / 26% / 7% | 2.856 time-mapas | dados próprios | Alta |
| Top do mapa no time derrotado | 15,2% | n = 1.428 (14,0% em 2025–26) | idem | Alta |
| Vitória do time com alguém ≥ 1,4 / ≥ 1,5 | 88% / 91,5% | 1.550 / 958 | idem | Alta |
| Autocorrelação lag 1 na série (jogador) | 0,067 | n = 6.409 | idem | Alta (é pequeno) |
| Fase do torneio (SD da média por evento, sem ruído) | 0,041 rating ≈ 2,5 OVR | n = 147 jogadores | idem | Média |
| OVR → média do mapa | −0,285 + 0,0162 × OVR | corr. 0,79; n = 772 | cards + dados próprios | Alta |
| P(3K) / P(4K) / P(ace) por jogador-round | 3,80 / 0,80 / 0,083% | 3.990 jogador-mapas | aba performance 2025–26 | Alta |
| ln(3K+) e ln(4K+) em função do KPR | −5,76 + 3,84·KPR; −11,08 + 8,75·KPR | 101 jogadores ≥ 300 rounds | idem | Média-alta |
| Aces por mapa / mapas com ace | 0,175 / 16% | 0,12–0,24 por evento | idem | Alta |
| Kills por round (10 jogadores) | 6,86 | | idem | Alta |
| `CHAIN` da réplica | 0,25 | 0,2–0,3 | réplica em Python do `simulateKills` | Média (confirmar no motor) |
| Forma total do time por mapa (σ_p da diferença) | 0,08–0,09 (inclui mapa) | 1.542 mapas | dados próprios + simulação | Média |
| Motor hoje: σ_p | 0,059 | `FORM_SWING = 10` | código | Alta |
| Embalo de série (observado − esperado) | +1 pp | n = 551 | dados próprios | Alta (é ≈ 0) |
| Quem escolhe o mapa vence | 53,5% | n = 1.303 | dados próprios | Alta |
| Escala logística de zebra: mesma amostra / evento anterior / motor | 6,0 / 43 / 9,6 pontos | 1.476 / 1.353 mapas | dados próprios + força v2 | Média |
| `FORM_SIGMA`, `FORM_TEAM_K`, `TOURNAMENT_FORM_SD` | 0,25 / 9 / 2,5 | | **decisão de design** calibrada nas metas de 6.6 | Design |

---

## 8. Riscos

- **Rating é saída, forma é entrada.** As metas de 6.6 estão em KPR e em frequências do placar para não depender de um
  "Rating 2.0" que o motor não calcula; se a UI quiser mostrar "R", a aproximação `0,13 + 1,27 × KPR` (corr. 0,88 por mapa)
  serve como rótulo, com aviso de que é estimativa.
- **Balanceamento:** a forma individual entra na força (K ≈ 9) e troca de lugar com parte do `FORM_SWING`. Se os testes de
  `balance.test` mostrarem o mediano abaixo de 70% de playoffs, baixar K antes de mexer na escala.
- **Determinismo e seeds:** cinco sorteios a mais por mapa (e um por jogador por run) mudam todas as seeds; snapshots de teste
  precisam ser regerados. `RUN_VERSION` sobe pela fase do torneio no `RunState`.
- **Percepção:** "Inspirado" em ≈ 10% dos jogador-mapas significa que **em 65% dos mapas** algum jogador de cada time tem o
  selo. Se parecer banal, subir o corte para z ≥ 1,65 (5%) e manter o "MVP" como selo principal.
- **Amostra de multikills:** só 2025–26 (3.990 jogador-mapas, 12 jogadores com KPR > 0,8). A inclinação do 4K com o KPR tem
  erro padrão alto; o motor deve ser calibrado nos três pontos (média, estrela, coadjuvante), não na fórmula.
- **Viés de topo:** times fracos (fora do recorte) podem oscilar mais; não medimos.
- **Anedotas:** tkzin e lukxo são os casos que motivaram o pedido; os dados mostram que o padrão deles (um evento muito acima
  da própria média, com aces concentrados) é exatamente a cauda que o modelo sorteia com peso pelo nível, e não um traço que
  um card poderia carregar.

---


## 9. Afinidade jogador × agente × mapa e meta por mapa

### 9.1 O jogador rende diferente em cada agente ou mapa?

Resíduo = rating do mapa − média do jogador no evento (jogadores com ≥ 8 mapas; inclui as 464 escalações regionais de 2023–26
e todos os internacionais do conjunto). Para cada célula (jogador, evento, agente) ou (jogador, evento, mapa) comparamos a
variância das médias com a que o ruído de amostra sozinho produziria (0,302² / n). [dado]

| Célula | Mín. mapas | Células | Variância observada | Só ruído | SD verdadeiro | Estabilidade (mesmo jogador, eventos consecutivos) |
|---|---|---|---|---|---|---|
| Jogador × evento × **agente** | 4 | 1.006 | 0,0098 | 0,0163 | **0** | 0,050 (n = 415); 0,058 com ≥ 6 mapas (n = 179) |
| Jogador × evento × **mapa** | 3 | 1.340 | 0,0234 | 0,0279 | **0** | 0,080 (n = 423) |
| Jogador × agente (todos os eventos) | 8 | 501 | 0,0039 | 0,0066 | **0** | — |
| Jogador × mapa (todos os eventos) | 6 | 798 | 0,0100 | 0,0108 | **0** | — |

- Entre os 268 jogador-eventos com dois agentes de ≥ 4 mapas, a diferença média entre o melhor e o pior agente é 0,163, **menor**
  que os 0,216 que o acaso produziria com essas amostras.
- No nível do time, o resíduo de rounds por mapa (descontada a média do time no evento) tem estabilidade 0,092 de um evento
  para o seguinte no mesmo mapa (n = 407): "time X é forte em Y" existe pouco e se renova a cada evento (patch, pool).
- Quem **escolhe** o mapa vence 53,5% (n = 1.303; 55,0% em 2025–26, n = 811). Na escala do motor (+10 ≈ 74%), isso vale
  ≈ **+1,3 pontos de força**: é o tamanho real de "jogar o seu mapa".

Conclusão: "X é melhor de Jett do que de Raze" **não é previsível** com dados públicos, mesmo somando ligas regionais. Qualquer
`agentForm`/`mapForm` por card seria sorteio com nome de estatística, e um limite mínimo de amostra (N) não resolve, porque a
variância verdadeira é zero em todos os cortes. O que o VLR mostra de verdade é **repertório** (quais agentes o jogador jogou no
evento, com %) e **meta** (o que cada mapa pede).

### 9.2 Meta por mapa e ano (1.549 mapas, 15.490 slots de agente)

Participação nos slots (10 por mapa), top 6 por mapa. [dado]

| Mapa | 2025 (mapas) | 2026 (mapas) |
|---|---|---|
| Abyss | Sova 19, Astra 12, Omen 11, Jett 10, Cypher 10, Yoru 9 (25) | Sova 19, Waylay 15, Yoru 12, Astra 12, Omen 11, Harbor 8 (45) |
| Ascent | Omen 20, Sova 14, Yoru 10, KAY/O 9, Jett 9, Vyse 9 (37) | Sova 20, Omen 19, Phoenix 11, Cypher 10, Jett 9, Neon 8 (51) |
| Bind | Brimstone 16, Viper 16, Raze 13, Fade 10, Yoru 9, Tejo 6 (34) | Viper 19, Brimstone 17, Fade 11, Yoru 11, Waylay 10, Skye 9 (14) |
| Breeze | — | Sova 19, Viper 18, Jett 12, Neon 11, Harbor 8, Omen 7 (49) |
| Corrode | Omen 18, Viper 14, Fade 12, Yoru 8, Waylay 8, Vyse 8 (21) | Viper 14, Waylay 12, Omen 12, Fade 11, Yoru 8, Astra 7 (16) |
| Fracture | Brimstone 19, Breach 19, Tejo 18, Cypher 12, Neon 9, Raze 9 (18) | Brimstone 18, Cypher 14, Neon 13, Fade 10, Raze 9, Skye 6 (24) |
| Haven | Omen 18, Sova 15, Cypher 12, Yoru 11, Neon 8, Breach 6 (46) | Omen 17, Sova 16, Neon 15, Cypher 10, Phoenix 8, Chamber 6 (71) |
| Icebox | Viper 20, Killjoy 19, Jett 14, Sova 13, Gekko 7, Omen 6 (32) | — |
| Lotus | Omen 19, Fade 14, Viper 12, Raze 12, Vyse 8, Yoru 7 (70) | Omen 20, Fade 15, Raze 12, Vyse 10, Neon 9, Viper 9 (84) |
| Pearl | Astra 20, Yoru 18, Vyse 14, Fade 10, Tejo 9, Sova 8 (20) | Astra 20, Neon 13, Fade 11, Phoenix 9, Killjoy 7, Sova 7 (43) |
| Split | Viper 17, Omen 15, Yoru 12, Raze 12, Fade 11, Breach 9 (39) | Viper 18, Omen 17, Fade 12, Raze 11, Neon 10, Skye 8 (78) |
| Summit | — | Fade 15, Neon 14, Omen 10, Chamber 9, Cypher 7, Sage 7 (36) |
| Sunset | Omen 20, Cypher 16, Neon 14, Sova 14, Breach 7, Viper 6 (34) | Omen 20, Neon 17, Chamber 10, Fade 10, Sova 9, Cypher 9 (29) |

Diversidade de composições (times-mapa, comps distintas, comp mais comum, top-3): em 2026, Haven 142 / 37 / 12% / 30%, Lotus
168 / 34 / 15% / 39%, Split 156 / 33 / 14% / 37%, Pearl 86 / 32 / 9% / 26%, Bind 28 / 12 / 25% / 54%; em 2025, Fracture 36 /
12 / 31% / 64% e Pearl 40 / 15 / 32% / 62% eram os mais "resolvidos". O meta muda **por ano** (Waylay e Neon em 2026; Tejo e
Yoru em 2025): qualquer tabela de meta precisa ser por (mapa, ano), e a pesquisa anterior já contou 2.534 comps nas páginas de
agentes dos eventos, que dão o mesmo tipo de dado sem a página de partida.

### 9.3 Proposta: repertório, encaixe de meta e UI do veto

Tudo abaixo é **dado real + regra de design**, nunca um número sorteado por card.

- **Repertório (fato):** o card já guarda `agents` (do evento). Na escolha de comp, um card só pode jogar agentes do seu
  repertório **ou** da sua função; agente da função mas fora do repertório conta como `roleFit` 0,9 ("flex"), fora da função
  0,75 (já existe). Não há bônus por "agente favorito": o dado diz que não existe.
- **Meta do mapa (fato + regra):** `META[mapa][ano]` = participação de cada agente nos slots (tabela 9.2, gerada pelo pipeline a
  partir das páginas de agentes ou das partidas; ano = o do pool do veto, hoje 2026). **Encaixe de meta** da comp escolhida =
  soma das participações dos 5 agentes, normalizada pelo máximo possível (a comp "mais meta"). Bônus de força no mapa:
  `+1,5 × encaixe` para o time que escolhe a comp, **teto +1,5** (= a vantagem real de jogar o próprio mapa) e **nunca
  negativo** (o meta é o que o mapa pede; comps fora do meta vencem também: a comp mais comum de Haven 2026 é só 12%).
- **Conforto de mapa da IA** (`mapAffinity` ±2) fica como está: a estabilidade do resíduo por mapa é 0,09, não sustenta mais.
- **Veto:** mostrar por mapa "Meta 2026: Omen 20% · Fade 15% · Raze 12%…" e, para o seu elenco, "Encaixe de meta: 4/5 (+1,2)"
  antes de escolher/banir; e a chance real de quem escolhe (53,5%) como texto de ajuda. Na tela de comp: "Comp dentro do meta
  (+1,2)" / "Comp própria (+0,4)"; tooltip: "Nos dados, um jogador rende igual em qualquer agente ou mapa que joga; o que pesa é a
  comp certa para o mapa e a função certa para o card."
- **O que não fazer:** `agentForm`/`mapForm` por card; penalidade por "mapa ruim" do jogador; meta fixo entre anos.

---

## 10. GOATs e durões: aura

### 10.1 O que se mede e o que não se mede

596 jogador-eventos internacionais com ≥ 40% dos mapas do evento (≥ 5), 247 jogadores; 250 elencos internacionais do jogo
(187 com IGL conhecido). [dado]

| Pergunta | Resultado | n |
|---|---|---|
| "Jogador de decisão": resíduo em mapas de eliminação (lower, decider, finais) por quartil de nível | Q1 −0,007 · Q2 −0,012 · Q3 −0,005 · Q4 −0,005 (fora deles: +0,02 a +0,05) | 7.539 mapas |
| Resíduo em mapas de playoff por quartil | Q1 −0,009 … Q4 −0,004 | 7.747 |
| Resíduo no **mapa decisivo** (3º de MD3, 5º de MD5) por quartil | Q1 +0,014 · Q2 −0,007 · Q3 +0,013 · **Q4 +0,017** | 1.967 deciders |
| Consistência ao longo do ano (SD das médias por evento, ≥ 3 eventos) | 0,073 em média; corr. com o nível 0,01; **estabilidade entre anos 0,014** (n = 155) | 183 jogador-anos |
| Frequência de top-3 no rating do evento, 1ª × 2ª metade da carreira (≥ 4 eventos) | 0,33 (média do rating: 0,73) | 27 |
| Patamar (média do rating) de um evento para o seguinte | 0,33–0,36 (seções 2.3 e 2.5) | 974 |

Leitura: **ninguém "sobe" de forma mensurável em playoff ou decider** (o +0,017 do Q4 em deciders vale ≈ +1 OVR e é compatível
com acaso); **consistência anual não é traço**; o que se repete é o patamar. A "aura" que os dados sustentam é a soma de fatos
de carreira (títulos, finais, top-3 de rating, número de internacionais), e o OVR já carrega parte dela (bônus de campeão +3,
Champions +2).

Exemplos (rating no evento, posição entre os titulares do evento, colocação do time):

| Jogador | Eventos internacionais nos dados |
|---|---|
| **yay** | Berlin 21: 1,33 (1º, vice) · Reykjavík 22: 1,19 (2º, campeão) · Copenhagen 22: 1,16 (2º, 3º) · Champions 22: 1,30 (1º, vice). Único com top-3 em 100% (4/4), média 1,245 |
| **Sacy** | Champions 22: 1,13 (7º, campeão) · Madrid 24: 0,93 (17º, campeão) · Champions 24: 1,01 (9º, 4º). Dois títulos sem nunca ser top-3: o perfil "durão" |
| **aspas** | Champions 22: 0,99 (16º, campeão) · LOCK//IN: 1,11 (5º) · Champions 23: 1,15 (2º) · Champions 24: 1,14 (3º) · Champions 25: 1,33 (1º). Patamar que subiu e se manteve |
| **Chronicle** | 7 internacionais, 2 títulos, 6 finais, top-3 em 2 (2021); 1,07–1,13 em 2025–26, 0,94 no Champions 26 |
| **Saadhak** (IGL) | 1,05 (12º, campeão) · 0,85 · 0,94 · 1,01: o IGL campeão rende abaixo do rating (pesquisa anterior, −0,05) |
| **Demon1** | Tokyo 23: 1,11 (3º) · Champions 23: 1,26 (1º, campeão); depois 0,90–1,06 nas ligas |

### 10.2 Critérios de aura (transparentes, só fatos até o evento do card)

Calculados com os eventos internacionais **até e incluindo** o do card (carreira até ali), sobre os 596 cards internacionais:

| Tier | Critério | Cards | Rating no evento | Top-3 no evento | Evento seguinte: rating / top-3 / título |
|---|---|---|---|---|---|
| **GOAT** | ≥ 2 títulos internacionais **e** ≥ 2 vezes top-3 de rating | 20 | 1,121 | 45% | **1,107 / 44% / 6%** (n = 16) |
| **Legend** | (1 título e ≥ 2 top-3) ou ≥ 2 títulos ou ≥ 3 top-3 | 24 | 1,068 | 38% | 1,023 / 20% / 13% (n = 15) |
| **Star** | ≥ 1 top-3, ou média ≥ 1,10 em ≥ 2 internacionais, ou título com top-8 | 155 | 1,096 | 25% | 1,071 / 16% / 9% (n = 103) |
| **Rising** | primeiro evento internacional | 218 | 0,989 | 0% | 0,999 / 8% / 16% (n = 105) |
| Regular | o resto | 179 | 0,971 | 0% | 0,992 / 3% / 17% (n = 110) |

Cards GOAT/Legend pelos critérios: yay (Reykjavík, Copenhagen e Champions 2022), Chronicle (2021–2026), Derke (2023–2026), Alfajer
e Boaster (2023–2025), Leo (2023), TenZ (Madrid e Champions 2024), Sacy (Madrid e Champions 2024), Shao (LOCK//IN), Ethan
(2025–26), CHICHOO, zekken, trent. Os critérios são ajustáveis; o que importa é que (a) são fatos do snapshot, (b) prevêem o
**patamar** fora da amostra (GOAT 1,107 contra Regular 0,992 no evento seguinte) e (c) **não prevêem título** (6% contra 17%:
título é do time). Logo a aura deve agir no **jogador**, pouco, e o "durão" age no **time**, pouco.

"Durão" (âncora): card **Legend/GOAT que é IGL** (`isIGL`) ou com `decision ≥ 60`, ou card de qualquer tier com título e
rating ≥ mediana do time (88 dos 187 elencos com IGL conhecido têm IGL ≥ mediana de OVR). Sacy 2022 entra como Star + título +
rating 1,13 (7º do evento): âncora.

### 10.3 Proposta: efeitos limitados

| Mecanismo | Regra | Tamanho | Base |
|---|---|---|---|
| Aura pessoal em decisão | Em mapa decisivo (3º de MD3, 5º de MD5), playoffs e OT: `killWeight × (1 + a)`, `deathWeight / (1 + a/2)` com a = 0,06 (GOAT), 0,04 (Legend), 0,02 (Star) | ≈ +3 / +2 / +1 OVR-equivalentes, só nesses mapas | Medido +0,017 rating (≈ +1 OVR) no Q4 em deciders: o modelo dá no máximo 3× isso, só para 44 cards |
| Durão no time | Âncora (10.2): +3 em **Tomada de decisão** e +3 em **Comunicação** (dimensões já existentes), o que vale ≈ +0,3 e +0,12 pontos de força fixos, mais o termo de round da decisão | **≤ +2 pontos de força no total**, somando o fixo e o termo de round (0,5 a cada 10 em rounds com arma, ×1,5 em OT e no 3º mapa) | Preferência revelada dos times por IGLs (pesquisa anterior); tamanho é design |
| Teto de time | Soma de todas as auras de um elenco (pessoais + durão) limitada a **+2 pontos de força** fora de deciders e **+4** em deciders/OT | | Para a curva "+10 ≈ 74%" não mexer |
| UI | Moldura do card por tier (Rising / Star / Legend / GOAT) com os fatos: "2 títulos (Reykjavík 22, Madrid 24) · top-3 de rating em 3 internacionais"; na série: "Aura: +2 no mapa decisivo"; no time: "Durão: Sacy — decisão e comunicação +3" | | O jogador vê de onde vem |

**Teste de calibração:** com e sem aura, em `balance.test`, (1) a taxa de título do decil de cima do draft clássico sobe no máximo
**3 pp** e a do mediano não cai mais de 1 pp; (2) um elenco só de GOATs/Legends contra um elenco igual em OVR sem aura vence o
mapa decisivo em ≤ 56% e a série MD3 em ≤ 55%; (3) o resíduo de rating dos GOATs em deciders no placar do motor fica ≤ +0,05
(real +0,017). Se qualquer um estourar, reduzir `a` antes de tudo.

**O que não fazer:** "clutch factor" que dobra a força em OT; aura por reputação sem fato (tier só sai de títulos, finais e
rankings do snapshot); aura que muda a média do jogador em todos os mapas (isso é o OVR, que já tem o bônus de colocação).

---

## 11. Prodígios

### 11.1 O que os dados mostram

Estreia internacional = primeiro evento internacional do jogador nos dados (snapshot a partir de 2021; quem estreou antes conta
como "estreante" em 2021, viés pequeno). Sem idade: o snapshot da Liquipedia não guarda data de nascimento e a API recusou o
User-Agent do projeto nesta sessão (HTTP 406 em `api.php` para Tkzin e Spikezin); acrescentar `birth_date` ao pipeline é
possível mais tarde, com a mesma etiqueta de fonte. "spikezin" não aparece no snapshot (nenhum titular com esse handle em
evento internacional nos dados); "spike" (LOUD, Masters London 2026: 1,15, campeão) é outro jogador. [dado]

| Medida | Estreantes | Veteranos (≥ 4º internacional) | n |
|---|---|---|---|
| Rating no evento | 1,021 ± 0,120 | 1,023 ± 0,112 | 171 / 27 |
| Estreia ≥ 1,10 / ≥ 1,20 | 24% (41) / 13 jogadores | — | 171 |
| Depois de estreia ≥ 1,10: média nos 2 eventos seguintes | **1,17 → 1,08** | | 25 |
| Depois de estreia 1,0–1,1 / 0,9–1,0 / < 0,9 | 1,05 → 1,03 / 0,96 → 0,98 / 0,81 → 0,92 | | 34 / 16 / 8 |
| Inclinação do rating por evento nos 2 primeiros anos (≥ 3 eventos) | **−0,005** por evento (mediana −0,005); quem estreou < 1,0: +0,002; ≥ 1,1: −0,007 | | 37 |
| Rating por índice de evento internacional (1º … 4º) | 1,021 · 1,026 · 1,039 · 1,047 | | 171 · 83 · 43 · 27 |
| Oscilação por mapa (SD do resíduo) em internacionais | **0,298** | 0,308 | 91 / 212 jogador-eventos |
| Mapas ≥ 1,5 / ≤ 0,7 | 7,4% / 14,5% | 7,3% / 15,8% | |

Casos: tkzin 0,91 (Stage 2) → 1,02 (Champions 2026, campeão, 4 aces); N4RRATE 1,23 e 1,29 nos dois primeiros, depois 1,0–1,1;
kaajak 1,16–1,24 e depois 0,92–1,10; primmie 1,12 → 1,22 → 1,40 (London 26), o raro que seguiu subindo; Demon1 1,11 → 1,26
(título) → 0,90–1,06. Leitura: a estreia brilhante é real e **regride** depois; a média do 1º ao 4º internacional sobe 0,026 (o
que é compatível com sobrevivência: quem joga 4 internacionais é quem rendeu). Prodígio **não** oscila mais nem tem piso menor.

### 11.2 Proposta

- **Selo "Prodígio" (fato):** card cujo evento é o **primeiro internacional** do jogador nos dados **e** com rating ≥ 1,10 no
  evento ou entre os 25% melhores ratings do evento (41 de 171 estreias). Estreantes sem isso ficam como "Rising" (10.2). Se o
  pipeline ganhar `birth_date`, acrescentar "≤ 21 anos no evento" ao critério; sem idade, não inventar.
- **Crescimento dentro da run (design, declarado como tal):** +0,5 OVR efetivo por fase alcançada no Champions da run (grupos
  vencidos, playoffs, final), **teto +2**, aplicado aos atributos `aim`/`entry`/`utility` na proporção. Os dados mostram
  regressão (1,17 → 1,08), não crescimento; o crescimento é uma mecânica de jogo para dar história, e a UI deve dizer "Prodígio
  em ascensão: +1 OVR (chegou aos playoffs)" e não "vai melhorar".
- **Explosão e piso iguais** aos dos outros cards (`sigma_i` da seção 6.1 sem fator extra; medido 0,298 contra 0,308). Se o
  design quiser "sentir" o prodígio, no máximo `roleFactor × 1,05`, nunca piso menor (medido igual).
- **UI:** moldura "Prodígio em ascensão" com os fatos ("Primeiro internacional: Champions 2026 · 1,02 · 4 aces"); no fim da run,
  "Evolução: +1,5 OVR nesta run". Tooltip: "Nos dados, estreantes rendem igual aos veteranos e os que estreiam muito bem caem um
  pouco depois; o crescimento aqui é parte do jogo."
- **O que não fazer:** prodígio com variância maior ou piso menor; crescimento por evento no pool (os cards são fotos de um
  evento); idade estimada.

---

## 12. Proposta (parte 2): parâmetros e riscos de afinidade, aura e prodígios

| Parâmetro | Valor | Medido ou design | Fonte |
|---|---|---|---|
| `agentForm` / `mapForm` por card | **não existe** | medido: variância verdadeira 0, estabilidade 0,05–0,08 | 9.1 |
| `META[mapa][ano]` (participação por agente) | tabela 9.2 | medido (1.549 mapas; páginas de agentes: 2.534 comps) | 9.2 |
| Bônus de encaixe de meta | +1,5 × encaixe, teto +1,5, nunca negativo | design, limitado pela vantagem real de pick (+1,3) | 9.1, 9.3 |
| `mapAffinity` da IA | ±2 (mantém) | medido: estabilidade 0,09 | 9.1 |
| Critérios de tier | tabela 10.2 | fatos do snapshot; contagens 20 / 24 / 155 / 218 / 179 | 10.2 |
| Aura pessoal `a` | 0,06 / 0,04 / 0,02 em deciders, playoffs e OT | design; medido +0,017 rating no Q4 em deciders | 10.1, 10.3 |
| Durão no time | +3 Decisão, +3 Comunicação; teto +2 pontos de força | design; IGL ≥ mediana em 88 de 187 elencos | 10.2, 10.3 |
| Teto de aura por elenco | +2 (normal) / +4 (decider, OT) | design | 10.3 |
| Prodígio: critério | 1º internacional + rating ≥ 1,10 ou top 25% | fato; 41 de 171 estreias | 11.2 |
| Prodígio: crescimento | +0,5 OVR por fase, teto +2 | design (dado mostra regressão −0,09) | 11.1 |
| Prodígio: explosão / piso | iguais | medido (0,298 × 0,308; 7,4% × 7,3%) | 11.1 |
| `birth_date` | ausente | API Liquipedia recusou (406); futuro no pipeline | 11.1 |

Riscos específicos:
- **Contagem dupla da aura:** o OVR já tem +3 de campeão e +2 de Champions; a aura pessoal fica restrita a deciders/playoffs/OT
  para não somar nos mesmos mapas duas vezes. O teste da seção 10.3 (título do decil de cima ≤ +3 pp) é o limite.
- **Meta por ano:** o pool do veto é o do evento mais recente (2026); cards de 2021–2024 jogam agentes que o meta de 2026
  quase não usa (Jett 9% em Ascent 26, Chamber só em Haven/Sunset/Summit). O encaixe de meta não pode punir: por isso é só bônus
  com teto baixo, e o repertório vale pela função.
- **Estreia e sobrevivência:** a trajetória do 1º ao 4º internacional (+0,026) é viés de quem continuou; não usar como curva
  de crescimento "real".
- **Handles:** "spikezin" não casa com o snapshot; antes de rotular um card, confirmar pelo id do VLR.

---

## 13. Referências

Dados próprios (2026-10-19): páginas públicas de partida do [VLR.gg](https://www.vlr.gg) (visão geral por mapa e aba
`performance`, 563 séries, 57 eventos de 2021–2026, incluindo todas as séries dos seis eventos internacionais de 2025–2026) e o
snapshot do projeto (VLR + [Liquipedia](https://liquipedia.net/valorant/), CC-BY-SA 3.0).

- Rejthar e Kavřík, *The Hot Hand in Esports* (SN Computer Science, 2025): https://link.springer.com/article/10.1007/s42979-025-03817-5
- *Streaks and Coping: Decoding Player Performance in League of Legends Using Big Data* (ACM, 2024): https://dl.acm.org/doi/fullHtml/10.1145/3665463.3678787
- *Capability and opportunity in hot shooting performance: Evidence from top-scoring NBA leaders* (PMC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5809017/
- Albert, *Streaky hitting in baseball* (modelo de dois estados): https://www.stat.berkeley.edu/~aldous/157/Papers/albert_streaky.pdf · Chance, *Streakiness in Home Run Hitting*: https://chance.amstat.org/?p=8787
- HLTV, *A look at inconsistency*: https://www.hltv.org/news/34617/a-look-at-inconsistency · *Introducing Rating 2.0*: https://www.hltv.org/news/20695/introducing-rating-20
- Jha, *Measuring Consistency in VALORANT for VCT 2024* (Medium): https://medium.com/@_SushantJha/measuring-consistency-in-valorant-ee2a9c773486
- The Spike, *The numbers behind the best: Analyzing VALORANT's 2025 MVP performances*: https://www.thespike.gg/valorant/news/the-numbers-behind-the-best-analyzing-valorant-s-2025-mvp-performances/7435
- The Spike, *LOUD tkzin makes VALORANT Champions history*: https://www.thespike.gg/valorant/news/loud-tkzin-makes-valorant-champions-history-with-record-setting-debut/8927 · Strafe: https://www.strafe.com/news/read/loud-tkzin-sets-new-valorant-champions-record/
- Dot Esports, *VIT vs LOUD, Champions 2026*: https://dotesports.com/valorant/news/vct-champions-2026-vit-vs-loud
- arjfc, *vct-champions-2026-predictor*: https://github.com/arjfc/vct-champions-2026-predictor
- VideoGamer, *Exposing the Hidden Attributes of Football Manager 2024*: https://www.videogamer.com/features/exposing-the-hidden-attributes-of-football-manager-2024/ · FM Dossier: https://fmdossier.dev/guides/player-attributes-explained · fm-arena, *Improving hidden attributes*: https://fm-arena.com/thread/8940-improving-hidden-attributes/
- Dexerto, *EA FC 27 dynamic overall explained*: https://www.dexerto.com/wikis/ea-fc-27/dynamic-overall-explained/ · mein-mmo: https://mein-mmo.de/en/ea-fc-27-2-new-features-promise-the-best-career-mode-in-recent-years,1580709/
- MetricGate, *Glicko-2 rating*: https://metricgate.com/docs/glicko-2-rating/ · HackerNoon, *The math behind odds*: https://hackernoon.com/the-math-behind-odds-how-rating-systems-turn-team-strength-into-pre-match-probabilities
- ExpertBeacon, *How many kills is an ace in VALORANT?* (ranked, sem método): https://expertbeacon.com/how-many-kills-is-an-ace-in-val/
- Operation Sports, sequências no OOTP (fórum): https://forums.operationsports.com/fofc/archive/index.php/t-64554.html
