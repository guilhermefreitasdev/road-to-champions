# Road to Champions (Valorant) — ideia base

Simulador/manager de Valorant inspirado no Road to Major (CS) e no 7a0. Monte um dream team com
jogadores históricos (card = jogador + evento, ex.: "aspas @ LOUD, Champions 2022") e vença um Champions.

## Modos
| Modo | Resumo |
|---|---|
| Draft (MVP) | Roleta time+evento → escolhe 1 jogador → slot de função (DUE/INI/CON/SEN/FLEX). 5 picks + coach, 3 rerolls. Champions de 16 times: 4 grupos GSL (A–D) → playoffs dupla eliminação, final MD5 (ver "Formato do Champions") |
| Ultimate Draft | 5 opções fixas por pick (seed por run), sem reroll |
| Diário / Valdle | Hub de minijogos diários: Cena Pro + Jogo (detalhado abaixo) |
| Carreira | Org em liga regional (Americas/EMEA/Pacific/China): Kickoff → Stage 1 → Masters → Stage 2 → Champions. Transferências, patrocínio, base (Challengers), aura Rising→Star→Legend→GOAT |
| Online | Ranked 1v1, lobby de 8 managers (fase final, precisa backend) |

## Núcleo de simulação
- Card: atributos MIRA, ENTRADA, UTILIDADE, CLUTCH, CONSISTÊNCIA, DECISÃO e um OVR, todos calculados a partir dos dados reais (ver "Cards reais" abaixo).
- Força do time (Modelo v2, abaixo) = base (média de OVR × encaixe de função) + composição + cinco dimensões explicáveis: Mecânica, Utilidade, Tomada de decisão (IGL + coach), Comunicação (química) e Clutch.
- Round a round: logística da diferença de força (escala 30 pontos) + forma do dia por mapa (até ±15 por time, σ ≈ 5) + lado + economia pós-pistol + termos de decisão e clutch por contexto. 13 rounds, troca no 12, OT vence por 2.
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
- **Composição**: sem controlador −8, sem iniciador −3, sem duelista −2, **sem sentinela 0** (19% das composições de elite jogam sem e vencem igual; pesquisa 4.1). Encaixe de função segue 1 / 0,9 flex / 0,75 fora.
- Tela "Seu time": base e composição em pontos, as cinco barras com valor, pontos e marca da referência, as notas de cada uma (IGL com fonte, segunda voz, coach com "cobre parte da tática, mas não faz calls durante o round") e avisos em destaque ("Sem IGL: Tomada de decisão −25% (máx. 55) — força ≈ −X…", "Dois IGLs…", "Sem controlador…").

### Round v2 (`src/engine/match.ts`)
Só as mudanças baratas e bem apoiadas pela pesquisa (seção 3):
- **Economia pós-pistol**: o vencedor do pistol ganha +57 pontos no round 2 (anti-eco: 87% real, medido 87% no motor) e −15 no round 3 (round bônus: 38% real, 36% no motor). Antes era +6 só no round 2 (~55%). Nada de embalo além disso (full × full repete o vencedor em 49,9%). Quem vence os dois pistols leva o mapa em 76% (real 70%); prorrogação em 14% dos mapas (real 13,6%).
- **Decisão por contexto**: em todo round com arma (compra depois de derrota, pós-plant, retake), 0,5 ponto a cada 10 de diferença na Tomada de decisão; ×1,25 no 2º mapa da série e ×1,5 do 3º em diante (adaptação e anti-strat, `MapOptions.seriesMap`, passado por `simulateSeries`); ×1,5 na prorrogação (cada round de OT reinicia a economia).
- **Clutch na prorrogação**: 0,5 ponto a cada 10 de diferença na dimensão Clutch, só nos rounds de OT. O simulador de kills roda depois do resultado do round, então "clutch em desvantagem numérica" ficou de fora (a cadeia de duelos, Opção B da pesquisa, é trabalho futuro).

### Cards reais (`src/data/real/cards.ts`)
Um card por linha jogador-evento do VLR, só para os 5 titulares (os 5 com mais rounds) de cada time que jogou. Nenhum número é digitado à mão: tudo sai dos JSON versionados por fórmulas fixas e determinísticas.
- **Amostra mínima**: o elenco só entra se os 5 titulares têm pelo menos 30 rounds (≈ 1,5 mapa). Isso tira 3 elencos da LOCK//IN 2023 que jogaram um mapa só (T1, DFM e RRQ); ficam 250 elencos e 1250 cards.
- **Função**: soma do % de uso de cada agente no evento por função (agentes de `src/data/game`). Empate → função dos agentes do jogador em todos os eventos (peso por rounds) → ordem fixa iniciador, controlador, sentinela, duelista. Depois, se o elenco ficou sem uma função, quem está numa função repetida e usou agentes da função que falta em pelo menos 20% dos picks no evento muda para ela (ex.: Viper/Killjoy num time com dois controladores vira sentinela). Nunca inventa uma função que ninguém jogou; 246 de 250 elencos cobrem as 4 funções.
- **Percentil no ano**: cada stat vira percentil (posição média) entre todos os titulares do mesmo ano, porque os números sobem e descem com a época. Stat ausente no VLR (ex.: Masters Shanghai 2024 não tem Rating, KAST, HS% nem clutch) conta como percentil neutro 50; o card guarda `null` e mostra "—".
- **Encolhimento por amostra**: percentil final = 50 + (p − 50) × rounds / (rounds + 60). Com 60 rounds, metade do desvio; com 400, 87%.
- **Atributos** (escala 40–99: 40 + 0,59 × percentil encolhido): Mira = HS%, KPR e ADR; Entrada = FK% − FD% (peso 0,7 para duelistas, 0,4 para os demais) e FK% (o resto); Utilidade = APR e KAST; Clutch = taxa de clutch encolhida para a média do ano como se tivesse mais 10 tentativas; Consistência = KAST e Rating.
- **Decisão** (regra sobre fatos, não stat): IGL marcado como capitão na Liquipedia 90; IGL só pelo perfil de carreira (infobox) 80. Quem não é o IGL do evento parte de 60 (foi IGL de outro elenco nos dados) ou 45, ± até 5 pelo percentil encolhido de APR e KAST (as stats em que o IGL se destaca: assistências e ficar vivo); stat ausente não mexe. A UI diz que é escala do jogo, não estatística.
- **OVR** = 63 + 0,29 × percentil encolhido de desempenho + bônus. Desempenho = média de (Rating 50%, ACS 30%, KAST 20%) em percentil no ano e em percentil no ano dentro da função (um controlador não perde por ter ACS baixo). Bônus: campeão +3, vice +2, 3º–4º +1; Champions +2 (Masters e LOCK//IN 0). Resultado: mín. 68, p10 72, mediana 79, p90 87, máx. 94; os melhores jogadores dos campeões do Champions ficam no topo.
- **IGL**: `isIGL` só quando a Liquipedia dá um IGL para aquele time e evento e ele é um dos 5 titulares (casado pelo id do VLR no perfil ou pelo handle normalizado); o card guarda `iglSource`. Sem isso, o elenco fica com `iglKnown: false`.
- **Coach**: o técnico da Liquipedia. Tática = colocação do time no evento (1º 3, 2º–4º 2, 5º–8º 1, resto 0); entra como 15% da Tomada de decisão (40 + 20 × tática), não como pontos fixos. Veto = experiência: eventos internacionais com esse técnico nos dados até aquele evento, inclusive (1 → 0, 2–3 → 1, 4–5 → 2, 6+ → 3). Elenco sem técnico não oferece coach.
- **Conforto de mapa da IA**: só dos vetos guardados daquele evento: +1 por mapa escolhido, −1 por mapa banido, limitado a ±2. Elenco sem veto guardado não tem conforto.
- **Pool do veto**: o pool do evento mais recente (pela data de início) com exatamente 7 mapas; hoje é o do Champions 2026 (Abyss, Ascent, Haven, Lotus, Split, Summit, Sunset). Atualiza sozinho quando um evento novo entra.
- **Campo do Champions**: 15 adversários de times diferentes (um elenco por time, sorteado), sem nenhum jogador do usuário, e no máximo 3 elencos "de elite" (os 20% mais fortes do pool) por campo (era 2 até a força v2): um Champions tem poucos favoritos.

## Formato do Champions (`src/engine/tournament.ts`)
Igual ao VCT Champions real: 16 times, fase de grupos e playoffs. Tudo MD3, menos final da chave inferior e grande final (MD5). 34 partidas no total (20 nos grupos + 14 nos playoffs).
- **Seeds**: os 16 times são ordenados pela força (o seu time incluso); seed 1 = mais forte.
- **Sorteio dos grupos (cobra por pote)**: pote 1 (seeds 1–4) vai para A, B, C, D; pote 2 (5–8) para D, C, B, A; pote 3 (9–12) para A, B, C, D; pote 4 (13–16) para D, C, B, A. Resultado: A = 1, 8, 9, 16 · B = 2, 7, 10, 15 · C = 3, 6, 11, 14 · D = 4, 5, 12, 13 (todo grupo soma 34). Determinístico, sem sorteio aleatório.
- **Grupo GSL (dupla eliminação, 5 partidas)**: Abertura 1 (seed 1 × 4 do grupo) e Abertura 2 (2 × 3) → os vencedores jogam a partida dos Vencedores (quem ganha é o 1º, classificado) e os perdedores a de Eliminação (quem perde é o 4º, eliminado) → a Decisiva junta o perdedor dos Vencedores e o vencedor da Eliminação (quem ganha é o 2º, classificado; quem perde, o 3º). Ninguém cai antes de 2 derrotas. Rótulos: "Grupo A · Abertura", "· Vencedores", "· Eliminação", "· Decisiva".
- **Ordem dos jogos**: todas as aberturas (A, B, C, D), depois Vencedores e Eliminação, depois as decisivas; os playoffs só começam quando os 4 grupos terminam.
- **Playoffs (8 times, dupla eliminação sem reset)**: cada 1º enfrenta o 2º de outro grupo nas quartas, e cada metade da chave tem um time de cada grupo: metade 1 = A1 × B2 e C1 × D2; metade 2 = B1 × A2 e D1 × C2. Times do mesmo grupo só se reencontram na final superior, na chave inferior a partir da rodada 2 ou na grande final. A rodada 2 da inferior cruza as metades para não repetir as quartas.
- **Colocação de quem cai nos grupos**: 3º do grupo = 9º–12º; 4º = 13º–16º. Nos playoffs: 7º–8º (inferior R1), 5º–6º (R2), 4º (R3), 3º (final inferior), 2º (grande final).
- **Na tela**: aba "Grupos" com cada grupo desenhado como chave GSL (Abertura → Vencedores → Classificado ✔ em cima, Eliminação → Decisiva → Classificado ✔ embaixo) e a tabela 1º–4º; no celular um grupo por vez (começa no seu), no desktop os quatro em 2×2 com o seu primeiro. Aba "Playoffs" com a chave completa (superior em cima, inferior embaixo, grande final à direita), linhas de ligação, placares e MD3/MD5; vagas vazias dizem de onde vem o time ("1º Grupo A", "Vencedor Quartas 1"). No celular a chave rola para o lado dentro da caixa, nunca a página. Para leitor de tela cada partida tem um resumo falado e "Ver série" é alcançável pelo teclado.
- Saves do formato antigo (Suíça) são descartados (RunState v3); o Modelo v2 da força subiu para v4 (chave `rtc:run:v4`).

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
- Mapa: favorito com +10 de força vence ~74%; com +20, ~93% (a economia pós-pistol, R2 87% / R3 38%, tirou ~1 pp do favorito).
- Draft clássico (drafter automático que só olha OVR): p10/p50/p90 da força 78,4 / 81,9 / 85,8. Mediano: ~74% playoffs, ~6% título; top 10%: ~46% título; 10% piores: ~32% playoffs (BT=12).
- Ultimate (BT=12): mediano ~61% playoffs / ~0% título; top 10% ~33% título.
- **Força v2** (2026-10-19): antes da troca (força v1, BT=12): mapa 75% / 94%; clássico 79,3 / 83,2 / 88,4, mediano 77% / 5%, top 44%, piores 32%; ultimate mediano 67% / 1%, top 25%. Com os pesos da pesquisa (decisão 1,4 e 0,7 por round, 2 elites por campo) o mediano caiu para 62% / 1% e o top subiu a 54% (BT=30): o drafter automático ignora o IGL, então a decisão passou a ordenar os decis (10% piores: 0% com IGL; mediano: 15%; top: 100%). Alavancas usadas: peso da decisão 1,4 → 1,0 e termo de round 0,7 → 0,5 (mediano 74% / 6%, top 52%) e depois 3 elencos de elite por campo em vez de 2 (top 46%, ultimate 33%, sem mexer no mediano). `FORM_SWING` não foi tocado porque o +10 já está em 74% (meta ≥ 72%).
- Troca da Suíça pelos grupos GSL (sem mexer no motor): o mediano clássico subiu de ~65% para ~75% de playoffs (provavelmente porque todo jogo de grupo é MD3, enquanto a Suíça tinha MD1 nas primeiras rodadas, com mais zebra); título 7% → 6%, top 10% 42% → 43%, 10% piores 30% → 31%. Como o mediano ficou no limite da meta (55–75%), as constantes do motor não mudaram.
- Alavancas usadas na troca para os dados reais: teto de química 3 → 2, forma por mapa 8 → 10 e no máximo 2 elencos de elite por campo. Antes do ajuste (dados reais, alavancas antigas): mediano 53% playoffs / 0% título, top 23% título, 10% piores 17% playoffs.
- Pendente: título do mediano um pouco abaixo da meta (8–20%). A força draftada varia pouco (p10→p90 = 9 pontos), então mais zebra levaria os 10% piores acima de 35% de playoffs antes de dar mais títulos ao mediano. Fechar isso pede mexer no draft (ex.: mais rerolls ou roleta ponderada), não no motor.
