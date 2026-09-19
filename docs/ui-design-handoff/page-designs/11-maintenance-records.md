# 11 · Maintenance Records

**Artifact:** `artifacts/AquaFleet Maintenance Records.dc.html`
**Database entities:** maintenance_record
**API:** /api/maintenance-records (GET, POST, PUT, DELETE)

## Purpose
Vehicle maintenance history, work performed, recorded cost and next due dates.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Maintenance Records", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Maintenance Records
- Overdue Or Pending
- Recorded Cost
- Scheduled Next Due

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (maintenance_id)
- Vehicle (vehicle_name + type/status)
- Action Taken (action_taken, truncated)
- Cost (cost)
- Next Due (next_due_date)
- Status (derived pill)
- Actions

## Filters
- All
- Completed
- Pending
- Overdue

## Detail panel
- Cost
- Next Due
- Maintenance Date
- Action Taken
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
Status pill is DERIVED from next_due_date vs today and the vehicle's status; no status column exists on maintenance_record. BACKEND MAPPING REQUIRED: confirm the 'Overdue' rule.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
