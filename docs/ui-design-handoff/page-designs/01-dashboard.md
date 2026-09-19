# 01 · Dashboard

**Artifact:** `artifacts/AquaFleet Dashboard.dc.html`
**Database entities:** research_vessel, expedition, mission, auv_rov, incident, inspection_task, sample
**API:** /api/vessels, /api/expeditions, /api/missions, /api/vehicles, /api/incidents, /api/inspection-tasks, /api/samples

## Purpose
Operational overview of fleet, mission and expedition readiness from current database state.

## Layout and content
See the artifact for the full composition. This page does not follow the register archetype.

## Implementation notes
Already approved and implemented; no visual change in this set. KPI counts are derived client-side from the loaded collections, exactly as app.js does today.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
