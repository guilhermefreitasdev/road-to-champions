# Road to Champions (Valorant) — ideia base

Simulador/manager de Valorant inspirado no Road to Major (CS) e no 7a0. Monte um dream team com
jogadores históricos (card = jogador + evento, ex.: "aspas @ LOUD, Champions 2022") e vença um Champions.

## Modos
| Modo | Resumo |
|---|---|
| Draft (MVP) | Roleta time+evento → escolhe 1 jogador → slot de função (DUE/INI/CON/SEN/FLEX). 5 picks + coach, 3 rerolls. Pick'Em → Suíça (16 times) → playoffs dupla eliminação, final MD5 |
| Ultimate Draft | 5 opções fixas por pick (seed por run), sem reroll |
| Diário / Valdle | Hub de minijogos diários: Cena Pro + Jogo (detalhado abaixo) |
| Carreira | Org em liga regional (Americas/EMEA/Pacific/China): Kickoff → Stage 1 → Masters → Stage 2 → Champions. Transferências, patrocínio, base (Challengers), aura Rising→Star→Legend→GOAT |
| Online | Ranked 1v1, lobby de 8 managers (fase final, precisa backend) |

## Núcleo de simulação
- Card: atributos MIRA, ENTRADA, UTILIDADE, CLUTCH, CONSISTÊNCIA, LIDERANÇA; OVR = z-score por função/ano, ajustado por amostra e peso do evento.
- Força do time = média(OVR × encaixe de função) + composição (≥1 controlador) + química + IGL + coach + meta do mapa.
- Química: +0,5 por dupla que jogou no mesmo time e evento; +0,25 por dupla do mesmo país que não foi companheira nesse evento (cada dupla conta uma vez); máximo +3 no total. O teto é 3 (era 4) porque o OVR de um elenco real já vem de stats que ele fez junto: a química é um desempate, e um time draftado com compatriotas e algumas duplas reais chega perto do mesmo teto.
- Round a round: logística da diferença de força (escala 30 pontos) + forma do dia por mapa (até ±12 por time, σ ≈ 4) + lado + economia + ults. 13 rounds, troca no 12, OT vence por 2.
- Calibragem (medida em `src/game/balance.test.ts`): num mapa, +10 de força vence ~78% e +20 ~94%. Zebras acontecem; série e torneio ainda premiam o time mais forte.
- Veto MD3 em pool de 7 + escolha de comp por mapa. Placar estilo VLR.
- Tudo com RNG de seed (mulberry32).

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

## Balanceamento (estado atual, com dados fictícios)
Medido em `src/game/balance.test.ts` (`BALANCE_REPORT=1 npx vitest run src/game/balance` imprime os números).
- Mapa: favorito com +10 de força vence ~76%; com +20, ~95%.
- Draft clássico: time mediano chega aos playoffs em ~75–80% das runs; títulos ainda raros (~1% no mediano, ~13% no top 10%).
- Ultimate: mediano ~88% playoffs / ~13% título.
- Pendente: título no clássico abaixo da meta (8–20% no mediano). O limite está nas regras do draft + campo com superelencos fictícios (~96).
  Revisitar quando os dados reais entrarem (mais rerolls, roleta ponderada por tier ou campo com menos superelencos).
