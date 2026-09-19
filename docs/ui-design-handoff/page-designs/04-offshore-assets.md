# 04 · Offshore Assets

**Artifact:** `artifacts/AquaFleet Offshore Assets.dc.html`
**Database entities:** offshore_asset (+ inspection_task)
**API:** /api/offshore-assets (GET, POST, PUT, DELETE), /api/inspection-tasks (GET)

## Purpose
Offshore infrastructure targeted by inspection tasks, with recorded positions.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Offshore Assets", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Registered Assets
- Inspection Tasks
- Open Inspections
- Completed Inspections

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (asset_id)
- Asset (asset_name + asset_type)
- Latitude
- Longitude
- Tasks (derived)
- Status (derived pill)
- Actions

## Filters
- All
- Surveyed
- Inspection Due

## Detail panel
- Inspection Tasks
- Open Tasks
- Latitude
- Longitude
- Inspection tasks
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
Status pill is DERIVED, not stored: an asset with any Pending/In Progress task shows 'Inspection Due', otherwise 'Surveyed'. BACKEND MAPPING REQUIRED for the per-asset task rollup.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
