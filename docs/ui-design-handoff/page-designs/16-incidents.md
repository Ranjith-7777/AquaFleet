# 16 · Incidents

**Artifact:** `artifacts/AquaFleet Incidents.dc.html`
**Database entities:** incident
**API:** /api/incidents (GET, POST, PUT, DELETE)

## Purpose
Recorded mission incidents, severity classification and reported descriptions.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Incidents", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Recorded Incidents
- High Or Critical
- Missions Affected
- Low Severity

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (incident_id)
- Incident (incident_type + mission_type)
- Description (truncated)
- Reported (time_reported)
- Severity (severity pill)
- Actions

## Filters
- All
- Low
- Moderate
- High
- Critical

## Detail panel
- Reported
- Incident ID
- Mission
- Description
- Parent mission
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
severity is a real enum column. Description truncates to one line in the table and shows in full in the detail panel.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
