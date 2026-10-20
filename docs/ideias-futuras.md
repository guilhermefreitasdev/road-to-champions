# Road to Champions (Valorant) — ideias guardadas para depois

## Dados em tempo real (EM ESPERA, não implementar ainda)

Status: decidido em 2026-10-19 deixar para depois. MVP usa snapshot estático gerado manualmente.

### Nível 1 — Dados sempre atualizados (recomendado quando retomar)
- Cron (GitHub Actions / Cloudflare Cron / Vercel Cron): a cada 1–6h; 15 min em semana de evento.
- Coletores VLR (stats/partidas) + Liquipedia (elencos, IGL, coach, map pool), com cache incremental.
- Banco (Postgres/Supabase) → recalcula OVR/atributos/aura → publica snapshot versionado (ex.: data-2026.10.19) em CDN.
- Cliente lê um manifest e baixa o snapshot mais novo.
- Regra: cada run fica presa à versão de dados com que começou (seed, Daily e ranked reproduzíveis e justos).
- Features: cards da temporada atual, Daily gerado de partidas de ontem, "card em alta" da semana, Pick'Em do evento real.

### Nível 2 — Ao vivo durante a partida
- Oficial: Riot distribui dados ao vivo só via GRID, para uso comercial e pago.
- Não oficial: vlrggapi `/match?q=live_score` traz só o placar, sem licença comercial e frágil.
- Viável sem GRID: modo ao vivo só com placar (consulta a cada 30–60s → Supabase Realtime/SSE).

### Regras
- O cliente nunca chama VLR/Liquipedia direto; sempre passar pelo backend com cache.
- Liquipedia LPDB: chave aprovada, 60 req/h, sem raspar HTML, crédito CC-BY-SA, planos comerciais.
- Liquipedia MediaWiki API: 1 req/2s, User-Agent identificado.
- VLR: sem API oficial; contatar o site se o jogo crescer.

### Fases
1. MVP: snapshot estático manual.
2. Se animarem: atualização agendada + Daily de partidas reais.
3. Se virar negócio: GRID + plano comercial da Liquipedia → modo ao vivo de verdade.

## Aba "Outros modos" (Valdle IMPLEMENTADO em 2026-10-20)

Decisão do dono (20/10/2026): o Valdle sai do jogo principal e vira uma aba "Outros modos", em duas versões
criativas e separadas:
- **Cena pro**: tudo sobre o cenário e os pros (Pro Clássico, Quem jogou de…, Comp Misteriosa, Grade 3x3, Conexões,
  Linha do Tempo, Veto Quiz — a lista antiga estava em `docs/design.md`; o Diário implementado em 2026-10-20 ficou só com
  4 desafios da cena pro: Linhas Históricas, Quem é o Pro, O Impostor e Placar Clássico).
- **Jogo clássico**: só o Valorant em si (Agente Clássico, Habilidade, Fala, Mapa, Callout, Arma).

**Status (2026-10-20): o Valdle está implementado** — ver "Outros modos" em `docs/design.md`. Cena pro: Pro Clássico,
Grade 3x3, Conexões e Comp Misteriosa. Jogo clássico: Agente Clássico, Habilidade, Mapa, Callout e Arma. Ficaram de fora:
Fala (o valorant-api.com não tem falas: `voiceLine` nulo), Quem jogou de…, Linha do Tempo e Veto Quiz (ideias ainda
abertas). "Acerte o ace" foi feito e removido no mesmo dia (abaixo).

### "Acerte o ace" (ideia do dono; implementado e REMOVIDO em 2026-10-20)
Implementado em 2026-10-20 (vídeo do YouTube embutido na página, adivinhar de quem é o ace) e removido no mesmo dia por
decisão do dono: todo embed do YouTube entregava a resposta (título e canal ao começar e ao passar o mouse, o nome do pro
no killfeed e a narração dos casters), e nenhum outro host é aceitável (os clipes da Twitch também mostram título e
canal; reenviar trechos da transmissão não é permitido). O código completo (41 aces conferidos no VLR, lógica e
interface) pode ser recuperado do commit `a07456b`. Só voltar a isto se aparecer uma fonte de clipes sem spoiler.

### "Ouça a arma" (ideia; NÃO feito, 2026-10-20)
Adivinhar a arma pelo som do tiro e pelo desenho do spray. Não feito: a VALORANT Wiki não tem o tiro único das armas
padrão (só 4 sons de inspeção da skin Spectrum, ver `scripts/wiki/out/weapon-audio-candidates.json`), nenhuma outra
fonte licenciada foi encontrada e a Riot nunca publicou o recuo bala a bala (o recuo é em parte aleatório por design),
então o spray teria de ser inventado. Retomar se aparecer uma fonte.
