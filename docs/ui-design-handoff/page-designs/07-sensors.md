# 07 · Sensors

**Artifact:** `artifacts/AquaFleet Sensors.dc.html`
**Database entities:** sensor (+ vehicle_sensor)
**API:** /api/sensors (GET, POST, PUT, DELETE), /api/vehicle-sensors (GET)

## Purpose
Scientific sensor inventory, manufacturer, calibration currency and measurement accuracy.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Sensors", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Registered Sensors
- Calibration Current
- Calibration Due Soon
- Fitted To Vehicles

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (sensor_id)
- Sensor (sensor_type + manufacturer)
- Calibrated (calibration_date)
- Accuracy (accuracy)
- Installs (derived)
- Status (derived pill)
- Actions

## Filters
- All
- Calibrated
- Due Soon

## Detail panel
- Accuracy
- Installations
- Calibration Date
- Manufacturer
- Vehicle installations
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
'Calibrated' vs 'Due Soon' is a DERIVED presentation state based on calibration_date age. BACKEND MAPPING REQUIRED: confirm the calibration interval rule before implementing; no interval is stored today.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
