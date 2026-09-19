# 09 · Vehicle Sensors

**Artifact:** `artifacts/AquaFleet Vehicle Sensors.dc.html`
**Database entities:** vehicle_sensor (composite key vehicle_id + sensor_id)
**API:** /api/vehicle-sensors (GET, POST, PUT, DELETE)

## Purpose
Sensor installations by vehicle, mounting position and installation date.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Vehicle Sensors", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Installations
- Equipped Vehicles
- Sensors In Service
- Most Equipped

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- Vehicle ID
- Vehicle (vehicle_name + mount_position)
- Sensor (sensor_type)
- Manufacturer
- Installed (install_date)
- Status
- Actions

## Filters
_No filter chips on this page — search only._

## Detail panel
- Installed
- Vehicle ID
- Mount Position
- Manufacturer
- Sensor record
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
Composite-key resource: vehicle_id and sensor_id are immutable after creation (see master-data.js). The 'Installed' pill is presentational only.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
