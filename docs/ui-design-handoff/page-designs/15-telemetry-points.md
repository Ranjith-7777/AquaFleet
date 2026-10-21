# 15 · Telemetry Points

**Artifact:** `artifacts/AquaFleet Telemetry Points.dc.html`
**Database entities:** telemetry_point (weak entity: mission_id + log_no)
**API:** /api/telemetry-points (GET, POST, PUT, DELETE)

## Purpose
Logged mission positions, depth, power state and water temperature.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Telemetry Points", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Logged Points
- Deepest Reading
- Lowest Battery
- Low-Power Points

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- Mission ID
- Log (log_no)
- Timestamp
- Depth
- Battery %
- Temp
- State (derived)
- Actions

## Filters
- All
- Nominal
- Warning

## Detail panel
- Depth
- Battery %
- Latitude
- Longitude
- Temperature
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
'Nominal / Warning' is a DERIVED presentation state (battery_level below threshold). BACKEND MAPPING REQUIRED: confirm the threshold; nothing is stored. This is the densest table in the set — 8 columns; keep the mono numerics right-aligned.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
