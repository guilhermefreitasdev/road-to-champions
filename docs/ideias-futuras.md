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
