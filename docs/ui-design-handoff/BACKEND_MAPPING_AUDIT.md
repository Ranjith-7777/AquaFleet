# AquaFleet frozen UI: backend and data mapping audit

Audit date: 2026-09-19. Scope: the 23 specifications in `page-designs/`, the associated `.dc.html` artifacts, the current repository schema, routes, permissions, and frontend. This is an implementation audit, not authorization to change the application. Values embedded in design artifacts are sample presentation data.

## 1. Executive Summary

The normalized model and existing protected CRUD API cover all 19 domain registers, the Dashboard, and five read-only SQL reports. The Research Vessels workspace is the sole register using the approved new composition today; the other resource screens still use the generic table and shared modal. The 23-item handoff also includes two reference artifacts that are not application routes.

Of the **21 routed pages**, **8 are directly supported** by existing fields and unambiguous rules (01, 02, 09, 10, 13, 16, 17, 20); **9 need only mapping/aggregation over existing responses** (03, 04, 05, 06, 08, 12, 14, 18, 19); **4 contain unresolved rules or export scope** (07, 11, 15, 21). These categories describe data readiness, not how much frontend work remains. No backend or schema change is unconditionally required to render the supported data; a server-generated CSV would require a new endpoint. The calibration, maintenance, and warning labels require business decisions before they can be shown as factual status.

Critical findings:

- `sensor.calibration_date` is a historical date. No interval, due date, manufacturer rule, or calibration status exists.
- `maintenance_record.next_due_date` can be compared with today, but a maintenance row has no lifecycle status. Old rows can have superseding service, so a past due date does not by itself prove a current overdue condition.
- `telemetry_point.battery_level` is a 0–100 percent reading. No warning threshold is defined or calculated.
- `inspection_task.asset_id → offshore_asset.asset_id` and `mission.zone_id → marine_zone.zone_id` directly support the required rollups through existing collection APIs.
- Reports have five JSON GET endpoints and no export endpoint. A CSV of returned rows can be built client-side; a server-managed export of the full/filtered report would need a route.

## 2. Existing AquaFleet Architecture

- **Database:** MySQL schema in `database/schema.sql`, sample records in `database/sample_data.sql`, Phase 1/3 migrations, five reporting views, integrity triggers, and procedures. `app_user` is separate from the marine model.
- **Backend:** Flask blueprints under `backend/routes/`. `backend/app.py` registers each route and applies one authentication guard. `backend/authentication.py` rechecks the account and role on protected requests. Public health and login endpoints are explicit. Resource GET collections return `{success,count,data}`; `frontend/js/api.js` exposes those as `response.data` and `response.payload`.
- **Frontend:** `frontend/index.html` loads vanilla JS modules. `resources.js` defines collection path, keys, table/detail fields; `master-data.js` defines create/edit fields, relation selects, composite record paths, validation, and delete confirmation. `permissions.js` mirrors server grants for visibility; Flask remains authoritative. `ui.js` supplies safe DOM construction, formatting, badges, states, and the shared Bootstrap modal. `app.js` coordinates navigation, client search, refresh, Dashboard, the implemented Research Vessels workspace, and generic resource tables. `reporting.js` reads the five SQL-view endpoints.
- **Existing Research Vessels baseline:** `app.js` has an 8-row pager, filter/search composition, selected-row detail, linked expeditions, permission-gated actions, and a `Promise.allSettled` load of vessels and expeditions. `vesselDeployment()` uses expedition status; it is not a vessel column. Its shell/panel/table/detail CSS lives in `style.css`. Other registers do not yet share those specialized components.
- **Search/API limits:** Register search in `app.js` is client-side over configured key/column/detail fields. Resource GET routes list all rows; no resource-level server pagination or filter API is needed for the proposed local chips/pager. Reports alone accept defined query filters. Failed secondary relation loads must produce an unavailable relation state, not a false count of zero.

## 3. Database Entity / Relationship Map Relevant to UI

| Parent → child | Actual key/path | UI uses |
|---|---|---|
| research_vessel → expedition → mission | `expedition.vessel_id`; `mission.expedition_id` | Vessel assignments; expedition mission count; campaign detail |
| marine_zone → mission | `mission.zone_id` | Per-zone mission count/list and zones in use |
| mission ↔ auv_rov | `mission_vehicle(mission_id,vehicle_id)` | Deployments, vehicle/mission links; `recovery_time` may be NULL |
| mission ↔ operator | `mission_operator(mission_id,operator_id)` | Duties, operator assignments; mission status comes from parent mission |
| auv_rov ↔ sensor | `vehicle_sensor(vehicle_id,sensor_id)` | Fitment counts and linked instruments |
| auv_rov ↔ battery_pack | `vehicle_battery(vehicle_id,battery_id,start_cycle)` | Assignment periods and current open end_cycle |
| auv_rov → maintenance_record | `maintenance_record.vehicle_id` | Maintenance history and due dates |
| mission → telemetry_point | `(mission_id,log_no)` weak key | Recorded position, depth, battery %, temperature |
| mission → sample → sample_aliquot | `sample.mission_id`; `sample_aliquot.sample_id` | Collection, aliquot counts, inherited custody |
| mission → incident | `incident.mission_id` | Severity and affected mission |
| mission → inspection_task ← offshore_asset | `inspection_task.mission_id`; `inspection_task.asset_id` | Inspection workflow and per-asset rollup |
| operator → operator_contact | `operator_contact.operator_id` | Multivalued contact numbers |

The five SQL views are `vw_expedition_summary`, `vw_mission_operations`, `vw_vehicle_readiness`, `vw_sample_lineage`, and `vw_incident_overview`. They provide useful joined fields but are not generic replacements for every resource collection. In particular, `vw_vehicle_readiness.next_maintenance_due` selects **MIN of all non-null historical due dates** for a vehicle; it is not a current-service-state calculation.

## 4. API Coverage Matrix

For each resource path below, the backend implements collection `GET /`, item `GET /<key>`, collection `POST /`, item `PUT /<key>`, and item `DELETE /<key>`. There are no resource PATCH handlers. `vehicle-batteries` additionally requires the `start_cycle` query parameter on item GET/PUT/DELETE to identify its three-part key; `master-data.js.recordPath()` already handles this.

| Path suffix after `/api/` | Item key | Existing list payload / relevant joins |
|---|---|---|
| vessels | vessel_id | Vessel fields; expedition fetched separately |
| marine-zones | zone_id | Zone fields; mission fetched separately |
| offshore-assets | asset_id | Asset fields only; inspection tasks fetched separately |
| operators | operator_id | Operator fields plus `contact_numbers` array; mission duties separate |
| vehicles | vehicle_id | Vehicle fields/status; sensor, mission, battery links separate |
| sensors | sensor_id | Sensor fields, including calibration_date; installations separate |
| battery-packs | battery_id | Battery fields and health_status; assignments separate |
| vehicle-sensors | vehicle_id/sensor_id | Joined vehicle and sensor names, manufacturer, mount, install_date |
| vehicle-batteries | vehicle_id/battery_id + start_cycle | Joined vehicle, chemistry, capacity, start/end_cycle |
| maintenance-records | maintenance_id | Joined vehicle name/type/status; maintenance and next_due_date |
| expeditions | expedition_id | Joined vessel; correlated `mission_count`, budget, dates/status |
| missions | mission_id | Joined expedition/zone; derived duration_minutes |
| mission-vehicles | mission_id/vehicle_id | Joined mission/vehicle names/type; launch/recovery |
| mission-operators | mission_id/operator_id | Joined names, duty, shift; **no mission status** |
| telemetry-points | mission_id/log_no | Joined mission fields; battery_level percentage, no warning label |
| incidents | incident_id | Joined mission fields, severity, report time, description |
| inspection-tasks | inspection_id | Joined mission and asset IDs/names, priority/status/finding |
| samples | sample_id | Joined mission; grouped `aliquot_count` |
| sample-aliquots | sample_id/aliquot_no | Joined parent sample type and inherited custody |

Reports: `GET /api/reports/expeditions` (`status`), `/missions` (`status`, `zone_id`), `/vehicle-readiness` (`status`), `/sample-lineage` (`expedition_id`, `mission_id`), and `/incidents` (`severity`, `expedition_id`). All return JSON rows from their SQL views. There is no `/export`, CSV response, or report mutation route. The current Reports UI exposes only a subset of each endpoint's filter parameters.

## 5. RBAC Coverage

Every protected collection/item read is available to authenticated **ADMIN, RESEARCHER, OPERATOR, VIEWER** accounts. The Flask guard, not the frontend mirror, enforces writes.

| Resource group | POST | PUT | DELETE |
|---|---|---|---|
| Vessels, Marine Zones, Offshore Assets, Operators, Vehicles, Sensors, Battery Packs | ADMIN | ADMIN | ADMIN |
| Expeditions | ADMIN, RESEARCHER | ADMIN, RESEARCHER | ADMIN |
| Missions | ADMIN, RESEARCHER | ADMIN, RESEARCHER, OPERATOR | ADMIN |
| Mission Vehicles, Mission Operators | ADMIN, RESEARCHER, OPERATOR | same | same |
| Vehicle Sensors, Vehicle Batteries, Maintenance Records, Telemetry Points, Incidents, Inspection Tasks | ADMIN, OPERATOR | same | same |
| Samples, Sample Aliquots | ADMIN, RESEARCHER | ADMIN, RESEARCHER | ADMIN |
| Reports | none | none | none |

`frontend/js/permissions.js` mirrors this matrix. Existing `Master.can()` gates create/edit/delete, but the Research Vessels unavailable Add control is **disabled** for non-admins; the handoff says disallowed actions should be **hidden**. Resolve this in shared frontend presentation later without changing authorization. The app's current generic pages render View plus permitted Edit/Delete. Relation fetches inherit authenticated read permission.

## 6. Page-by-Page Mapping for All 23 Designs

Legend: **Direct** = existing response fields and deterministic rules; **Mapping** = existing collections need a client-side ID join/aggregation; **Decision** = an unsupported rule or feature scope. All design record values are illustrative, not values to copy.

| # / design page | Database and GET source | Existing write support | Relationships, derivations, detail | Mismatch / risk / backend change |
|---|---|---|---|---|
| **01 Dashboard — Direct** | vessels, expeditions, missions, vehicles, incidents, inspection_tasks, battery_pack, sample; existing corresponding GETs and health GETs | Read-only summary; mission View opens existing details | Counts/status distribution from full successful collections; search cached missions; health from health endpoints | Implemented in `app.js`. Artifact counts/timestamps are sample data. No backend change. |
| **02 Research Vessels — Direct** | research_vessel; GET vessels + expeditions | Full CRUD; ADMIN writes | `expedition.vessel_id` drives linked campaigns, derived deployment, KPI, selection/detail | Implemented baseline. `At Sea` is inferred from expedition Active status, not observed ship location; no backend change. |
| **03 Marine Zones — Mapping** | marine_zone; GET marine-zones + missions | Full CRUD; ADMIN writes | `mission.zone_id` gives counts/list; max depth, depth span = max-min; risk is stored | Neither zone route nor current resource table returns mission_count. Join complete collections by ID; report missions endpoint also has zone_id. No backend change. |
| **04 Offshore Assets — Mapping** | offshore_asset; GET offshore-assets + inspection-tasks | Full CRUD; ADMIN writes | `inspection_task.asset_id` gives total, Pending/In Progress, Completed, links; status/date/priority from tasks | No asset status column/rollup endpoint. “Inspection Due” can mean an existing Pending/In Progress task; “Surveyed” for an asset with **zero** tasks would falsely imply an inspection. Need approved label/rule for zero tasks. No mandatory backend change. |
| **05 Operators — Mapping** | `operator`, operator_contact; GET operators + mission-operators + missions | Full CRUD; ADMIN writes | Contacts are returned as an array; join duty rows by operator_id and missions by mission_id for In Progress | Assignment GET omits mission status. “Expert Certified” is a string pattern in free-text certification_level, not a constrained tier; agree exact match convention before counting. No backend change. |
| **06 AUV / ROV Vehicles — Mapping** | auv_rov; GET vehicles + vehicle-sensors + mission-vehicles + vehicle-batteries; optional report vehicle-readiness | Full CRUD; ADMIN writes | Status is stored; sensor/mission counts and current open battery via relation keys | The vehicle list API has no linked counts/battery ID. `vw_vehicle_readiness` has sensor_count and open **count**, not battery identity or mission count. Use full relation collections; no backend change. |
| **07 Sensors — Decision** | sensor; GET sensors + vehicle-sensors | Full CRUD; ADMIN writes | Fitment counts/list by sensor_id; calibration_date/accuracy stored | Calibrated/Due Soon and their KPIs/filter have no rule. Show date and installations until interval/due policy is approved. No current API gives status. A stored per-sensor policy would require model/API change; a global approved rule could be derived in frontend. |
| **08 Battery Packs — Mapping** | battery_pack; GET battery-packs + vehicle-batteries | Full CRUD; ADMIN writes | Sum capacity; Excellent/Good/Replace from stored health_status; assignment periods by battery_id | Assignment count/link requires collection join. Artifact chip set omits valid **Poor** enum; include it. No backend change. |
| **09 Vehicle Sensors — Direct** | vehicle_sensor; GET vehicle-sensors | Full CRUD; ADMIN/OPERATOR writes | GET already joins vehicle/sensor names, maker, mount, date; composite keys immutable | “Installed” pill is merely row existence, not sensor operating/calibration state. “Sensors In Service” should mean installed sensor IDs unless a real service rule is added. No backend change. |
| **10 Vehicle Batteries — Direct** | vehicle_battery; GET vehicle-batteries | Full CRUD; ADMIN/OPERATOR writes | Open iff end_cycle NULL; closed otherwise; distinct battery_id for packs in rotation | Open means an unended recorded assignment, not live power telemetry. Three-part key uses start_cycle query parameter. No backend change. |
| **11 Maintenance Records — Decision** | maintenance_record; GET maintenance-records | Full CRUD; ADMIN/OPERATOR writes | Joined vehicle status; cost sum; recorded next_due_date and maintenance date | No maintenance lifecycle status. Past due date is directly testable but superseding records and no due dates complicate “Overdue/Pending/Completed”. `vw_vehicle_readiness` MIN historical due is unsafe for current due. Rule approval needed; no threshold should be invented. |
| **12 Missions — Mapping** | mission; GET missions + mission-vehicles + mission-operators | Full CRUD; create ADMIN/RESEARCHER, update adds OPERATOR, delete ADMIN | Expedition and zone already joined; duration_minutes returned; assignment counts/lists by mission_id | Resource GET lacks vehicle/operator counts; report mission_operations has counts but not linked lists. Artifact chips omit valid **Aborted**. No backend change. |
| **13 Mission Vehicles — Direct** | mission_vehicle; GET mission-vehicles | Full CRUD; ADMIN/RESEARCHER/OPERATOR writes | Joined names/type; recovered iff recovery_time set; distinct vehicles used | “At Depth” is an inference from NULL recovery_time, not a live depth/position. Prefer “Unrecovered” if literal operational truth is required. No backend change. |
| **14 Mission Operators — Mapping** | mission_operator; GET mission-operators + missions | Full CRUD; ADMIN/RESEARCHER/OPERATOR writes | Join mission_id to parent status for state; distinct operator_id, shifts/duties | Assignment GET has no status. On Active Duty can count parent In Progress only by agreed meaning; no schedule clock semantics in shift text. No backend change. |
| **15 Telemetry Points — Decision** | telemetry_point; GET telemetry-points | Full CRUD; ADMIN/OPERATOR writes | Position/depth/battery percentage/temp stored; mission context joined | Nominal/Warning, Low-Power Points and chips lack a threshold. No battery_pack relation from telemetry: mission_id only. An approved threshold may be computed client-side; persisted/configurable policy would require backend/model work. |
| **16 Incidents — Direct** | incident; GET incidents | Full CRUD; ADMIN/OPERATOR writes | Severity enum, report timestamp, full description, parent mission, distinct affected mission IDs | No incident open/closed field; “Recorded Incidents” is accurate. Table truncation is visual only. No backend change. |
| **17 Inspection Tasks — Direct** | inspection_task; GET inspection-tasks | Full CRUD; ADMIN/OPERATOR writes | Joined mission/asset, priority/status enums; open = Pending or In Progress | Existing workflow requires finding_summary on Completed/Cancelled and restricts transitions. “Open Tasks” must follow actual enum; no backend change. |
| **18 Expeditions — Mapping** | expedition; GET expeditions + missions | Full CRUD; ADMIN/RESEARCHER create/update; ADMIN delete | Vessel and mission_count returned; linked mission list by expedition_id; budget sum | Artifact filters omit valid **Cancelled**. “Planned Missions” is ambiguous: mission.status Planned vs missions belonging to Planned expeditions; settle label/count interpretation before rendering. No backend change. |
| **19 Samples — Mapping** | sample; GET samples + sample-aliquots | Full CRUD; ADMIN/RESEARCHER create/update; ADMIN delete | `aliquot_count` returned; aliquot detail list by sample_id; custody enum stored | Artifact filters omit valid **Disposed**. Cross-page “aliquots derived” count must distinguish aliquot rows from number of samples with aliquots. No backend change. |
| **20 Sample Aliquots — Direct** | sample_aliquot; GET sample-aliquots | Full CRUD; ADMIN/RESEARCHER create/update; ADMIN delete | Parent sample type/preservation/custody already joined; composite key immutable; volume sum | No aliquot custody column: pill inherits parent. Artifact filters omit **Disposed**. “Custody Closed” has no defined set of parent states; do not display until defined or relabel to a specific enum. No backend change. |
| **21 Reports — Decision** | five SQL views; five GET /api/reports/* | Read only; no POST/PUT/DELETE | Existing `reporting.js` tabs, column sets, server query filters, refresh, context rail | Export CSV is artifact-only. Current UI has no export and API has no CSV. Decide client-side returned-row download or server route/full report contract; no route added by this audit. |
| **22 Interface States — reference** | No entity; no GET | No CRUD | Shared loading/empty/error/restricted/modal/confirm/toast patterns | Not an application route. Existing Ui/Master pieces are partial baseline; implementing visual system later is frontend work only. |
| **23 Design Index — reference** | No entity; no GET | No CRUD | Reviewer index and design rules | Not an application route; no production implementation. |

The full CRUD routes above have server-side validation and FK/workflow constraints. The approved page compositions—search chips, selected-row detail, pagination, linked lists, and action placement—are **frontend implementation work** for 03–20 even where the data is directly available.

## 7. Five “BACKEND MAPPING REQUIRED” Decisions

### 7.1 Sensor calibration currency

`database/schema.sql` defines only `sensor(sensor_id,sensor_type,manufacturer,calibration_date,accuracy)`; `vehicle_sensor` records installation, not a calibration cycle. `backend/routes/sensors.py` returns calibration_date and validates that it is a real date no later than today. It does **not** calculate an expiry, next calibration, or “Due Soon”; neither `frontend/js/resources.js` nor `master-data.js` does so. No stored interval, manufacturer-specific interval, next-calibration field, or policy was found in schema, migration, route, or frontend. **Conclusion:** the status cannot legitimately be derived now. An approved validity interval and due-soon window (possibly per sensor) are missing. The artifact's Calibrated/Due Soon examples are sample labels, not evidence of a rule.

### 7.2 Maintenance overdue

`maintenance_record` contains `maint_date` and nullable `next_due_date`; the latter must be on/after maint_date. `backend/routes/maintenance_records.py` returns both and joined `vehicle_status`, validates date ordering, and has no workflow status. A row with `next_due_date < current date` has a **past recorded due date**, a legitimate date fact. It does not prove the vehicle is currently overdue: a newer maintenance row may supersede it, the record may have no due date, and vehicle.status = Maintenance is a separate vehicle field. The artifact itself labels an older record with a past due date “Completed” while a later record for another vehicle is “Overdue”; simple per-row date comparison would contradict it. `vw_vehicle_readiness` takes MIN of historical non-null due dates, so it also cannot settle current due. **Conclusion:** “past due date” is derivable, but “Overdue/Pending/Completed” as a maintenance lifecycle is not an existing rule. Approve how to choose the current maintenance record and classify no-due/maintenance/retired states, or use factual dates and vehicle status without the design pills.

### 7.3 Telemetry battery Nominal / Warning

`telemetry_point.battery_level DECIMAL(5,2)` and its `CHECK BETWEEN 0 AND 100` establish a percent. `backend/routes/telemetry_points.py` validates 0–100 and returns the reading; it makes no warning calculation. `battery_pack.health_status` is a separate enum on packs, with no telemetry_point → battery_pack key or known threshold. No threshold in the current frontend, routes, schema, or migrations. The artifact marks 55.60, 48.20, and 43.90 as Warning while 61.30 is Nominal; this **suggests** an illustrative threshold, but is not a business rule. **Conclusion:** Nominal/Warning and Low-Power Points cannot be stated as facts until a threshold and comparison semantics are approved. Existing percentage remains displayable.

### 7.4 Offshore inspection and marine-zone mission rollups

**Asset:** `inspection_task.asset_id` is a non-null FK to `offshore_asset.asset_id` (RESTRICT on asset deletion). `inspection_task.status` is Pending/In Progress/Completed/Cancelled; there is no task due-date column. `GET /api/inspection-tasks` returns asset_id, task status, priority, and joined asset/mission fields. Count all rows per asset for “Tasks”; count Pending + In Progress for “Open Inspections”; count Completed for “Completed Inspections”. “Inspection Due” can be explicitly defined as at least one pending/in-progress task, but **not** as a date-due claim. “Surveyed” only follows “no open task” as a presentation label and is misleading for zero-task assets; an “No inspections recorded” state is factual. The asset GET route itself returns no rollup.

**Zone:** `mission.zone_id` is a non-null FK to `marine_zone.zone_id` (RESTRICT on zone deletion). `GET /api/missions` returns both zone_id and zone_name; `GET /api/marine-zones` returns zone_id. Count mission rows where IDs match, including all statuses, for the artifact's historical mission count; “Zones In Use” can count distinct zone IDs with at least one mission. `GET /api/reports/missions?zone_id=N` also filters `vw_mission_operations`, but the resource GET route already supplies all needed data. No new backend endpoint is required.

### 7.5 Reports Export CSV

`backend/routes/reports.py` defines five JSON GET endpoints over the five views and no CSV, attachment, or export path. `frontend/js/reporting.js` supports tab selection, the defined server-side filter, refresh, and rows returned, with no export control. The artifact contains a static “Export CSV” link. **Classification: B for server-managed export**—report data exists, but a server-produced filtered/full CSV would require a new route and response contract. A download of exactly the rows already returned can instead be built in the browser without a backend change; that is a product scope choice. This audit implements neither.

## 8. Unsupported / Ambiguous Design Elements

1. Calibration Current/Due Soon and telemetry Nominal/Warning have no approved business thresholds.
2. Maintenance “Completed/Pending/Overdue” is not a stored workflow; historical service and nullable due dates require a rule.
3. Asset “Surveyed” does not follow from zero open tasks when no task has ever been recorded; “Inspection Due” has no deadline semantics.
4. Mission Vehicle “At Depth” from NULL recovery_time asserts a present location that the row does not establish. “Unrecovered” is the literal database fact.
5. “In Service” sensor wording is unsupported beyond a recorded installation. Operator certification level is free text; “Expert Certified” needs a confirmed string convention.
6. “Planned Missions” (Expeditions), “On Active Duty” (Mission Operators), and “Custody Closed” (Sample Aliquots) need precise enum/set definitions or factual replacement labels.
7. Several artifact filter sets reflect seeded values rather than full schema enums: Battery Packs omit Poor; Missions omit Aborted; Expeditions omit Cancelled; Samples/Aliquots omit Disposed. Full enum filters should be used. Historical sample counts, mock timestamps, and linked-list contents must never be embedded.
8. Design's “page never scrolls” target at desktop sizes must be reconciled with small viewports/accessibility using internal panel scrolling, without hiding records. This is frontend presentation risk, not a database gap.

## 9. Recommended Shared Frontend Architecture

Extract the Research Vessels presentation into reusable vanilla-JS functions/configuration: shell/header, section tabs, KPI descriptors, register columns, filter definitions, row selection, pagination (8 rows), detail facts/linked lists, loading/error/empty/restricted states, and RBAC-aware actions. Keep resource definitions in `resources.js`, form metadata and `recordPath()` in `master-data.js`, and API calls through `api.js`. Add page-specific **pure mapping functions** keyed by actual IDs for aggregates and linked lists; never copy artifact `DATA`. Reuse a single register renderer with per-page configuration rather than 18 duplicated DOM builders.

Fetch a primary collection plus only the adjacent collections needed for the displayed links/metrics. Cache those successful responses for search/filter/selection; no request per keystroke. Preserve failed-response distinction (`null`/unavailable versus successful empty array), stale-request sequence protection, existing session handling, and backend RBAC. Keep `reports` on its existing read-only module and build shared visual components around it. The Dashboard and Research Vessels are already approved baselines; this audit proposes no visual change to them.

## 10. Recommended Implementation Order

1. Shared register/detail/state components extracted from Research Vessels, with existing navigation, search, auth, RBAC, and CRUD hooks kept intact.
2. Direct data pages: Vehicle Sensors, Vehicle Batteries, Mission Vehicles, Incidents, Inspection Tasks, Sample Aliquots.
3. Straight collection aggregations: Battery Packs, Marine Zones, Operators, Vehicles, Missions, Mission Operators, Expeditions, Samples, Offshore Assets. Show unavailable relation data explicitly.
4. Resolve the calibration, maintenance, telemetry, and ambiguous wording decisions; then implement Sensors, Maintenance Records, Telemetry Points.
5. Reports visual integration; implement CSV only after export scope is chosen.
6. Shared Interface States visual pass and responsive/functional regression checks. Design Index stays a review artifact.

## 11. Decisions Requiring User Approval

1. Define sensor calibration validity and “Due Soon” window, or omit those status/KPI/filter elements and show only calibration_date.
2. Define maintenance current-record selection and status mapping, or replace lifecycle pills with factual `maint_date`, `next_due_date`, and vehicle status.
3. Define the telemetry battery warning percentage/comparison (and whether it is a global or vehicle-specific rule), or omit Nominal/Warning and Low-Power counts.
4. Approve “No inspections recorded” for assets with zero tasks, and whether “Inspection Due” should instead be called “Open inspection tasks” since there is no due date.
5. Choose Reports CSV scope: export the currently returned rows in-browser, or add an authenticated server export route for full/filtered report results.
6. Confirm the exact meanings of free-text/derived labels before they become KPIs: “Expert Certified”, “Planned Missions”, “On Active Duty”, and “Custody Closed”. Factual field-level replacements need no new backend behavior.

### Requirement decision matrix

| Requirement | Existing DB Support | Existing API Support | Derivable Now | Backend Change Needed | User Decision Needed |
|---|---|---|---|---|---|
| Sensor calibration date and installations | Yes | Yes: sensors + vehicle-sensors | Yes | No | No |
| Calibrated / Due Soon currency | Date only; no interval/due field | Date only | **No** | Only if policy must be stored/per-sensor | **Yes** |
| Maintenance recorded due date passed | Yes | Yes: maintenance-records | Yes, as a date comparison | No | No |
| Current maintenance Overdue/Pending/Completed | No lifecycle status | No lifecycle calculation | **No reliable existing rule** | Only if lifecycle/current-service state must be persisted | **Yes** |
| Telemetry battery percentage | Yes, 0–100 | Yes: telemetry-points | Yes | No | No |
| Nominal / Warning and Low-Power | No threshold | No threshold | **No** | Only if configurable/persisted rule required | **Yes** |
| Asset task/open/completed counts | Yes, asset_id FK + enum | Yes: assets + inspection-tasks | Yes by asset_id | No | No |
| Asset “Surveyed” with no tasks | No survey-state field | No survey-state response | **No** | Only if a true survey lifecycle is required | **Yes** |
| Marine-zone mission count | Yes, mission.zone_id FK | Yes: zones + missions | Yes by zone_id | No | No |
| Reports rows and existing filters | Five SQL views | Five JSON report GETs | Yes | No | No |
| Export returned rows as CSV | Yes, from report rows | JSON data sufficient | Yes, client-side | No | **Yes, export scope** |
| Server-generated/full report CSV | Views exist | No export route | No | **Yes** | **Yes** |

## Verification record

- Read `docs/ui-design-handoff/README.md`, all four design-system documents, the master index, and **all 23** numbered page specifications.
- Inspected all **23** `.dc.html` files for their data keys, filters, and page structures; inspected the sensor, maintenance, telemetry, asset, zone, operator, vehicle, report, state, index, and vessel artifacts more closely where mapping or semantics depended on their content. `support.js` is design runtime, not a production data source.
- Inspected `database/schema.sql` including keys, checks, views, and relevant sample records; scanned migrations and sample data for competing rules.
- Inspected route registrations, methods, response joins, and relevant validation in `backend/routes/`, plus central authorization in `backend/authentication.py` and `backend/app.py`.
- Inspected `frontend/index.html`, `app.js` (including Research Vessels), `style.css`, `resources.js`, `master-data.js`, `permissions.js`, `api.js`, `ui.js`, and `reporting.js`. No application file was edited.
- `git diff --check` completed without whitespace errors. Because this audit file is untracked, it was also checked separately with `git diff --no-index --check` (which returns exit 1 for the expected new-file difference, with no whitespace error).
