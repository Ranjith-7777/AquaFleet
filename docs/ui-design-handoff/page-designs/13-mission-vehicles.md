# 13 · Mission Vehicles

**Artifact:** `artifacts/AquaFleet Mission Vehicles.dc.html`
**Database entities:** mission_vehicle (composite key mission_id + vehicle_id)
**API:** /api/mission-vehicles (GET, POST, PUT, DELETE)

## Purpose
Vehicle deployment periods assigned to missions, with launch and recovery times.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Mission Vehicles", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Deployments
- Currently At Depth
- Recovered
- Vehicles Used

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- Mission ID
- Mission Type (+ vehicle_name)
- Class (vehicle_type)
- Launch (launch_time)
- Recovery (recovery_time)
- State (derived)
- Actions

## Filters
- All
- Recovered
- At Depth

## Detail panel
- Class
- Mission ID
- Launch Time
- Recovery Time
- Vehicle record
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
State is derived: recovery_time NULL → 'At Depth'. mission_id and vehicle_id immutable after creation.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
