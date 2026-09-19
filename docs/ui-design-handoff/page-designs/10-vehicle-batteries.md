# 10 · Vehicle Batteries

**Artifact:** `artifacts/AquaFleet Vehicle Batteries.dc.html`
**Database entities:** vehicle_battery (composite key vehicle_id + battery_id + start_cycle)
**API:** /api/vehicle-batteries (GET, POST, PUT, DELETE)

## Purpose
Non-overlapping battery assignment periods recorded against each vehicle.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Vehicle Batteries", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Assignment Periods
- Open Periods
- Closed Periods
- Packs In Rotation

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- Vehicle ID
- Vehicle (vehicle_name + battery)
- Capacity (Wh)
- Start Cycle
- End Cycle
- State (Open/Closed, derived from end_cycle)
- Actions

## Filters
- All
- Open
- Closed

## Detail panel
- Capacity (Wh)
- Vehicle ID
- Cycle Start
- Cycle End
- Battery pack
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
State is derived: end_cycle NULL → Open. The record path includes start_cycle as a query parameter (recordPath() in master-data.js). Overlap validation already exists server-side.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
