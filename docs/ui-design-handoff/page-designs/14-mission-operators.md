# 14 · Mission Operators

**Artifact:** `artifacts/AquaFleet Mission Operators.dc.html`
**Database entities:** mission_operator (composite key mission_id + operator_id)
**API:** /api/mission-operators (GET, POST, PUT, DELETE)

## Purpose
Operator duty assignments and watch shifts recorded against each mission.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Mission Operators", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Duty Assignments
- Operators Rostered
- On Active Duty
- Watch Patterns

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- Mission ID
- Operator (operator_name + mission_type)
- Duty Role (duty_role)
- Shift (shift)
- State (derived from mission status)
- Actions

## Filters
- All
- Completed
- In Progress

## Detail panel
- Mission ID
- Shift
- Duty Role
- Mission
- Operator record
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
State pill mirrors the parent mission's status; it is not stored on the junction row.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
