# Road to Champions — UI/UX audit (before polish)

Sources: **WDG** = `web-design-guidelines` (Vercel Web Interface Guidelines, offline copy);
**UPM** = `ui-ux-pro-max` (searched: `--design-system "esports gaming dark competitive tournament"`,
`--domain typography "esports gaming condensed"`, `--domain color "gaming dark esports"`,
`--domain ux` for color-only / reduced-motion / loading feedback / cancellable transitions);
**IMP** = `impeccable` (context + `polish` playbook + craft floor).
Evidence: `ui-before/{390,1280}-*.png` (full classic run, images from media.valorant-api.com blocked).

Score = impact (1–3) × ease (1–3). Implemented items marked [x].

| # | Finding | Source | Impact | Ease | Score |
|---|---------|--------|--------|------|-------|
| 1 | [x] **Draft: first roll within 600 ms of page load is silently ignored** (`lastSpin = useRef(0)` vs `performance.now()`), the button looks dead. | IMP polish §3.1 (broken task) | 3 | 3 | 9 |
| 2 | [x] **Veto: opponent's ban/pick lands instantly in the same frame as yours**; no "opponent thinking" state, you can't tell which map they took. | UPM ux "Loading feedback" / "Instant state changes (0ms)" anti-pattern | 3 | 2 | 6 |
| 3 | [x] **Veto: ban / pick / decider distinguished mostly by color** (4px colored border-left on steps; red/green/gold status text). | UPM ux "Color Only" (High); IMP craft floor bans colored border-left >1px | 3 | 3 | 9 |
| 4 | [x] **Primary button contrast 3.36:1** (white on #ff4655, 16px text). `--muted` on `--surface-2` 4.38:1. | UPM §1 contrast 4.5:1; IMP craft floor contrast | 3 | 3 | 9 |
| 5 | [x] **Draft: two-step selection unclear.** One muted hint line; selected card only gets a red border; the sticky slot picker floats over the middle of the card list with no "step 2", no cancel, fit is color-coded borders. | UPM "Selected state indicator", "Color Only"; IMP polish "current state obvious" | 3 | 2 | 6 |
| 6 | [x] **Draft: roll has no reveal**; the team/event just appears. Needs a short, skippable moment honoring reduced motion. | UPM ux "Reduced Motion", "Cancellable State Transitions"; IMP craft floor "one authored moment" | 2 | 2 | 4 |
| 7 | [x] **Desktop: 900px column at 1280px**; hub is a single long column (next match, then 16-row table), draft cards 3-up with empty right space. | UPM §5 layout; IMP polish "verify every viewport" | 3 | 2 | 6 |
| 8 | [x] **User team marked by color + CSS `::after` "(você)"** in the bracket (pseudo-content is unreliable for AT); scoreboards/series header don't mark the user at all. | UPM "Color Only"; WDG "semantic HTML before ARIA" | 2 | 3 | 6 |
| 9 | [x] **End screen is flat**: champion title uses an emoji 🏆 as icon, no stage-reached context, share buried under the match list. | IMP craft floor (emoji as icon); UPM checklist "No emojis as icons"; IMP "coverage: primary task findable within seconds" | 3 | 2 | 6 |
| 10 | [x] **Image failure looks broken**: agent icons render as empty dark circles while blocked/loading (fallback only after `onError`), map tiles are identical grey slabs. | WDG images; UPM §3 reserve space; brief (sandbox blocks media.valorant-api.com) | 2 | 3 | 6 |
| 11 | [x] **Display type is the platform sans** with uppercase headings; no type scale tokens. UPM pairing "Sports/Fitness" (Barlow Condensed display + system body) fits VLR/esports scanning of numbers and needs one Google Font. | UPM typography; IMP craft floor (system display face) | 2 | 3 | 6 |
| 12 | [x] **Kicker/eyebrow above every heading** (mode, match label). | IMP craft floor ban (eyebrow) | 1 | 3 | 3 |
| 13 | [x] Missing `theme-color`, `color-scheme` on `<html>`, `touch-action: manipulation`, tap-highlight, themed `::selection`/scrollbars, `text-wrap: balance` on headings. | WDG dark mode / touch / typography; IMP "browser surfaces" | 1 | 3 | 3 |
| 14 | [x] Hover states missing on secondary/result/coach buttons; no `prefers-reduced-motion` block at all. | WDG hover states, animation | 2 | 3 | 6 |
| 15 | [x] Home: modes are two identical red buttons with captions below (weak hierarchy, caption outside hit target). | UPM §2 touch targets; IMP polish hierarchy | 2 | 3 | 6 |
| 16 | [x] No skip link to main content. | WDG accessibility | 1 | 3 | 3 |
| 17 | [ ] URL does not reflect screen/tab state (no deep links). | WDG navigation & state | 1 | 1 | 1 — deferred (state machine + saved run; not worth a router now) |
| 18 | [ ] Round strip in scoreboards is color-only per round (has legend + aria-label summary). | UPM "Color Only" | 1 | 2 | 2 — deferred |
| 19 | [ ] Team name input: no `name`, placeholder without example pattern / ellipsis. | WDG forms | 1 | 3 | 3 — `name` + `spellCheck` added; placeholder kept (it is the real default) |

## Design direction kept (refinement, not redesign)
- Incumbent Valorant-like palette kept (navy + red #ff4655). UPM's "Gaming" palette (neon purple + rose) was rejected:
  it fights the product's identity; only its structure (on-accent ink, ring, muted fg) informed the token cleanup.
- UPM design-system "3D & Hyperrealism / WebGL" rejected for a data-heavy Operate surface on phones (perf + a11y risk the tool itself flags).
- Motion budget (UPM "Excessive Motion": 1–2 key elements per view): roulette reveal on Draft, champion title on End. Everything else is state transitions ≤200 ms.

## Verification (after)
- `impeccable detect` on src/ui + index.html: 1 warning (tab underline flagged as "border accent on rounded"), fixed by using an inset shadow; rerun clean (`[]`).
- `npm test` 194 passed (1 new: finish stage selector); `npm run build` ok.
- Playwright full classic run at 390x844 and 1280x800 without SPIN_WAIT (first-roll bug fixed), no page/console errors except blocked media.valorant-api.com images, no horizontal overflow.
- extra.mjs: champion end screen and playoffs hub from saved runs; keyboard veto (Enter twice = one action, "está escolhendo…" status, opponent answers after delay); tabs switch with arrow keys; reduced motion skips the roulette reveal; Escape closes the slot picker.
