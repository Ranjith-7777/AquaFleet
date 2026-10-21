# Shared components

Values below are exact. Where a component already exists in the live Research Vessels page, extract it from
there rather than re-authoring it.

## 1. Sidebar rail
`flex:0 0 100px`, gradient `180deg #071d2c → #0b2b3a`, shadow `10px 0 30px rgba(8,39,57,.16)`, radius 0.
Contents: 52px brand tile (radius 16, bg `#0c3545`, 1px `rgba(123,203,222,.38)`, glyph `≈` 26px `#a8e2ed`);
centred icon group; footer with 46px user tile (`TU`, radius 15, bg `#124257`) and 46px DB-health tile
(9px dot `#4ac780` with `0 0 0 5px rgba(74,199,128,.14)`).

**Nav item** — 56×50, radius 12, glyph 23px `#8eb3c0`; hover bg `#103a4b`, ink `#e9f8fa`.
**Active item** — 100%×56 white rectangle, radius 0, no shadow, 4px `#54c3e0` left edge, glyph 24px `#12637f` 700.

Six groups: `⌁` Dashboard · `◇` Fleet & Crew · `◎` Missions · `⊞` Expeditions · `◉` Vehicles · `▤` Reports.

## 2. Page header band
Full-bleed: `margin:-22px -24px 4px -126px; padding:18px 30px 18px 148px; min-height:126px`, gradient
`100deg #1266a5 0% → #2b8fc7 52% → #54c3e0 100%`, shadow `0 12px 30px rgba(17,91,135,.22)`, radius 0.
Decorative ring: absolute 240px circle, `top:-104px; right:26%`, 1px `rgba(255,255,255,.18)` plus two
spread shadows — the only ornament in the system.

Left block: eyebrow (10px mono, `#d4eef3`) → h1 (36px Sora, `#fff`) → description (12.5px, `#e2f4f8`).
Right block: search pill · record count · primary action.

**Search pill** — 300×48, radius 999, white, shadow `0 8px 20px rgba(6,48,76,.18)`, `⌕` glyph `#327f97`,
borderless 13px input.
**Record count** — stacked mono: 9px uppercase `#cde8ef` label over 11px `#fff` value, `nowrap`.
**Primary action** — height 48, radius 999, `rgba(255,255,255,.14)` on 1px `rgba(255,255,255,.67)`, white
12px 700 label with a leading glyph, `nowrap`; hover `#f0fbfd` bg, `#0c526f` ink, `translateY(-2px)`.

## 3. Section tabs
Row of text links on the page background, 18px gap, bottom rule 1px `#dde6ec`, `padding:0 0 9px` per item.
Active: `#12637f` 700 with `inset 0 -2px 0 #2b8fc7`. Inactive: `#65818e` 600, hover `#12637f`.
Used to move between sibling pages of a rail group (e.g. Vessels · Marine Zones · Offshore Assets · Operators).

## 4. KPI card
`padding:16px 18px`, white, radius 14, shadow `0 6px 18px rgba(23,53,68,.06)`, 14px gap row:
44px tinted icon tile (radius 14) + text column (label / 34px value / note / 6px progress bar).
Bar track `#e8eff3`, radius 99, fill `linear-gradient(90deg,...)` with `afGrow`.
Icon tints cycle: `#e7f4f9/#1c7595`, `#e6f5f1/#1f7f72`, `#e8f1fb/#1a5f97`, back to the first.

## 5. Register card (table panel)
White, radius 16, shadow `0 8px 22px rgba(23,53,68,.07)`, `overflow:hidden`, column flex, `min-width:520px`.
- **Card header**: h2 19px Sora + optional segmented filter + right-aligned mono count (`N of M shown`).
- **Table head**: CSS grid, 12px gap, `padding:8px 22px`, bg `#fafcfd`, 1px `#eef2f5` top and bottom, 9.5px mono uppercase.
- **Body**: same grid per row, `padding:11px 12px`, radius 10, 1px `#eef2f5` divider between rows, internal scroll.
- **Footer**: 1px `#eef2f5` top rule, mono range label + pager.

Column types and their cell styling:
| Type | Styling |
|---|---|
| id | 10.5px mono `#8aa3ad` |
| primary | 13.5px 700 `#193949` title + 10.5px 500 `#718996` sub, both ellipsised |
| text | 11.5px 500 `#486774`, ellipsised |
| num | 11.5px mono `#254a59`, right-aligned (head right-aligned too) |
| mono | 10px mono `#7d949e` (timestamps) |
| pill | status pill |
| actions | right-aligned flex, 10px gap: View · Edit · Delete |

## 6. Segmented filter
`padding:3px` track, radius 10, bg `#f1f5f8`; buttons `padding:6px 12px`, radius 8, 11px 700.
Selected: white bg, `#12637f` ink, `0 2px 6px rgba(23,53,68,.10)`. Unselected: transparent, `#5f7f8c`.

## 7. Status pill
`display:inline-flex; gap:6px; padding:5px 11px; radius:999; font-size:10px; weight:700; white-space:nowrap`
plus a tone pair from tokens.md. Optional 6px leading dot for live states. Detail-panel variant:
`padding:4px 10px; font-size:9.5px`.

## 8. Detail panel
White, radius 16, same shadow, `flex:1 1 320px; min-width:300px`, internal scroll.
Header: h2 19px Sora + mono record ref (`#03`).
Body: 17px Sora title → 11px `#718996` subtitle → status pill → **fact grid** (2 columns, 8px gap, each
`11px 12px` radius-10 `#f6f9fb` block: 9px mono uppercase label + 16px Sora value) → full-width fact cards →
**linked-records list** (mono uppercase section label; rows of 12px 700 title + 9.5px mono meta + small pill;
hover `#f3f8fb`) → action row (1px `#eef2f5` top rule; primary `#1266a5` 38px radius-10 button + outlined
destructive button) → 10px `#8296a0` constraint note.

## 9. Pagination
Footer row: mono range label left; `‹` / page / `›` right. Buttons 30×30, radius 9, 1px `#e2e9ee`, ink
`#5f7f8c`; hover border `#b9d3df`, ink `#1c7595`. Current page: 30px min-width chip, radius 9, bg
`#e5f3fa`, ink `#16617e`, 11px mono.

## 10. Empty state
Centred stack, `padding:46px 20px`: 44px radius-14 `#eef4f8` tile with `⌕` `#8aa3ad` → 13px 700 `#254a59`
headline → 11px `#718996` guidance → optional 36px outlined "Clear filters" button.

## 11. Loading state
Three skeleton rows on the table grid: 10px `#eef2f5` bars, radius 99, `afPulse` staggered 0.1s;
mono caption `Querying aquafleet_db…`.

## 12. Error state
12px-radius block, 1px `#f3dedb`, bg `#fdf6f5`: 32px `#fdeceb`/`#a9453c` `!` tile + 12.5px 700 `#7d342d`
headline + 11px `#8a5c56` body ("No data was changed."), then Retry (primary) and a secondary button.

## 13. Restricted / permission state
`#f6f9fb` block with 32px `⚿` tile, 12.5px 700 title, 10.5px sub and a grey "Read only" pill; disallowed
actions render as a muted "Hidden" row rather than a disabled control.

## 14. Modal (create / edit)
Radius 14, 1px `#e6edf2`. Header row: 14px Sora title + `✕`, 1px `#eef2f5` bottom rule.
Body: 2-column field grid, 10px gap (wide fields span both). Field: 10.5px 700 `#5f7f8c` label (`*` when
required) + 36px input, radius 9, 1px `#dde6ec`; focus `#2b8fc7` border + `0 0 0 3px rgba(43,143,199,.16)`;
invalid `#e2b4ad` border, `#fffafa` bg, 10px `#a9453c` message below.
Footer: right-aligned Cancel (outlined) + primary save.

## 15. Confirmation dialog and toasts
Confirm: 14px Sora title, 11.5px body naming the record, 11px `#8a5c56` rule line, Cancel + `#a9453c` Delete.
Toast: 12px radius block with 3px inset left edge — success `#eef8f2`/`#3f9c6d`/`#245c45`,
failure `#fdf1ef`/`#b1554b`/`#7d342d`; 24px glyph tile, 11.5px 600 message, `✕` dismiss.

## 16. Reports-specific components
**Report tabs** — same section-tab treatment, one per SQL view.
**Report table** — same register table, read-only: no actions column, no row selection.
**Context rail** — fact cards for "Rows returned" (26px Sora value) and "SQL source" (12px mono view name),
then a selectable list of the five reports using the selected-row treatment.

## 17. Dashboard-specific components (already implemented)
Operations list rows, fleet-availability donut (`conic-gradient` + legend), expedition timeline bar
(dot → 3px gradient rail → dot with mono dates) and the operational-attention rows. Unchanged in this set.
