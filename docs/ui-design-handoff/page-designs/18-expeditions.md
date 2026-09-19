# 18 · Expeditions

**Artifact:** `artifacts/AquaFleet Expeditions.dc.html`
**Database entities:** expedition (+ research_vessel, mission)
**API:** /api/expeditions (GET, POST, PUT, DELETE), /api/vessels (GET, for the vessel relation select)

## Purpose
Research campaigns, assigned vessels, scheduled dates, budgets and mission totals.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Expeditions", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Expeditions
- Active Now
- Planned Missions
- Committed Budget

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (expedition_id)
- Expedition (title + vessel_name)
- Start (start_date)
- End (end_date)
- Missions (mission_count)
- Status (status pill)
- Actions

## Filters
- All
- Planned
- Active
- Completed

## Detail panel
- Missions
- Budget
- Start Date
- End Date
- Objective
- Missions in this campaign
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
mission_count is already returned by the expeditions route. Existing validation stands: end_date must be on or after start_date. Include 'Cancelled' in the filter set at implementation time.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
