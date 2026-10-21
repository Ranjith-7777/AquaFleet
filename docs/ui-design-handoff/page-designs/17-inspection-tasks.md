# 17 · Inspection Tasks

**Artifact:** `artifacts/AquaFleet Inspection Tasks.dc.html`
**Database entities:** inspection_task (+ offshore_asset, mission)
**API:** /api/inspection-tasks (GET, POST, PUT, DELETE)

## Purpose
Offshore inspection workflow, task priority, execution status and recorded findings.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Inspection Tasks", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Inspection Tasks
- Completed
- Open Tasks
- Urgent Priority

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (inspection_id)
- Task (task_type + asset_name)
- Mission (mission_type)
- Priority (priority)
- Status (status pill)
- Actions

## Filters
- All
- Pending
- In Progress
- Completed
- Cancelled

## Detail panel
- Priority
- Task ID
- Mission
- Finding Summary
- Target asset
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
Existing workflow rule stands: finding_summary is required to move a task to Completed or Cancelled. Both priority and status are real enum columns.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
