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
- Card: atributos MIRA, ENTRADA, UTILIDADE, CLUTCH, CONSISTÊNCIA, LIDERANÇA e um OVR, todos calculados a partir dos dados reais (ver "Cards reais" abaixo).
- Força do time = média(OVR × encaixe de função) + composição (≥1 controlador) + química + IGL + coach + meta do mapa.
- IGL: +2 com exatamente um IGL, 0 com dois ou mais, −4 sem nenhum. Elenco da IA cujo IGL não está nos dados (`iglKnown: false`) fica com 0 em vez de −4; o time draftado segue a regra normal.
- Química: +0,5 por dupla que jogou no mesmo time e evento; +0,25 por dupla do mesmo país que não foi companheira nesse evento (cada dupla conta uma vez; país desconhecido não conta); máximo +2 no total. O teto caiu de 4 para 3 e depois para 2 porque o OVR de um elenco real já vem de stats que ele fez junto: a química é um desempate, e com teto 3 todo elenco da IA ganhava +3 de graça.
- Round a round: logística da diferença de força (escala 30 pontos) + forma do dia por mapa (até ±15 por time, σ ≈ 5) + lado + economia + ults. 13 rounds, troca no 12, OT vence por 2.
- Calibragem (medida em `src/game/balance.test.ts`): num mapa, +10 de força vence ~75% e +20 ~94%. Zebras acontecem; série e torneio ainda premiam o time mais forte.
- Veto MD3 em pool de 7 + escolha de comp por mapa. Placar estilo VLR.
- Tudo com RNG de seed (mulberry32).

### Cards reais (`src/data/real/cards.ts`)
Um card por linha jogador-evento do VLR, só para os 5 titulares (os 5 com mais rounds) de cada time que jogou. Nenhum número é digitado à mão: tudo sai dos JSON versionados por fórmulas fixas e determinísticas.
- **Amostra mínima**: o elenco só entra se os 5 titulares têm pelo menos 30 rounds (≈ 1,5 mapa). Isso tira 3 elencos da LOCK//IN 2023 que jogaram um mapa só (T1, DFM e RRQ); ficam 250 elencos e 1250 cards.
- **Função**: soma do % de uso de cada agente no evento por função (agentes de `src/data/game`). Empate → função dos agentes do jogador em todos os eventos (peso por rounds) → ordem fixa iniciador, controlador, sentinela, duelista. Depois, se o elenco ficou sem uma função, quem está numa função repetida e usou agentes da função que falta em pelo menos 20% dos picks no evento muda para ela (ex.: Viper/Killjoy num time com dois controladores vira sentinela). Nunca inventa uma função que ninguém jogou; 246 de 250 elencos cobrem as 4 funções.
- **Percentil no ano**: cada stat vira percentil (posição média) entre todos os titulares do mesmo ano, porque os números sobem e descem com a época. Stat ausente no VLR (ex.: Masters Shanghai 2024 não tem Rating, KAST, HS% nem clutch) conta como percentil neutro 50; o card guarda `null` e mostra "—".
- **Encolhimento por amostra**: percentil final = 50 + (p − 50) × rounds / (rounds + 60). Com 60 rounds, metade do desvio; com 400, 87%.
- **Atributos** (escala 40–99: 40 + 0,59 × percentil encolhido): Mira = HS%, KPR e ADR; Entrada = FK% − FD% (peso 0,7 para duelistas, 0,4 para os demais) e FK% (o resto); Utilidade = APR e KAST; Clutch = taxa de clutch encolhida para a média do ano como se tivesse mais 10 tentativas; Consistência = KAST e Rating.
- **Liderança** (regra, não stat): IGL marcado como capitão na Liquipedia 90; IGL só pelo perfil de carreira (infobox) 80; foi IGL de algum time em outro evento 60; os demais 45.
- **OVR** = 63 + 0,29 × percentil encolhido de desempenho + bônus. Desempenho = média de (Rating 50%, ACS 30%, KAST 20%) em percentil no ano e em percentil no ano dentro da função (um controlador não perde por ter ACS baixo). Bônus: campeão +3, vice +2, 3º–4º +1; Champions +2 (Masters e LOCK//IN 0). Resultado: mín. 68, p10 72, mediana 79, p90 87, máx. 94; os melhores jogadores dos campeões do Champions ficam no topo.
- **IGL**: `isIGL` só quando a Liquipedia dá um IGL para aquele time e evento e ele é um dos 5 titulares (casado pelo id do VLR no perfil ou pelo handle normalizado); o card guarda `iglSource`. Sem isso, o elenco fica com `iglKnown: false`.
- **Coach**: o técnico da Liquipedia. Tática = colocação do time no evento (1º 3, 2º–4º 2, 5º–8º 1, resto 0). Veto = experiência: eventos internacionais com esse técnico nos dados até aquele evento, inclusive (1 → 0, 2–3 → 1, 4–5 → 2, 6+ → 3). Elenco sem técnico não oferece coach.
- **Conforto de mapa da IA**: só dos vetos guardados daquele evento: +1 por mapa escolhido, −1 por mapa banido, limitado a ±2. Elenco sem veto guardado não tem conforto.
- **Pool do veto**: o pool do evento mais recente (pela data de início) com exatamente 7 mapas; hoje é o do Champions 2026 (Abyss, Ascent, Haven, Lotus, Split, Summit, Sunset). Atualiza sozinho quando um evento novo entra.
- **Campo do Champions**: 15 adversários de times diferentes (um elenco por time, sorteado), sem nenhum jogador do usuário, e no máximo 2 elencos "de elite" (os 20% mais fortes do pool) por campo: um Champions tem poucos favoritos.

## Formato do Champions (`src/engine/tournament.ts`)
Igual ao VCT Champions real: 16 times, fase de grupos e playoffs. Tudo MD3, menos final da chave inferior e grande final (MD5). 34 partidas no total (20 nos grupos + 14 nos playoffs).
- **Seeds**: os 16 times são ordenados pela força (o seu time incluso); seed 1 = mais forte.
- **Sorteio dos grupos (cobra por pote)**: pote 1 (seeds 1–4) vai para A, B, C, D; pote 2 (5–8) para D, C, B, A; pote 3 (9–12) para A, B, C, D; pote 4 (13–16) para D, C, B, A. Resultado: A = 1, 8, 9, 16 · B = 2, 7, 10, 15 · C = 3, 6, 11, 14 · D = 4, 5, 12, 13 (todo grupo soma 34). Determinístico, sem sorteio aleatório.
- **Grupo GSL (dupla eliminação, 5 partidas)**: Abertura 1 (seed 1 × 4 do grupo) e Abertura 2 (2 × 3) → os vencedores jogam a partida dos Vencedores (quem ganha é o 1º, classificado) e os perdedores a de Eliminação (quem perde é o 4º, eliminado) → a Decisiva junta o perdedor dos Vencedores e o vencedor da Eliminação (quem ganha é o 2º, classificado; quem perde, o 3º). Ninguém cai antes de 2 derrotas. Rótulos: "Grupo A · Abertura", "· Vencedores", "· Eliminação", "· Decisiva".
- **Ordem dos jogos**: todas as aberturas (A, B, C, D), depois Vencedores e Eliminação, depois as decisivas; os playoffs só começam quando os 4 grupos terminam.
- **Playoffs (8 times, dupla eliminação sem reset)**: cada 1º enfrenta o 2º de outro grupo nas quartas, e cada metade da chave tem um time de cada grupo: metade 1 = A1 × B2 e C1 × D2; metade 2 = B1 × A2 e D1 × C2. Times do mesmo grupo só se reencontram na final superior, na chave inferior a partir da rodada 2 ou na grande final. A rodada 2 da inferior cruza as metades para não repetir as quartas.
- **Colocação de quem cai nos grupos**: 3º do grupo = 9º–12º; 4º = 13º–16º. Nos playoffs: 7º–8º (inferior R1), 5º–6º (R2), 4º (R3), 3º (final inferior), 2º (grande final).
- **Na tela**: aba "Grupos" com cada grupo desenhado como chave GSL (Abertura → Vencedores → Classificado ✔ em cima, Eliminação → Decisiva → Classificado ✔ embaixo) e a tabela 1º–4º; no celular um grupo por vez (começa no seu), no desktop os quatro em 2×2 com o seu primeiro. Aba "Playoffs" com a chave completa (superior em cima, inferior embaixo, grande final à direita), linhas de ligação, placares e MD3/MD5; vagas vazias dizem de onde vem o time ("1º Grupo A", "Vencedor Quartas 1"). No celular a chave rola para o lado dentro da caixa, nunca a página. Para leitor de tela cada partida tem um resumo falado e "Ver série" é alcançável pelo teclado.
- Saves do formato antigo (Suíça) são descartados (RunState v3, chave `rtc:run:v3`).

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
- Mapa: favorito com +10 de força vence ~75%; com +20, ~94%.
- Draft clássico (drafter automático que só olha OVR): p10/p50/p90 da força 79,3 / 83,2 / 88,4. Mediano: ~75% playoffs, ~6% título; top 10%: ~43% título; 10% piores: ~31% playoffs (BT=30).
- Ultimate (BT=12): mediano ~67% playoffs / ~1% título; top 10% ~25% título.
- Troca da Suíça pelos grupos GSL (sem mexer no motor): o mediano clássico subiu de ~65% para ~75% de playoffs (provavelmente porque todo jogo de grupo é MD3, enquanto a Suíça tinha MD1 nas primeiras rodadas, com mais zebra); título 7% → 6%, top 10% 42% → 43%, 10% piores 30% → 31%. Como o mediano ficou no limite da meta (55–75%), as constantes do motor não mudaram.
- Alavancas usadas na troca para os dados reais: teto de química 3 → 2, forma por mapa 8 → 10 e no máximo 2 elencos de elite por campo. Antes do ajuste (dados reais, alavancas antigas): mediano 53% playoffs / 0% título, top 23% título, 10% piores 17% playoffs.
- Pendente: título do mediano um pouco abaixo da meta (8–20%). A força draftada varia pouco (p10→p90 = 9 pontos), então mais zebra levaria os 10% piores acima de 35% de playoffs antes de dar mais títulos ao mediano. Fechar isso pede mexer no draft (ex.: mais rerolls ou roleta ponderada), não no motor.
