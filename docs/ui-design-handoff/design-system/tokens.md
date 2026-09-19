# Design tokens

## Colour
| Token | Value | Use |
|---|---|---|
| workspace background | `#e9eff5` | page canvas |
| surface | `#ffffff` | cards, panels |
| surface subtle | `#f6f9fb` | fact cards inside detail panel |
| surface head | `#fafcfd` | table header row |
| row hover | `#f3f8fb` | table row hover |
| row selected | `#f1f9fc` + `inset 3px 0 0 #54c3e0` | selected row |
| rail gradient | `linear-gradient(180deg,#071d2c,#0b2b3a)` | sidebar |
| rail icon | `#8eb3c0`; hover bg `#103a4b`, hover ink `#e9f8fa` | nav icons |
| rail active | bg `#ffffff`, ink `#12637f`, edge `#54c3e0` | active nav item |
| header band | `linear-gradient(100deg,#1266a5 0%,#2b8fc7 52%,#54c3e0 100%)` | page header |
| ink strong | `#123a4c` / `#12394a` / `#193949` | titles, row titles |
| ink body | `#486774` | table text |
| ink muted | `#718996` / `#718a95` | sub-labels |
| ink meta | `#5f7f8c` | mono uppercase labels |
| ink faint | `#8aa3ad` | IDs, chevrons |
| divider | `#eef2f5`; page rule `#dde6ec`; input border `#dde6ec` | rules |
| link | `#1c7595` (hover `#0e4f6c`); destructive link `#a9564d` | inline actions |
| primary button | `#1266a5` (hover `#0e527e`), ink `#fff` | detail panel primary |
| danger | `#a9453c` (hover `#8d382f`) | delete |

### Status pill tones
| Tone | Background | Ink | Applied to |
|---|---|---|---|
| green | `#e8f5ee` | `#25795a` | Completed, Active, Available, Excellent, Good, In Port, Stored, Received, Low risk, Surveyed |
| blue | `#e5f3fa` | `#16617e` | In Progress, Deployed, At Sea, At Depth, Sealed, Collected, Open, Nominal |
| amber | `#fbf2e2` | `#8a6224` | Maintenance, Pending, Scheduled, Fair, Moderate, Medium, In Transit, Due Soon, Warning |
| red | `#fdeceb` | `#a9453c` | High, Critical, Urgent, Replace, Aborted, Overdue |
| grey | `#eef2f5` | `#5b7381` | Planned, Cancelled, Retired, Unassigned, Released, Disposed, None |

## Type
- Display / headings: **Sora** 700, `letter-spacing:-.03em` to `-.045em`
- UI text: **Manrope** 400/500/600/700/800
- Metadata, IDs, numerics, timestamps: **IBM Plex Mono** 400/500

| Role | Size / weight |
|---|---|
| page title (h1) | 36px Sora 700, `-.045em` |
| page description | 12.5px Manrope 500 |
| eyebrow | 10px mono 500, `.11em`, uppercase |
| card title (h2) | 19px Sora 700, `-.03em` (17px on reference cards, 16px on state cards) |
| KPI value | 34px Sora 700, `-.04em` |
| KPI label | 9.5px mono 500, `.1em`, uppercase |
| KPI note | 10.5px Manrope 500 |
| table head | 9.5px mono 500, `.1em`, uppercase |
| row title | 13.5px Manrope 700 |
| row sub | 10.5px Manrope 500 |
| row text | 11.5px Manrope 500 |
| row numeric | 11.5px mono |
| row timestamp | 10px mono |
| row id | 10.5px mono |
| pill | 10px Manrope 700 (9.5px in detail-panel lists) |
| inline action link | 11.5px Manrope 700 |

## Spacing
Page gap 14px · card header `18px 22px 12px` · table head `8px 22px` · row `11px 12px`
(compact 7px 12px) · KPI card `16px 18px` · detail fact card `11px 12px` · detail body `0 22px 18px`
· pagination bar `11px 22px` · rail `clamp(12px,2.4vh,26px)` top, item gap `clamp(8px,2.2vh,26px)`.

## Radius
16 panels · 15 rail avatar tiles · 14 KPI cards and KPI icon tiles · 12 rail icons and state blocks ·
11 row icon tiles · 10 interior rows, buttons, fact cards · 9 inputs and pager buttons · 999 pills and
header controls · 0 the rail itself and the header band.

## Elevation and borders
- Panel: `0 8px 22px rgba(23,53,68,.07)`
- KPI card: `0 6px 18px rgba(23,53,68,.06)`
- Header band: `0 12px 30px rgba(17,91,135,.22)`
- Rail: `10px 0 30px rgba(8,39,57,.16)`
- Header search pill: `0 8px 20px rgba(6,48,76,.18)`
- Cards carry **no border** — separation is shadow plus the `#e9eff5` canvas. Rules inside cards are 1px `#eef2f5`.

## Motion
- Entrance: `afIn` — 12px rise + fade, `.5s ease`, staggered `.06s` per card (header 0s, KPIs .06–.24s, panels .30/.36s).
- KPI bars: `afGrow` — `scaleX(0→1)`, `.8s cubic-bezier(.2,.7,.2,1)`, delay .30s+.
- Hover transitions: background/colour 150–170ms ease; header button also `translateY(-2px)`.
- Skeleton: `afPulse` opacity .45↔1, 1.4s ease infinite, 0.1s stagger.
