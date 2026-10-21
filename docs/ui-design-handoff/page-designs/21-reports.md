# 21 · Reports

**Artifact:** `artifacts/AquaFleet Reports.dc.html`
**Database entities:** vw_expedition_summary, vw_mission_operations, vw_vehicle_readiness, vw_sample_lineage, vw_incident_overview
**API:** /api/reports/expeditions, /api/reports/missions, /api/reports/vehicle-readiness, /api/reports/sample-lineage, /api/reports/incidents

## Purpose
Read-only results from the five AquaFleet SQL reporting views.

## Layout and content
See the artifact for the full composition. This page does not follow the register archetype.

## Implementation notes
Report tab set, per-report column sets and per-report filter parameter all mirror reporting.js exactly. The right rail shows rows-returned and the SQL view name, as the existing implementation does. 'Export CSV' in the footer is NEW — BACKEND MAPPING REQUIRED, or drop it if no export route exists.

## Assets
No image or icon files. All glyphs are Unicode characters rendered in the UI font.
Fonts: Sora, Manrope, IBM Plex Mono (Google Fonts) — already used by the approved pages.
