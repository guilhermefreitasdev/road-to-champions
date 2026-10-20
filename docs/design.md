# Road to Champions (Valorant) — ideia base

Simulador/manager de Valorant inspirado no Road to Major (CS) e no 7a0. Monte um dream team com
jogadores históricos (card = jogador + evento, ex.: "aspas @ LOUD, Champions 2022") e vença um Champions.

## Modos
| Modo | Resumo |
|---|---|
| Draft (MVP) | Roleta time+evento → escolhe 1 jogador → slot de função (DUE/INI/CON/SEN/FLEX). 5 picks + coach, 3 rerolls. Champions de 16 times: 4 grupos GSL (A–D) → playoffs dupla eliminação, final MD5 (ver "Formato do Champions") |
| Ultimate Draft | 5 opções fixas por pick (seed por run), sem reroll |
| Complete Trials (secundário) | Comece do seu servidor: escolha a região (Americas/EMEA/Pacific/China) e o campo (Atual ou Prime), drafte só com elencos de times dela, dispute a liga regional (12 times), o Masters (8) e o Champions (16). Ver "Modo Complete Trials" |
| Diário / Valdle | Hub de minijogos diários: Cena Pro + Jogo (detalhado abaixo) |
| Carreira | Org em liga regional (Americas/EMEA/Pacific/China): Kickoff → Stage 1 → Masters → Stage 2 → Champions. Transferências, patrocínio, base (Challengers), aura Rising→Star→Legend→GOAT |
| Online | Ranked 1v1, lobby de 8 managers (fase final, precisa backend) |

## Núcleo de simulação
- Card: atributos MIRA, ENTRADA, UTILIDADE, CLUTCH, PRESENÇA, DECISÃO e um OVR, todos calculados a partir dos dados reais (ver "Cards reais" abaixo); aura (Em ascensão / Estrela / Lenda / GOAT), "durão" e "prodígio" só de fatos de carreira (ver "Modelo v3").
- Força do time (Modelo v2, abaixo) = base (média de OVR × encaixe de função) + composição + cinco dimensões explicáveis: Mecânica, Utilidade, Tomada de decisão (IGL + coach), Comunicação (química) e Clutch.
- Round a round: logística da diferença de força (escala 30 pontos) + forma do dia por mapa (time até ±12, σ ≈ 4, mais a soma das formas individuais dos cinco, σ ≈ 4) + encaixe de meta da comp (até +1,5) + agente de cada jogador (até ±1) + familiaridade com o mapa (até +2) + lado + economia pós-pistol + termos de decisão e clutch por contexto + aura em decisivo/prorrogação (teto +1). 13 rounds, troca no 12, OT vence por 2. Kills por round com cadeia de multikill e trade (3K/4K/ace nas taxas reais), rating estimado, MVP do mapa e da série (ver "Modelo v3").
- Calibragem (medida em `src/game/balance.test.ts`): num mapa, +10 de força vence ~75% e +20 ~93%. Zebras acontecem; série e torneio ainda premiam o time mais forte.
- Veto MD3 em pool de 7 + escolha de comp por mapa. Placar estilo VLR.
- Tudo com RNG de seed (mulberry32).

### Força do time v2 (`src/engine/team.ts`)
Implementa o "Modelo v2" de `docs/pesquisa-taticas.md` (seção 6), na forma incremental (Opção A). Motivação: o IGL some do scoreboard (rating −0,05, ACS −17, assistências +21%), então o OVR o subestima e o valor dele precisa de uma dimensão própria; e o jogador precisa ver **por que** o time é forte e **o que custa** ficar sem IGL.

`total = base + composição + Σ peso_d × (dimensão_d − referência_d) / 10`

| Dimensão (0–100) | Fórmula | Peso (pontos a cada 10) | Referência |
|---|---|---|---|
| **Mecânica** | média de encaixe × (0,6 mira + 0,4 entrada) | 0,3 | 68 |
| **Utilidade** | média de encaixe × utilidade, × cobertura: sem controlador ×0,70, sem iniciador ×0,90, dois controladores com iniciador +3 | 0,3 | 69 |
| **Tomada de decisão** | 0,70 × decisão do IGL + 0,15 × melhor decisão dos outros + 0,15 × coach (40 + 20 × tática: 40–100; sem coach 40) | 1,0 | 74 |
| **Comunicação** | min(100, 50 + 6 × duplas do mesmo time e evento + 3 × duplas do mesmo país); dois IGLs −5 | 0,4 | 50 |
| **Clutch** | 0,5 × clutch médio + 0,3 × melhor clutch + 0,2 × consistência média | 0,3 | 74 |

- As referências são as medianas dos elencos reais (medidas em 2026-10-19): um elenco típico soma 0 em cada dimensão, então o OVR, que já carrega a mecânica, não é contado duas vezes. Mecânica, Utilidade e Clutch só dão um empurrão (±1 ponto numa faixa típica); a Comunicação reproduz o teto antigo da química (+2 para um elenco real completo, +0,6 para um time draftado com uma dupla e três compatriotas); a Tomada de decisão é onde o IGL mora.
- **Sem IGL**: a decisão vira 0,75 × (0,70 × melhor decisão dos cinco + 0,15 × segunda + 0,15 × coach), com **teto 55**. Um elenco real típico (decisão 75) cai para 55: −2 pontos fixos, mais o termo de round (abaixo). Medido com o mesmo elenco com e sem IGL: o lado com IGL vence ~58% dos mapas no mapa 1 e ~59% no mapa 3 (≈ 3 e 3,5 pontos de força). Um time draftado só de não-IGLs (decisão ~45) com coach campeão fica em 40 (−3,4 fixos e ~−1,7 nos rounds). O coach cobre parte (15%) mas nunca iguala um time com IGL. A pesquisa pedia 4–5 pontos (peso 1,4 e 0,7 por round); com isso o time mediano do drafter automático (que ignora o IGL) caiu para 62% de playoffs e 1% de título e o decil de cima (só times com IGL) subiu a 54%, então o peso ficou em 1,0 / 0,5 (ver "Balanceamento").
- **Dois IGLs**: decisão +5 (segunda voz no mid-round) e comunicação −5 (duas vozes nas calls): +0,5 líquido, nunca punição.
- **IGL desconhecido** (`iglKnown: false`, elenco da IA sem dado na Liquipedia): decisão = referência (74), 0 pontos: nem punição nem bônus, e a tela diz isso.
- **Composição**: sem controlador −8, sem iniciador −3, sem duelista −2, **sem sentinela 0** (19% das composições de elite jogam sem e vencem igual; pesquisa 4.1). Encaixe de função segue 1 / 0,9 flex / 0,75 fora; um **flex nato** (`Card.flexRoles` com 2+ funções) rende 1 em toda função que jogou de verdade e no slot Flex (`cardFit`, ver "Agentes por mapa, flex natos e familiaridade").
- Tela "Seu time": base e composição em pontos, as cinco barras com valor, pontos e marca da referência, as notas de cada uma (IGL com fonte, segunda voz, coach com "cobre parte da tática, mas não faz calls durante o round") e avisos em destaque ("Sem IGL: Tomada de decisão −25% (máx. 55) — força ≈ −X…", "Dois IGLs…", "Sem controlador…").

### Round v2 (`src/engine/match.ts`)
Só as mudanças baratas e bem apoiadas pela pesquisa (seção 3):
- **Economia pós-pistol**: o vencedor do pistol ganha +57 pontos no round 2 (anti-eco: 87% real, medido 87% no motor) e −15 no round 3 (round bônus: 38% real, 36% no motor). Antes era +6 só no round 2 (~55%). Nada de embalo além disso (full × full repete o vencedor em 49,9%). Quem vence os dois pistols leva o mapa em 76% (real 70%); prorrogação em 14% dos mapas (real 13,6%).
- **Decisão por contexto**: em todo round com arma (compra depois de derrota, pós-plant, retake), 0,5 ponto a cada 10 de diferença na Tomada de decisão; ×1,25 no 2º mapa da série e ×1,5 do 3º em diante (adaptação e anti-strat, `MapOptions.seriesMap`, passado por `simulateSeries`); ×1,5 na prorrogação (cada round de OT reinicia a economia).
- **Clutch na prorrogação**: 0,5 ponto a cada 10 de diferença na dimensão Clutch, só nos rounds de OT. O simulador de kills roda depois do resultado do round, então "clutch em desvantagem numérica" ficou de fora (a cadeia de duelos, Opção B da pesquisa, é trabalho futuro).

### Modelo v3 — Forma, explosão, aura e meta (`src/engine/form.ts`, `src/engine/match.ts`)
Implementa `docs/pesquisa-variancia.md` (seções 6 e 9–12), com os limites que a pesquisa pede: tudo sai do `Rng` com seed, nenhum atributo novo é medido por jogador, a forma é visível no placar e pequena na força, e aura/prodígio são fatos. Calibrado em `src/engine/form.test.ts` (`FORM_REPORT=1 npx vitest run src/engine/form --silent=false` imprime as medidas).

**Forma do dia por jogador (6.1).** Para cada jogador e mapa, `z` ~ (0, 1) com cauda direita leve (soma de três uniformes + assimetria 0,1), sorteado de `createRng(`${seed}:${matchId}:${mapa}:${cardId}`)` (`MapOptions.formSeed`, passado por `simulateSeries`): o resultado não muda com nenhuma ação da interface. `σ_i = 0,10 × (1 + 0,006 × (OVR − 80)) × função` (duelista 1,06 · sentinela 1,01 · controlador 0,98 · iniciador 0,95); `f_i = exp(σ_i × z)` limitado a [0,55; 1,9] multiplica o peso de kill, divide o de morte por √f e multiplica o de assistência por √f. **Por que 0,10 e não os 0,25 da pesquisa:** a loteria de kills do motor, sozinha (σ = 0), já reproduz o desvio real do KPR por mapa (individual 0,18, total 0,20; medido na pesquisa: 0,180 e 0,203). Com 0,25 o placar ficava mais volátil que o real (0,24 / 0,26); com 0,10 fica em 0,19 / 0,20, assimetria +0,28. O teto cresce com o nível sem atributo novo: `f` multiplica um peso que já é maior para a estrela e `σ_i` sobe 6% a cada 10 OVR. **Força do time no mapa:** `+ 90 × Σ (f_i − 1) × share_i` (`share_i` = OVR × encaixe / soma), limitado a ±8: os cinco juntos dão σ ≈ 3,8 pontos; um jogador em z = +2 soma ≈ +4 (não decide um mapa sozinho). A pesquisa escreveu K ≈ 9 para σ ≈ 4, um lapso de conta (com shares de 0,2 daria σ ≈ 0,4); o alvo calibrado foi o σ. `FORM_SWING` caiu de 10 para 8 (σ do time 4): a forma total do mapa (diferença entre os times) ficou em σ ≈ 8 pontos → σ_p ≈ 0,067 em probabilidade de round (real 0,08–0,09; motor antigo 0,059). Embalo na série: `z_{n+1} = 0,1 × z_n + √(1 − 0,01) × novo` (`MapOptions.prevForm`; medido 0,067; o time não tem embalo nenhum: quem vence o mapa 1 leva o 2 em 51,5% com times iguais).

**Fase do torneio (6.2).** Por run (modo principal) ou por etapa (Complete Trials), cada jogador, do usuário e da IA, sorteia `t ~ N(0; 2,5)` em pontos de OVR, truncado em ±6 e arredondado a 0,5, de `createRng(`${seed}:form:${cardId}`)`, somado a Mira, Entrada e Utilidade e ao OVR (`applyTournamentForm`, aplicado em `lineupOf`; as seeds do torneio usam a força com a fase). Medido: desvio verdadeiro da média por evento = 0,041 de rating ≈ 2,5 OVR. A tela "Seu time" só mostra "Em alta/Em baixa neste torneio (±N)" quando |t| ≥ 2.

**Explosão no round (6.3).** Quotas de kills por round: vencedor 3 / 4 / 5 kills com pesos 0,10 / 0,26 / 0,64 (`WINNER_KILL_WEIGHTS`), perdedor 0 … 4 com pesos 0,05 / 0,13 / 0,26 / 0,32 / 0,24 (`LOSER_KILL_WEIGHTS`): 6,84 kills por round (real 6,86). **Cadeia:** quem fez a última kill do round tem o peso × (1 + 0,25 × kills no round × f) na próxima. **Trade:** quem acabou de matar está exposto: peso de morte × (1 + 0,7 × kills no round) para a próxima kill do outro lado (sem isso a estrela fazia 3K+ em 9% dos rounds, contra 6,9% reais com o mesmo KPR). Resultado por jogador-round, times iguais: 3K 3,6% · 4K 0,76% · ace 0,10% (real 3,80 / 0,80 / 0,083); 0,22 aces por mapa (real 0,175) e 20% dos mapas com ace (real 16%). Estrela com KPR 0,86 entre coadjuvantes: 3K+ 7,1% · 4K+ 1,6% · ace 0,18% (real, KPR > 0,80: 6,9 / 1,66 / 0,24); coadjuvante (KPR 0,63): 4K+ 0,63% · ace 0,06%. `PlayerLine.multikills` guarda 2K/3K/4K/5K por mapa.

**Rating estimado, MVP e selos.** `PlayerLine.rating = 0,98 + 0,8 × KPR − 0,8 × DPR + 0,25 × APR + 0,6 × (KAST − 0,72)`: estimativa do simulador (1,00 = linha média; **não** é o Rating 2.0 do VLR, e a interface diz isso). As mortes pesam porque o rating real segue o resultado (um terço da variância é do time): com ele, o jogador com rating ≥ 1,4 está no time vencedor em 88% dos mapas (real 88% para ≥ 1,4) e o MVP do mapa está no time derrotado em 20% (real 15%; a loteria do motor dentro do mapa é tão larga quanto o resíduo real, por isso não chega a 15 — diferença aceita). MVP do time = melhor card do elenco em 41% dos mapas e o pior em 8% (real 39% / 7%). `mvp` marca o melhor rating dos 10 no mapa; `SeriesResult.mvp` o melhor rating ponderado por rounds na série. Selos no placar, pelo rating estimado (o que o jogador vê), nunca pelo sorteio escondido: **"🔥 Inspirado"** em ≥ 1,4 (7,6% das linhas; real ≥ 1,5: 7,7%) e **"❄️ Apagado"** em ≤ 0,6 (6,7%). Um "Inspirado" aparece em 58% dos mapas, 88% das vezes no vencedor. A forma nunca é mostrada antes do mapa.

**Aura (10).** Tier calculado em `cards.ts` só com fatos dos eventos internacionais **até e incluindo** o do card (um card regional usa a carreira até a data do evento): **GOAT** ≥ 2 títulos e ≥ 2 vezes top-3 de rating do evento; **Lenda** 1 título e ≥ 2 top-3, ou ≥ 2 títulos, ou ≥ 3 top-3; **Estrela** ≥ 1 top-3, ou rating ≥ 1,10 em ≥ 2 internacionais, ou título com rating top-8; **Em ascensão** primeiro internacional. Contagem (1.250 cards internacionais): 19 GOAT · 35 Lenda · 235 Estrela · 371 Em ascensão · 590 sem aura. Exemplos: Chronicle (GOAT de Tokyo 2023 em diante), Derke (GOAT de Champions 2024 em diante), Alfajer e Leo (GOAT), yay (Lenda em Reykjavík, Copenhagen e Champions 2022: 1 título, top-3 em 3), Sacy (Estrela em 2022, Lenda em Madrid e Champions 2024), Boaster (Lenda e durão de Tokyo 2023 em diante). O card guarda `career` (`events`, `titles`, `top3`, `high`) e a interface mostra os fatos no tooltip. **Efeito pessoal, só em mapa decisivo e prorrogação:** peso de kill × (1 + a) e de morte ÷ (1 + a/2), a = 0,06 (GOAT), 0,04 (Lenda), 0,02 (Estrela); na força, `+ Σ (3 / 2 / 1) × share_i`, com **teto +1 por time** (a pesquisa propôs +2: com +2, o decil de cima do draft, quase só estrelas e lendas, ganhava ≈ 9 pp a mais de títulos do que sem aura, contra o limite de 3 pp; com +1, ver "Balanceamento"). Medido com um elenco só de GOATs/Lendas contra um igual em OVR sem aura: mapa decisivo ≈ 54–56% (limite 57%), MD3 ≈ 53% (limite 56%). **Durão** (`anchor`): Lenda/GOAT que lidera (IGL ou decisão ≥ 60), ou campeão daquele evento com rating ≥ mediana do time e ≥ 2 internacionais (estreante não é durão): Tomada de decisão e Comunicação +3, uma vez por time (≈ +0,4 de força fixa + 0,15 por round de compra). 68 cards internacionais.

**Prodígio (11).** Fato: primeiro internacional com rating ≥ 1,10 ou entre os 25% melhores ratings do evento (69 cards; ex.: Demon1 em Tokyo 2023, aspas em Reykjavík 2022, Derke em Reykjavík 2021; tkzin no Champions 2026 **não** entra: 1,02 e fora do quarto de cima). Mecânica declarada como design: +0,5 OVR efetivo (Mira, Entrada, Utilidade e OVR) por fase alcançada na run, teto +2 (modo principal: playoffs 1, top 4 2, grande final 3; Complete Trials: playoffs da liga 1, Masters 2, Champions 3, playoffs do Champions 4), só para o time do usuário (é a história da run); explosão e piso iguais aos dos outros cards. A tela diz "Prodígio em ascensão: +1 OVR pelas fases alcançadas", nunca "vai melhorar".

**Encaixe de meta (9).** `src/data/real/meta.ts` guarda a tabela 9.2 da pesquisa (participação de cada agente nos 10 slots de cada mapa, top 6, por ano: 2025 e 2026, 1.549 mapas do VLR), e o jogo usa o ano do pool do veto (`REAL_META`). Por mapa, cada time monta a melhor comp possível com os agentes que cada card **jogou no evento** (agentes únicos, guloso) e o encaixe é a soma das participações sobre a melhor comp de cinco agentes do mapa: bônus `1,5 × encaixe`, teto +1,5, nunca negativo (quem escolhe o mapa vence 53,5% ≈ +1,3). **Não há afinidade jogador × mapa**, e a de jogador × agente é só um resto encolhido e limitado (ver "Agentes por mapa" abaixo): a variância verdadeira é zero em todos os cortes (9.1), então um `agentForm`/`mapForm` cru por card seria sorteio com nome de estatística.

### Agentes por mapa, flex natos e familiaridade (`src/engine/agents.ts`, `src/engine/familiarity.ts`, `cardFit` em `src/engine/team.ts`)
Pedidos do dono do projeto (2026-10-20), com os limites da pesquisa. O pipeline grava em cada card o pool real de agentes (`Card.agentPool`: mapas, rating, ACS e K/D por agente, do VLR, até o ano do card) e as funções jogadas de verdade (`Card.flexRoles`, a principal primeiro). Sem esses campos tudo cai no comportamento anterior.

**Flex nato.** `cardFit(card, slot)`: 1 na função do card; no slot Flex, 1 para um flex nato (2+ funções em `flexRoles`) e 0,9 para os demais; numa função de `flexRoles`, 1; fora, 0,75. `roleFit(função, slot)` continua para compatibilidade. Usado na base da força, nas dimensões, nas parcelas de força (forma, aura, agente), no peso de kill e na interface ("100% flex nato"; nota "Flex nato: sem penalidade em Iniciador/Sentinela e no slot Flex"). Na IA, quem sobra numa função repetida ocupa primeiro uma função livre que jogou de verdade. Nos dados, 856 de 3.570 cards são flex natos.

**Agente por mapa.** Em cada mapa, cada jogador sorteia um agente do seu pool (seed própria `${formSeed}:${mapa}:agents:${time}`, que não mexe em nenhum outro sorteio): peso = mapas jogados × (1 + 0,05 × participação do agente no meta do mapa, %), então um agente com 20% de meta pesa ×2; num slot de outra função, só os agentes dessa função quando o pool tem; sem repetir agente no time (quem tem menos opções escolhe primeiro); sem pool, sai dos agentes do evento (`Card.agents`). Fica em `PlayerLine.agent`.

**Vantagem de agente (pequena de propósito).** `agentEdge = (rating no agente − rating médio do jogador no pool, ponderado por mapas) × mapas / (mapas + 30) × 60`, em OVR, limitado a **±2** e arredondado a 0,1 (`PlayerLine.agentEdge`). 60 OVR por ponto de rating é a mesma conversão da fase do torneio (0,041 de rating ≈ 2,5 OVR). Entra como a forma: peso de kill × exp(edge / 60) (±3,4% no teto) e peso de morte ÷ √ disso; e na força do time como Σ edge × parcela de força, com teto **±1** (`MapEdges.agent`). Por que tão limitado: a pesquisa (9.1) mediu a variância verdadeira jogador × agente como zero (diferença média entre o melhor e o pior agente 0,163, menor que os 0,216 do acaso); o encolhimento por 30 mapas faz um agente de 10 mapas valer 25% da diferença e um de 90 mapas 75%, então só amostras grandes aparecem. Nos dados: mediana |edge| 0,6 OVR, p90 1,6, 612 de 15.809 no teto. Medido: sem efeito mensurável no balanceamento (abaixo).

**Familiaridade com o mapa.** Cada mapa que um time joga numa run (Champions) ou temporada (liga → Masters → Champions) soma **+0,5** de força naquele mapa para aquele time nas partidas seguintes, até **+2** (4 mapas), para todos os times, IA inclusive. No Complete Trials, quem chega de outra região ao Masters ou ao Champions sem nenhum mapa na temporada entra com a mediana de mapas por mapa dos times da IA da liga do usuário (eles também jogaram as ligas deles), para a familiaridade não favorecer a região do usuário. Guardado em `RunState.mapsPlayed` / `SeasonState.mapsPlayed` (id do time → mapa → mapas jogados), aplicado por `SeriesOptions.familiarity` → `MapOptions.familiarity` (`MapEdges.familiarity`) e somado ao conforto de mapa no veto da IA (`vetoLineup`/`seasonVetoLineup`: os times puxam os mapas que vêm jogando; o scouting do coach mostra a soma). Seletores: `mapFamiliarity(run, id)` / `seasonMapFamiliarity(s, id)` (mapa, mapas jogados, pontos). Regra de design, não medida: o teto fica perto do valor real de escolher o próprio mapa (+1,3) e os dois times da série ganham do mesmo jeito.

**Reprodução e estatísticas.** `src/game/timeline.ts`: `seriesTimeline(série)` devolve, por mapa, os eventos em ordem (início do mapa, início do round com lados e placar, cada kill com matador/vítima/assistência, agente, primeira kill, multikill até ali e vivos por time, fim do round com vencedor, placar, ace, clutch 1vN e flawless, fim do mapa com MVP), para a tela de série animar em 1x/2x/4x ou pular para o fim; tudo sai da `SeriesResult`, então bate com o placar. `src/game/stats.ts`: `playerStats(séries, ids?)` (mapas, rounds, K/D/A, KD, ACS e rating médios por round, KAST, FK/FD, 3K/4K/aces, MVPs de mapa e de série, quebra por agente) e `runPlayerStats(run)` / `seasonPlayerStats(temporada)` para os cinco do usuário.

**O que não existe, de propósito:** atributo de volatilidade/explosão por card (confiabilidade ≈ 0), "jogador de final" (0 medido), embalo de série para o time (0 medido), cadeia forte (≥ 0,5 dobra os aces), aura por reputação sem fato, prodígio com variância maior.

### Cards reais (`src/data/real/cards.ts`)
Um card por linha jogador-evento do VLR, só para os 5 titulares (os 5 com mais rounds) de cada time que jogou. Nenhum número é digitado à mão: tudo sai dos JSON versionados por fórmulas fixas e determinísticas.
- **Amostra mínima**: o elenco só entra se os 5 titulares têm pelo menos 30 rounds (≈ 1,5 mapa). Isso tira 3 elencos da LOCK//IN 2023 que jogaram um mapa só (T1, DFM e RRQ); ficam 250 elencos e 1250 cards.
- **Função**: soma do % de uso de cada agente no evento por função (agentes de `src/data/game`). Empate → função dos agentes do jogador em todos os eventos (peso por rounds) → ordem fixa iniciador, controlador, sentinela, duelista. Depois, se o elenco ficou sem uma função, quem está numa função repetida e usou agentes da função que falta em pelo menos 20% dos picks no evento muda para ela (ex.: Viper/Killjoy num time com dois controladores vira sentinela). Nunca inventa uma função que ninguém jogou; 246 de 250 elencos cobrem as 4 funções.
- **Percentil no ano**: cada stat vira percentil (posição média) entre todos os titulares do mesmo ano, porque os números sobem e descem com a época. Stat ausente no VLR (ex.: Masters Shanghai 2024 não tem Rating, KAST, HS% nem clutch) conta como percentil neutro 50; o card guarda `null` e mostra "—".
- **Encolhimento por amostra**: percentil final = 50 + (p − 50) × rounds / (rounds + 60). Com 60 rounds, metade do desvio; com 400, 87%.
- **Atributos** (escala 40–99: 40 + 0,59 × percentil encolhido): Mira = HS%, KPR e ADR; Entrada = FK% − FD% (peso 0,7 para duelistas, 0,4 para os demais) e FK% (o resto); Utilidade = APR e KAST; Clutch = taxa de clutch encolhida para a média do ano como se tivesse mais 10 tentativas; **Presença** = KAST (era "Consistência" = KAST e Rating, que tinha correlação 0,76 com a média e 0,10 com a oscilação por mapa: era um segundo OVR; regularidade não é mensurável por jogador, pesquisa 2.3). Pesa na morte (`140 − (presença + clutch)/2`) e 20% na dimensão Clutch.
- **Aura, durão e prodígio**: fatos de carreira até o evento do card (`career`: internacionais, títulos, top-3 de rating, eventos com rating ≥ 1,10), critérios na seção "Modelo v3".
- **Decisão** (regra sobre fatos, não stat): IGL marcado como capitão na Liquipedia 90; IGL só pelo perfil de carreira (infobox) 80. Quem não é o IGL do evento parte de 60 (foi IGL de outro elenco nos dados) ou 45, ± até 5 pelo percentil encolhido de APR e KAST (as stats em que o IGL se destaca: assistências e ficar vivo); stat ausente não mexe. A UI diz que é escala do jogo, não estatística.
- **OVR** = 63 + 0,29 × percentil encolhido de desempenho + bônus. Desempenho = média de (Rating 50%, ACS 30%, KAST 20%) em percentil no ano e em percentil no ano dentro da função (um controlador não perde por ter ACS baixo). Bônus: campeão +3, vice +2, 3º–4º +1; Champions +2 (Masters e LOCK//IN 0). Resultado: mín. 68, p10 72, mediana 79, p90 87, máx. 94; os melhores jogadores dos campeões do Champions ficam no topo.
- **IGL**: `isIGL` só quando a Liquipedia dá um IGL para aquele time e evento e ele é um dos 5 titulares (casado pelo id do VLR no perfil ou pelo handle normalizado); o card guarda `iglSource`. Sem isso, o elenco fica com `iglKnown: false`.
- **Coach**: o técnico da Liquipedia. Tática = colocação do time no evento (1º 3, 2º–4º 2, 5º–8º 1, resto 0); entra como 15% da Tomada de decisão (40 + 20 × tática), não como pontos fixos. Veto = experiência: eventos internacionais com esse técnico nos dados até aquele evento, inclusive (1 → 0, 2–3 → 1, 4–5 → 2, 6+ → 3). Elenco sem técnico não oferece coach.
- **Conforto de mapa da IA**: só dos vetos guardados daquele evento: +1 por mapa escolhido, −1 por mapa banido, limitado a ±2. Elenco sem veto guardado não tem conforto.
- **Pool do veto**: o pool do evento mais recente (pela data de início) com exatamente 7 mapas; hoje é o do Champions 2026 (Abyss, Ascent, Haven, Lotus, Split, Summit, Sunset). Atualiza sozinho quando um evento novo entra.
- **Campo do Champions**: 15 adversários de times diferentes (um elenco por time, sorteado), sem nenhum jogador do usuário, e de 2 a 3 elencos "de elite" (os 20% mais fortes do pool) por campo (`FIELD_ELITE_MIN` 2 desde os flex natos; teto 3 desde a força v2, antes 2): um Champions tem poucos favoritos, mas sempre alguns.

## Formato do Champions (`src/engine/tournament.ts`)
Igual ao VCT Champions real: 16 times, fase de grupos e playoffs. Tudo MD3, menos final da chave inferior e grande final (MD5). 34 partidas no total (20 nos grupos + 14 nos playoffs).
- **Seeds**: os 16 times são ordenados pela força (o seu time incluso); seed 1 = mais forte.
- **Sorteio dos grupos (cobra por pote)**: pote 1 (seeds 1–4) vai para A, B, C, D; pote 2 (5–8) para D, C, B, A; pote 3 (9–12) para A, B, C, D; pote 4 (13–16) para D, C, B, A. Resultado: A = 1, 8, 9, 16 · B = 2, 7, 10, 15 · C = 3, 6, 11, 14 · D = 4, 5, 12, 13 (todo grupo soma 34). Determinístico, sem sorteio aleatório.
- **Grupo GSL (dupla eliminação, 5 partidas)**: Abertura 1 (seed 1 × 4 do grupo) e Abertura 2 (2 × 3) → os vencedores jogam a partida dos Vencedores (quem ganha é o 1º, classificado) e os perdedores a de Eliminação (quem perde é o 4º, eliminado) → a Decisiva junta o perdedor dos Vencedores e o vencedor da Eliminação (quem ganha é o 2º, classificado; quem perde, o 3º). Ninguém cai antes de 2 derrotas. Rótulos: "Grupo A · Abertura", "· Vencedores", "· Eliminação", "· Decisiva".
- **Ordem dos jogos**: todas as aberturas (A, B, C, D), depois Vencedores e Eliminação, depois as decisivas; os playoffs só começam quando os 4 grupos terminam.
- **Playoffs (8 times, dupla eliminação sem reset)**: cada 1º enfrenta o 2º de outro grupo nas quartas, e cada metade da chave tem um time de cada grupo: metade 1 = A1 × B2 e C1 × D2; metade 2 = B1 × A2 e D1 × C2. Times do mesmo grupo só se reencontram na final superior, na chave inferior a partir da rodada 2 ou na grande final. A rodada 2 da inferior cruza as metades para não repetir as quartas.
- **Colocação de quem cai nos grupos**: 3º do grupo = 9º–12º; 4º = 13º–16º. Nos playoffs: 7º–8º (inferior R1), 5º–6º (R2), 4º (R3), 3º (final inferior), 2º (grande final).
- **Na tela**: aba "Grupos" com cada grupo desenhado como chave GSL (Abertura → Vencedores → Classificado ✔ em cima, Eliminação → Decisiva → Classificado ✔ embaixo) e a tabela 1º–4º; no celular um grupo por vez (começa no seu), no desktop os quatro em 2×2 com o seu primeiro. Aba "Playoffs" com a chave completa (superior em cima, inferior embaixo, grande final à direita), linhas de ligação, placares e MD3/MD5; vagas vazias dizem de onde vem o time ("1º Grupo A", "Vencedor Quartas 1"). No celular a chave rola para o lado dentro da caixa, nunca a página. Para leitor de tela cada partida tem um resumo falado e "Ver série" é alcançável pelo teclado.
- Saves do formato antigo (Suíça) são descartados (RunState v3); o Modelo v2 da força subiu para v4, o Modelo v3 para v5 e agentes por mapa + familiaridade para v6 (chave `rtc:run:v6`; temporada `SEASON_VERSION` 3, `rtc:season:v3`).

## Modo Complete Trials (`src/game/season.ts`)

Modo secundário, aprovado e implementado em 2026-10-19: a temporada começa no servidor do jogador. O modo principal (draft → Champions) continua intacto; a temporada tem seu próprio save (`rtc:season:v1`), e os dois podem coexistir.

Fluxo: **Região** → **Draft** (clássico, 3 rerolls, roleta limitada aos elencos da região, de qualquer época) → **Coach** → **Seu time** → **Liga regional** → **Masters** → **Champions** → fim. Quem não fica entre os 3 primeiros da liga termina a run ali ("Eliminado na liga"). Tudo é determinístico pela seed + escolhas (região, campo, draft, veto); as partidas da IA são simuladas em ordem de tabela até a próxima partida do usuário, como no modo principal.

### Campo adversário: Atual × Prime
Escolhido na tela de região (padrão **Atual**), guardado em `SeasonState.field` e travado quando a liga começa. Os adversários são sempre **um elenco por time** (`fieldRosterFor(teamId, mode)`):
- **Atual**: o elenco mais recente do time nos dados (maior `year`; com mais de um no mesmo ano, o último na ordem do pool, que lista os eventos internacionais por data e depois as etapas regionais). Só o draft do usuário sorteia todas as épocas.
- **Prime** ("Modo Prime: todos os times no auge"): o elenco mais forte que o time já teve (maior `teamStrength(realLineup(entry)).total`; empate → o primeiro no pool). Nas tabelas, chaves e resultados o time aparece como "LOUD · Champions 2022", para o usuário ver qual versão enfrenta.

### Liga regional (`src/engine/league.ts`)
12 times: o usuário + 11 times distintos da região (sorteio com seed; elencos com um jogador do usuário só entram se não houver outro), seeds pela força. Dois grupos de 6 por "cobra" em potes de 2 (A = 1, 4, 5, 8, 9, 12 · B = 2, 3, 6, 7, 10, 11). Turno único em MD3 (5 séries por time, 30 no total), rodadas alternando A e B. Classificação: vitórias → saldo de mapas → saldo de rounds → seed do grupo; as colocações fecham quando os 15 jogos do grupo acabam. Os 3 primeiros de cada grupo vão aos playoffs (6 times, eliminação simples): Quartas A2 × B3 e B2 × A3 (MD3) → Semis A1 × venc. Q2 e B1 × venc. Q1 (MD3) → Decisão de 3º lugar (MD3, vale a última vaga do Masters) e Grande final (MD5). Colocações: 1º–4º pelos playoffs, 5º–6º quartas, 7º–8º os 4ºs dos grupos, 9º–10º os 5ºs, 11º–12º os 6ºs. **Os 3 primeiros vão ao Masters.**

### Masters (`src/engine/bracket.ts`)
8 times: os 3 da liga do usuário + 5 das outras regiões (2 de duas regiões e 1 da terceira; qual leva 1 é sorteado pela seed). Cada região manda os mais fortes de um sorteio de 2× o número de vagas (um Masters tem os favoritos da região, com alguma sorte). Chave de dupla eliminação de 8 reaproveitando o esqueleto dos playoffs do Champions (`PLAYOFF_BRACKET`), seeds pela força: quartas 1 × 8, 4 × 5, 2 × 7, 3 × 6; tudo MD3 e grande final MD5. Colocações como nos playoffs do Champions (7º–8º, 5º–6º, 4º, 3º, 2º, 1º). Quem joga o Masters sempre segue ao Champions, independentemente da colocação.

### Champions
16 times, 4 por região, no formato do modo principal (`createTournament`: grupos GSL + playoffs). A região do usuário manda os 4 primeiros da liga (os 3 do Masters + o 4º colocado); cada outra região manda seus times do Masters mais sorteios de times distintos para completar 4. Seeds pela força.

### Tela, fim e compartilhamento
- Início: terceiro card "Complete Trials — comece do seu servidor" e "Temporada salva" separada da "Run salva".
- Região: 4 cards (blurb, número de times e elencos, logos dos times mais presentes) e o seletor Atual/Prime.
- Hub da temporada: trilha Região → Liga → Masters → Champions (com a colocação de cada etapa), abas Liga (tabelas dos grupos com V-D, saldo de mapas e de rounds, e a chave dos playoffs), Masters (chave) e Champions (grupos GSL + chave, os mesmos componentes do modo principal), próxima partida e todas as suas partidas da temporada. Veto e série reutilizam as telas do modo principal.
- Fim: título ("Campeão!", "Vice-campeão", "Eliminado", "Eliminado na liga"), a trilha, resumo por etapa, MVP, campeão da liga/Champions e o texto para compartilhar sem spoiler, ex.: "Americas → Liga 2º → Masters 3º → Champions 🏆".

### Balanceamento (medido em `src/game/season.test.ts`, `TRIALS_REPORT=1`)
Com o drafter guloso por OVR (o mesmo do `balance.test.ts`), n = 40 por campo: **Atual**: 15% chegam ao Masters, 8% ao top 4 do Masters, 0% de título; **Prime**: 13% / 5% / 0%. Ficar entre os 3 de 12 contra elencos reais de nível internacional é bem mais duro que o top 8 de 16 do modo principal (~74%). Com agentes por mapa, flex natos e familiaridade (2026-10-20, `TRIALS_N=120`, antes → depois): **Atual** 28% / 18% / 4% → 29% / 15% / 3%; **Prime** 11% / 4% / 0% → 10% / 7% / 0%, dentro do ruído. Pendente: decidir se a liga deve ter mais vagas, um teto de elencos de elite (como `FIELD_ELITE_CAP` no modo principal) ou rerolls extras; nada no motor foi tocado.

## Modo Diário (inspirado em valdle.gg / Loldle)

Status: ideia aprovada em 2026-10-19 — guardada, ainda sem implementação.

Hub com duas abas, um desafio novo por dia, igual para todos.

### Aba "Cena Pro" (diferencial: usa nossos dados de jogadores/eventos)
1. **Pro Clássico** — adivinhar o jogador. Cada palpite compara:
   Time atual · Região · País · Função · Agente principal · Ano de estreia (↑↓) · Títulos internacionais (↑↓) · Rating de carreira (↑↓).
   🟩 igual · 🟨 parcial (mesma região/time anterior/função secundária) · 🟥 diferente · ↑↓ para números.
2. **Quem é o Pro** — linha de stats de um evento (rating, ACS, agentes); dicas reveladas a cada erro (evento → time → país).
3. **O Impostor** — 5 jogadores, um nunca jogou pelo time X.
4. **Placar Clássico** — adivinhar o placar/vencedor de uma série histórica.
5. **Elenco** — "Fnatic @ Masters Tokyo 2023": complete os 5 titulares.

### Aba "Jogo" (o jogo Valorant em si)
6. **Agente Clássico** — atributos: Função · Gênero · Origem · Ano de lançamento (↑↓) · Custo da ult (↑↓) · Tipo de utilitário (cura, flash, smoke, recon, trap...).
7. **Habilidade** — ícone (cinza/girado) → agente; bônus por acertar o nome da habilidade.
8. **Fala** — frase de voz (texto) → qual agente disse.
9. **Mapa** — imagem com zoom alto; cada erro abre o zoom. Etapa 2: acertar o callout.
10. **Callout** — minimapa com uma região destacada → nome do callout (ex.: "A Heaven", "Hookah").
11. **Arma** (opcional) — por stats (preço, dano, cadência).

### Aba "Mix" (híbridos: cena pro + jogo)
12. **Grade 3x3** — linhas e colunas com critérios mistos (time, agente principal, país, título, mapa); preencher cada célula com um pro que atenda os dois. Raridade = % de jogadores que escolheram o mesmo (precisa backend).
13. **Comp Misteriosa** — 5 agentes de uma comp histórica + mapa → adivinhar time e evento. Dicas: ano → região → placar.
14. **Quem jogou de...** — agente + mapa + partida histórica → qual pro. Sai de pick de agente por mapa (VLR).
15. **Conexões** — 16 itens (pros, agentes, mapas, callouts) em 4 grupos escondidos.
16. **Linha do Tempo** — ordenar fatos do jogo e da cena (lançamento de agente, mapa no pool, título).
17. **Maior ou Menor** — "pick rate de Viper vs Omen no Champions 2024", "rating de X vs Y".
18. **Jogada Histórica** (curada) — minimapa com posições, callout e situação de um round famoso → quem fez a jogada.
19. **Veto Quiz** — veto de uma final histórica com lacunas → completar o decider / quem escolheu.

Diário sugerido: 5 desafios por dia (2 Jogo + 2 Cena Pro + 1 Mix), rodando entre os modos.

### Mecânica comum
- Desafio por dia via seed `hash(data + modo)` sobre lista embaralhada por temporada (sem repetir em curto prazo). Reset 00:00 BRT.
- Palpites ilimitados no Clássico (pontuação = tentativas); limite de 6 nos modos de imagem.
- Sequência (streak), estatísticas pessoais, arquivo de dias passados, modo infinito após o diário.
- Compartilhar grade de emojis (🟩🟨🟥⬆️⬇️) sem spoiler.
- Integração com o jogo principal: completar o Diário dá XP/moedas, reroll extra no Draft, molduras de card.

### Dados do modo Diário
- Agentes, habilidades (ícones), mapas e callouts (com coordenadas no minimapa): valorant-api.com (comunitária, gratuita, sem chave) → snapshot local.
- Jogadores/eventos: o mesmo pipeline dos cards (VLR + Liquipedia).
- Imagens de mapa com zoom: começar pelo minimapa + callouts; screenshots próprias depois.
- MVP: resposta validada no cliente. Se houver ranking, validar no servidor.
- Jurídico: usar assets da Riot só sob a política "Legal Jibber Jabber", com aviso de não afiliação; jogo gratuito.

## Pipeline de dados (MVP)
Script offline: VLR (stats, agentes, mapas) + Liquipedia (elencos, IGL, coach, map pool) + valorant-api.com (agentes/mapas)
→ JSON estático versionado (players, cards, teams, events, maps, metaComps, agents, callouts).
Tempo real: ver docs/ideias-futuras.md (em espera).

## Roadmap
1. MVP: Draft + snapshot estático + placar VLR + card compartilhável.
2. Diário/Valdle (Jogo + Cena Pro) + Ultimate Draft — ciclo viral diário.
3. Carreira.
4. Contas + Online.

## Balanceamento (estado atual, com dados reais)
Medido em `src/game/balance.test.ts` (`BALANCE_REPORT=1 BT=12 npx vitest run src/game/balance --silent=false` imprime os números com 12 Champions por time).
- **Agentes por mapa, flex natos e familiaridade** (2026-10-20, BT=30, antes → depois): mapa +10 77% / +20 90% (igual); clássico p10/p50/p90 82,2 / 85,9 / 90,0 → 83,3 / 86,8 / 91,4; 10% piores 30% → 34% de playoffs; mediano 71% / 5% → 71% / 5%; top 10% 99% / 47% → 96% / 46%; ultimate mediano 64% / 4% → 68% / 6%, top 35% → 34%. Medido por partes (BT=12): agente e familiaridade não mexem em nada além do ruído; os flex natos sobem a força draftada (~+1, mais no topo) e levaram o título do top 10% a ~55%; a alavanca foi um piso de 2 elencos de elite por campo (`FIELD_ELITE_MIN`), que trouxe o topo de volta a 46% sem tirar do mediano (piso 3: 40% no topo, mas 4% de título no mediano; `FORM_SWING` 9 com piso 2: 43% / 4%).
- **Modelo v3** (2026-10-20, BT=30): mapa +10 → 77%, +20 → 90%; clássico p10/p50/p90 78,3 / 81,9 / 86,1, 10% piores 31% de playoffs, mediano 69% / 7% de título, top 10% 99% / 47%; ultimate mediano 64% / 4%, top 36%. Antes do v3 (BT=12): mapa 73,5% / 93%; clássico 32% · 73% / 7% · 97% / 46%; ultimate 65% / 2% · 42%. Ou seja, a forma individual, a cadeia de multikill, o encaixe de meta, a fase do torneio e a aura não mexeram no balanceamento de forma mensurável (ruído de BT=12 ≈ ±3,6 pp no título); `FORM_SWING` 10 → 8 compensou a forma individual (σ_p 0,059 → 0,067). Controle sem aura/durão/prodígio (BT=12): top 42% contra 51% com o teto de aura +2 e os mesmos seeds: a diferença (≈ 9 ± 5 pp) vinha sobretudo do durão (30% dos times do decil de cima têm um, contra 9% dos elencos da IA) e da seleção dos times pela força; o teto da aura pessoal caiu para +1 e, com BT=30, o top ficou em 47% (antes do v3: 46%). Nenhuma outra alavanca foi tocada.
- Mapa: favorito com +10 de força vence ~74–77%; com +20, ~90–93% (a economia pós-pistol, R2 87% / R3 38%, tirou ~1 pp do favorito).
- Draft clássico (drafter automático que só olha OVR): p10/p50/p90 da força 78,4 / 81,9 / 85,8. Mediano: ~74% playoffs, ~6% título; top 10%: ~46% título; 10% piores: ~32% playoffs (BT=12).
- Ultimate (BT=12): mediano ~61% playoffs / ~0% título; top 10% ~33% título.
- **Força v2** (2026-10-19): antes da troca (força v1, BT=12): mapa 75% / 94%; clássico 79,3 / 83,2 / 88,4, mediano 77% / 5%, top 44%, piores 32%; ultimate mediano 67% / 1%, top 25%. Com os pesos da pesquisa (decisão 1,4 e 0,7 por round, 2 elites por campo) o mediano caiu para 62% / 1% e o top subiu a 54% (BT=30): o drafter automático ignora o IGL, então a decisão passou a ordenar os decis (10% piores: 0% com IGL; mediano: 15%; top: 100%). Alavancas usadas: peso da decisão 1,4 → 1,0 e termo de round 0,7 → 0,5 (mediano 74% / 6%, top 52%) e depois 3 elencos de elite por campo em vez de 2 (top 46%, ultimate 33%, sem mexer no mediano). `FORM_SWING` não foi tocado porque o +10 já está em 74% (meta ≥ 72%).
- Troca da Suíça pelos grupos GSL (sem mexer no motor): o mediano clássico subiu de ~65% para ~75% de playoffs (provavelmente porque todo jogo de grupo é MD3, enquanto a Suíça tinha MD1 nas primeiras rodadas, com mais zebra); título 7% → 6%, top 10% 42% → 43%, 10% piores 30% → 31%. Como o mediano ficou no limite da meta (55–75%), as constantes do motor não mudaram.
- Alavancas usadas na troca para os dados reais: teto de química 3 → 2, forma por mapa 8 → 10 e no máximo 2 elencos de elite por campo. Antes do ajuste (dados reais, alavancas antigas): mediano 53% playoffs / 0% título, top 23% título, 10% piores 17% playoffs.
- Pendente: título do mediano um pouco abaixo da meta (8–20%). A força draftada varia pouco (p10→p90 = 9 pontos), então mais zebra levaria os 10% piores acima de 35% de playoffs antes de dar mais títulos ao mediano. Fechar isso pede mexer no draft (ex.: mais rerolls ou roleta ponderada), não no motor.
