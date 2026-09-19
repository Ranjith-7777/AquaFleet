# 06 · AUV / ROV Vehicles

**Artifact:** `artifacts/AquaFleet Vehicles.dc.html`
**Database entities:** auv_rov (+ vehicle_sensor, mission_vehicle, vehicle_battery)
**API:** /api/vehicles (GET, POST, PUT, DELETE), /api/vehicle-sensors, /api/mission-vehicles, /api/vehicle-batteries

## Purpose
Autonomous and remotely operated vehicle fleet, depth ratings and operational status.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "AUV / ROV Vehicles", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Registered Vehicles
- Available
- Deployed
- In Maintenance

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (vehicle_id)
- Vehicle (vehicle_name + type/model)
- Max Depth (max_depth)
- Sensors (derived)
- Missions (derived)
- Status (status pill)
- Actions

## Filters
- All
- Available
- Deployed
- Maintenance
- Retired

## Detail panel
- Max Depth
- Sensors Fitted
- Current Battery
- Mission Deployments
- Mission deployments
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
status is a real column (Available / Deployed / Maintenance / Retired). Sensor and mission counts are derived; vw_vehicle_readiness already returns sensor_count and open_battery_assignment_count.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
