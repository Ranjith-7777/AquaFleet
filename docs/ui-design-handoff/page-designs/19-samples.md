# 19 · Samples

**Artifact:** `artifacts/AquaFleet Samples.dc.html`
**Database entities:** sample (+ mission, sample_aliquot)
**API:** /api/samples (GET, POST, PUT, DELETE), /api/sample-aliquots (GET)

## Purpose
Collected marine samples, preservation method and chain-of-custody state.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Samples", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Collected Samples
- Aliquots Derived
- In Transit
- Stored Or Received

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (sample_id)
- Sample (sample_type + mission_type)
- Collected (collected_at)
- Preservation (preservation_method)
- Aliquots (aliquot_count)
- Custody (chain_of_custody_status pill)
- Actions

## Filters
- All
- Collected
- Sealed
- In Transit
- Received
- Stored
- Released

## Detail panel
- Aliquots
- Sample ID
- Collected At
- Preservation Method
- Derived aliquots
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
chain_of_custody_status is a real enum with 7 values — include 'Disposed' in the filter set at implementation time. aliquot_count is already returned by the route.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
