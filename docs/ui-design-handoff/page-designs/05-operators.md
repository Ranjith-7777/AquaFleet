# 05 · Operators

**Artifact:** `artifacts/AquaFleet Operators.dc.html`
**Database entities:** operator, operator_contact, mission_operator
**API:** /api/operators (GET, POST, PUT, DELETE), /api/mission-operators (GET)

## Purpose
Personnel register, certification levels, contact records and mission duty assignments.

## Layout
Standard workspace composition (see `design-system/README.md`):
rail → full-bleed header band → section tabs → KPI strip → register card (`flex:3 1 640px`) + detail panel (`flex:1 1 320px`).

## Header
- Eyebrow, 36px title "Operators", one-line description (see artifact for exact copy)
- Search pill, record-count chip, primary action

## KPI cards
- Registered Operators
- On Active Missions
- Expert Certified
- Contact Numbers

All KPI values are **DESIGN SAMPLE DATA** derived from the seeded database; compute them from the live collection.

## Table columns
- ID (operator_id)
- Operator (first+last name, role)
- Certification (certification_level)
- Contacts (contact_numbers length)
- Missions (derived)
- Status (derived pill)
- Actions

## Filters
- All
- Assigned
- On Mission

## Detail panel
- Mission Duties
- Contacts
- Certification Level
- Email
- Primary Contact
- Mission assignments
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
contact_numbers is the existing multivalued field — the form uses the repeating contact-row control already present in master-data.js. Status pill is derived (operator on an In Progress mission → 'On Mission').

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
