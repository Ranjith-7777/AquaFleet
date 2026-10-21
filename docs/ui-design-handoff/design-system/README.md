# AquaFleet design system — shell and rules

## Application shell
A single flex row, full viewport height, no page-level scrolling.

```
<div display:flex; height:100vh; background:#e9eff5>
  <nav  flex:0 0 100px>        navy rail
  <main flex:1; margin-left:-100px; padding-left:126px; overflow-y:auto>
```

The **sidebar merge** is the defining detail: `main` is pulled back under the rail by `margin-left:-100px`
and given `padding-left:126px`. The rail has no radius and no gap; the workspace continues beneath it, so
the two read as one surface rather than a floating nav panel. The active nav item is a **full-bleed white
rectangle** spanning the rail's full width with a 4px `#54c3e0` left edge — it visually punches through the
navy into the workspace. Never round the rail, never inset the active item, never add a gutter between rail
and workspace.

## Vertical rhythm of a workspace page
1. **Header band** — full-bleed blue/cyan gradient, negative margins pull it out of `main`'s padding
   (`margin:-22px -24px 4px -126px`) so it spans rail-to-edge. Min height 126px.
2. **Section tabs** (optional) — text links on the page background with a 1px `#dde6ec` rule; active link
   carries `inset 0 -2px 0 #2b8fc7`.
3. **KPI strip** — `repeat(auto-fit,minmax(232px,1fr))`, 14px gap, 3–4 cards.
4. **Work area** — flex row, 14px gap: register card `flex:3 1 640px` + detail panel `flex:1 1 320px`,
   both scrolling internally so the page itself never scrolls at 1366×768.

## Page-level gap
`main` is `display:flex; flex-direction:column; gap:14px; padding:22px 24px 24px 126px`.

## Consistency rules
- One header band per page, one primary action in it.
- One status pill per table row.
- Max two card radii in play: 16 for panels, 14 for KPI cards, 10 for interior rows.
- White is the dominant surface; navy and cyan appear only in the rail, the header band and accents.
- No gradients other than the header band and the 6px KPI progress bars.
- Icons are single monochrome glyphs in a tinted 44px (KPI) or 34px (row) rounded square — never illustrative.
