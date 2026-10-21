# Master index — 23 approved pages

| # | Page | Purpose | Archetype | Entities | Key interactions | Notes |
|---|---|---|---|---|---|---|
| 01 | Dashboard | Operational overview of fleet, mission and expedition readiness from current database state. | Dashboard | research_vessel, expedition, mission, auv_rov, incident, inspection_task, sample | search, refresh, drill-in links | baseline / already implemented |
| 02 | Research Vessels | Research vessel registry, berth capacity, home port and derived deployment state. | Register + detail | research_vessel (+ expedition for deployment state) | search, filter, select, CRUD, pagination | baseline / already implemented |
| 03 | Marine Zones | Survey regions, operating depth envelopes and risk classification used in mission planning. | Register + detail | marine_zone (+ mission for linked list) | search, filter, select, CRUD, pagination | ⚠ backend mapping required |
| 04 | Offshore Assets | Offshore infrastructure targeted by inspection tasks, with recorded positions. | Register + detail | offshore_asset (+ inspection_task) | search, filter, select, CRUD, pagination | ⚠ backend mapping required |
| 05 | Operators | Personnel register, certification levels, contact records and mission duty assignments. | Register + detail | operator, operator_contact, mission_operator | search, filter, select, CRUD, pagination | — |
| 06 | AUV / ROV Vehicles | Autonomous and remotely operated vehicle fleet, depth ratings and operational status. | Register + detail | auv_rov (+ vehicle_sensor, mission_vehicle, vehicle_battery) | search, filter, select, CRUD, pagination | — |
| 07 | Sensors | Scientific sensor inventory, manufacturer, calibration currency and measurement accuracy. | Register + detail | sensor (+ vehicle_sensor) | search, filter, select, CRUD, pagination | ⚠ backend mapping required |
| 08 | Battery Packs | Battery inventory, chemistry, stored capacity, condition and lifecycle counts. | Register + detail | battery_pack (+ vehicle_battery) | search, filter, select, CRUD, pagination | — |
| 09 | Vehicle Sensors | Sensor installations by vehicle, mounting position and installation date. | Junction register | vehicle_sensor (composite key vehicle_id + sensor_id) | search, filter, select, CRUD, pagination | — |
| 10 | Vehicle Batteries | Non-overlapping battery assignment periods recorded against each vehicle. | Junction register | vehicle_battery (composite key vehicle_id + battery_id + start_cycle) | search, filter, select, CRUD, pagination | — |
| 11 | Maintenance Records | Vehicle maintenance history, work performed, recorded cost and next due dates. | Register + detail | maintenance_record | search, filter, select, CRUD, pagination | ⚠ backend mapping required |
| 12 | Missions | Mission plans, parent expeditions, survey zones and execution status. | Register + detail | mission (+ expedition, marine_zone, mission_vehicle, mission_operator) | search, filter, select, CRUD, pagination | — |
| 13 | Mission Vehicles | Vehicle deployment periods assigned to missions, with launch and recovery times. | Junction register | mission_vehicle (composite key mission_id + vehicle_id) | search, filter, select, CRUD, pagination | — |
| 14 | Mission Operators | Operator duty assignments and watch shifts recorded against each mission. | Junction register | mission_operator (composite key mission_id + operator_id) | search, filter, select, CRUD, pagination | — |
| 15 | Telemetry Points | Logged mission positions, depth, power state and water temperature. | Register + detail | telemetry_point (weak entity: mission_id + log_no) | search, filter, select, CRUD, pagination | ⚠ backend mapping required |
| 16 | Incidents | Recorded mission incidents, severity classification and reported descriptions. | Register + detail | incident | search, filter, select, CRUD, pagination | — |
| 17 | Inspection Tasks | Offshore inspection workflow, task priority, execution status and recorded findings. | Register + detail | inspection_task (+ offshore_asset, mission) | search, filter, select, CRUD, pagination | — |
| 18 | Expeditions | Research campaigns, assigned vessels, scheduled dates, budgets and mission totals. | Register + detail | expedition (+ research_vessel, mission) | search, filter, select, CRUD, pagination | — |
| 19 | Samples | Collected marine samples, preservation method and chain-of-custody state. | Register + detail | sample (+ mission, sample_aliquot) | search, filter, select, CRUD, pagination | — |
| 20 | Sample Aliquots | Sub-portions of collected samples with volume and storage temperature. | Register + detail | sample_aliquot (weak entity: sample_id + aliquot_no) | search, filter, select, CRUD, pagination | — |
| 21 | Reports | Read-only results from the five AquaFleet SQL reporting views. | Reports | vw_expedition_summary, vw_mission_operations, vw_vehicle_readiness, vw_sample_lineage, vw_incident_overview | report tabs, filter, refresh | ⚠ backend mapping required |
| 22 | Interface States | Reference sheet for the shared loading, empty, error, restricted, modal, confirmation and toast treatments. | State reference | n/a | none (reference) | — |
| 23 | Design Index | Review-set index and system-rules summary for this design package. | Review index | n/a | none (reference) | — |

## Pages needing a rule confirmed before implementation
- **04 Offshore Assets** — per-asset inspection rollup driving the derived status pill
- **07 Sensors** — calibration interval behind "Calibrated" vs "Due Soon"
- **11 Maintenance Records** — the "Overdue" rule against `next_due_date`
- **15 Telemetry Points** — battery threshold behind "Nominal" vs "Warning"
- **03 Marine Zones** — per-zone mission count source (client join vs view)
- **21 Reports** — "Export CSV" has no existing route

## Not routes
- **22 Interface States** — shared component reference
- **23 Design Index** — reviewer artifact
