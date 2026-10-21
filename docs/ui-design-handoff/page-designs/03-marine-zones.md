# 03 · Marine Zones

**Artifact:** `artifacts/AquaFleet Marine Zones.dc.html`
**Database entities:** marine_zone (+ mission for linked list)
**API:** /api/marine-zones (GET, POST, PUT, DELETE), /api/missions (GET)

## Purpose
Survey regions, operating depth envelopes and risk classification used in mission planning.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Marine Zones", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Registered Zones
- Zones In Use
- Deepest Envelope
- High Or Critical Risk

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (zone_id)
- Zone (zone_name + region)
- Min Depth (min_depth)
- Max Depth (max_depth)
- Missions (derived count)
- Risk (risk_level pill)
- Actions

## Filters
- All
- Low
- Moderate
- High
- Critical

## Detail panel
- Depth Span (derived)
- Missions
- Minimum Depth
- Maximum Depth
- Missions in this zone
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
Depth span and mission count are derived. BACKEND MAPPING REQUIRED: per-zone mission counts — either join client-side on /api/missions or use vw_mission_operations.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
