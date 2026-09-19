# 08 · Battery Packs

**Artifact:** `artifacts/AquaFleet Battery Packs.dc.html`
**Database entities:** battery_pack (+ vehicle_battery)
**API:** /api/battery-packs (GET, POST, PUT, DELETE), /api/vehicle-batteries (GET)

## Purpose
Battery inventory, chemistry, stored capacity, condition and lifecycle counts.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Battery Packs", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Battery Packs
- Total Capacity
- Good Or Better
- Replace Condition

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (battery_id)
- Pack (chemistry + capacity)
- Capacity (capacity_wh)
- Cycles (cycle_count)
- Assignments (derived)
- Health (health_status pill)
- Actions

## Filters
- All
- Excellent
- Good
- Fair
- Replace

## Detail panel
- Cycle Count
- Assignments
- Capacity (Wh)
- Chemistry
- Vehicle assignment periods
- Edit / Delete

## Actions
- Header: create (gated by permissions)
- Row: View · Edit · Delete
- Detail panel: primary edit + destructive delete, with the constraint note shown in the artifact

## States
Loading, empty, error, restricted, create/edit modal, delete confirmation and toasts all use the shared
components in `design-system/components.md` — see `artifacts/AquaFleet Interface States.dc.html`.

## Interactions
Search, filter chips, row selection driving the detail panel, pagination, CRUD modals.
Full contract in `design-system/interaction-patterns.md`.

## Implementation notes
health_status is a real enum column. Total capacity KPI is a client-side sum.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
