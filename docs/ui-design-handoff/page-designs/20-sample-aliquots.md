# 20 · Sample Aliquots

**Artifact:** `artifacts/AquaFleet Sample Aliquots.dc.html`
**Database entities:** sample_aliquot (weak entity: sample_id + aliquot_no)
**API:** /api/sample-aliquots (GET, POST, PUT, DELETE)

## Purpose
Sub-portions of collected samples with volume and storage temperature.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Sample Aliquots", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Aliquots
- Total Volume
- Cryogenic Storage
- Custody Closed

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- Sample (sample_id)
- Aliquot (aliquot_no)
- Sample Type
- Volume (volume_ml)
- Storage Temp (storage_temp)
- Custody (inherited pill)
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
- Volume (ml)
- Storage Temp
- Parent Sample
- Aliquot Number
- Parent sample
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
Custody shown on an aliquot row is INHERITED from the parent sample; aliquots have no custody column. sample_id and aliquot_no are immutable after creation.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
