# 12 · Missions

**Artifact:** `artifacts/AquaFleet Missions.dc.html`
**Database entities:** mission (+ expedition, marine_zone, mission_vehicle, mission_operator)
**API:** /api/missions (GET, POST, PUT, DELETE)

## Purpose
Mission plans, parent expeditions, survey zones and execution status.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Missions", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Recorded Missions
- In Progress
- Completed
- Deepest Target

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (mission_id)
- Mission (mission_type + expedition_title)
- Zone (zone_name)
- Start (start_time)
- Depth (depth_target)
- Status (status pill)
- Actions

## Filters
- All
- Planned
- In Progress
- Completed

## Detail panel
- Vehicles
- Operators
- Zone
- Start Time
- End Time
- Duration (minutes)
- Depth Target
- Assigned vehicles
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
duration_minutes is derived by the existing view/route, not stored. Filter set omits 'Aborted' only because no seeded record uses it — include the full enum (Planned, In Progress, Completed, Aborted) in implementation.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
