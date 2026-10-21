# Handoff: AquaFleet authenticated application (23 pages)

## Overview
This package contains the approved visual designs for every authenticated AquaFleet workspace —
23 pages built on one shared design system, anchored on the already-implemented **Research Vessels** page.

The goal of implementation is to bring the remaining 21 workspaces (Dashboard is already live, Design Index
is a reviewer artifact) up to this system **without duplicating CSS/JS per page**:

    shared design system  →  shared AquaFleet components  →  page composition  →  existing API / CRUD / auth

## About the design files
The `artifacts/*.dc.html` files are **design references written in HTML**. They are prototypes showing the
intended look, density and interaction — **not production code to copy into the app**. AquaFleet's frontend is
vanilla JS + Bootstrap-flavoured CSS (`frontend/js/*.js`, `frontend/css/style.css`); recreate these designs
there, using the project's existing element helpers (`Ui.element`), resource metadata (`resources.js`),
CRUD forms (`master-data.js`), permissions (`permissions.js`) and API layer (`api.js`).

Each artifact is a self-contained HTML file: open it directly in a browser to inspect the real rendering,
computed styles and interactions. `support.js` is the runtime that renders them and is **not** part of the app.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, shadows and interaction states in the artifacts are final.
Recreate them exactly; do not re-interpret.

## Data in the designs
All record content in the artifacts is **DESIGN SAMPLE DATA**, transcribed from `database/sample_data.sql`
so the layouts are exercised with realistic values. **Do not hardcode any of it.** Every page must read from
the existing API routes. Counts shown in KPI cards are illustrative of the seeded database only.

## Derived vs stored values
Several pills and KPI numbers are **derived presentation state**, not database columns (vessel deployment,
asset inspection state, sensor calibration currency, maintenance overdue, telemetry nominal/warning,
junction-row state from a NULL end timestamp). Each page spec names them and flags the ones that need a
rule confirmed. Anything marked **BACKEND MAPPING REQUIRED** must be checked against the codebase before
implementing — do not invent an API.

## Contents
- `design-system/README.md` — shell anatomy and the rules every page follows
- `design-system/tokens.md` — colours, type, spacing, radii, shadows, motion
- `design-system/components.md` — every shared component with exact values
- `design-system/interaction-patterns.md` — search, filter, selection, CRUD, states
- `page-designs/01..23-*.md` — one specification per page
- `page-designs/00-index.md` — master index table
- `artifacts/*.dc.html` — the approved design files (open in a browser)

## Recommended implementation order
1. **Shared shell + design system** extracted from the live Research Vessels page (nav rail, header band, card, table, pill, detail panel, states).
2. **Register pages that need no derived rules**: Vehicles, Battery Packs, Incidents, Inspection Tasks, Expeditions, Samples.
3. **Register pages with derived state**: Marine Zones, Offshore Assets, Operators, Sensors, Maintenance Records, Missions, Telemetry Points.
4. **Junction pages**: Vehicle Sensors, Vehicle Batteries, Mission Vehicles, Mission Operators, Sample Aliquots.
5. **Reports** (read-only views; reuse the existing reporting.js data layer).
6. **Interface states** pass — swap the ad-hoc loading/empty/error markup for the shared components.

## Do not
- Do not change backend routes, schema, permissions or validation.
- Do not redesign Research Vessels or the Dashboard.
- Do not hardcode sample data.
- Do not add a page-local stylesheet; extend the shared system instead.
