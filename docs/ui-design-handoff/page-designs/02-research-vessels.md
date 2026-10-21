# 02 · Research Vessels

**Artifact:** `artifacts/AquaFleet Vessels.dc.html`
**Database entities:** research_vessel (+ expedition for deployment state)
**API:** /api/vessels (GET, POST, PUT, DELETE), /api/expeditions (GET)

## Purpose
Research vessel registry, berth capacity, home port and derived deployment state.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Research Vessels", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Registered Vessels
- Assigned To Expeditions
- Total Berth Capacity
- Deep Sea Class

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (vessel_id)
- Vessel (vessel_name + vessel_type)
- Home Port (home_port)
- Capacity (capacity)
- Deployment (derived)
- Actions

## Filters
- All
- At Sea
- In Port
- Unassigned

## Detail panel
- Capacity
- Expeditions
- Home Port
- Linked expeditions
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
BASELINE PAGE — already implemented. Deployment pill is derived in the frontend from the vessel's expeditions (active → At Sea, planned → Scheduled, any → In Port, none → Unassigned), matching vesselDeployment() in app.js. No status column exists in research_vessel.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
