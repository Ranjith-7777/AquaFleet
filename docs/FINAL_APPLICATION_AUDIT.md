# AquaFleet Final Application Audit

Audit date: 21 October 2026 (Asia/Calcutta)

Runtime audited: local Flask application at `http://127.0.0.1:5000`, MySQL 8.0.46, database `aquafleet_db`

Scope: frontend, Flask API, MySQL persistence, schema objects, authorization, reports, notifications, and safe CRUD workflows

## Final verdict

**READY for local coursework/demo use, with the explicitly listed test limitations below.**

The live Mission Create/Edit defect is fixed. A valid `In Progress -> Completed` edit now persists, closes the dialog, returns to and refreshes the dashboard, changes the active-mission KPI, and displays a success alert. The supplied "Soil Check" creation example is correctly rejected: its 2026 dates are outside the selected expedition's 3-28 November 2025 range, and a `Planned` mission may not have an end time. Its depth of 500 is valid for the selected zone.

The final audit also found and fixed a separate shared CRUD defect: modal-level API errors could be invisible because the alert element's `id` was passed through an unsupported `Ui.element` option. Duplicate-name errors now remain in the dialog and show a clear explanation.

All temporary live records and generated notifications were removed. Every live table returned to its exact pre-audit row count. No existing record, user account, credential, foreign key, trigger, view, procedure, or unrelated configuration was changed.

## Root causes and fixes

### Mission completion did not visibly succeed

The workflow had three gaps:

1. The shared mission form did not enforce the status/end-time invariant before sending the request.
2. Backend mission validation errors were not consistently mapped back to the relevant form control.
3. A mission edit launched from the dashboard detail dialog did not reload dashboard data after success.

Fixes:

- Added client validation for status/end time, start/end ordering, expedition date bounds, and zone depth bounds.
- Preserved and displayed backend field errors beside their fields.
- Made a successful mission mutation initiated from the dashboard rerender the dashboard before showing success.
- Added the database `chk_mission_status_end` constraint to fresh-schema SQL and an idempotent, non-destructive migration for existing databases.

### Supplied Mission Create example

The example is invalid, not a missing-record defect:

- Selected expedition: `Andaman Deep Reef Biodiversity Survey`, 2025-11-03 through 2025-11-28.
- Submitted start/end: 2026-10-22 and 2026-10-29, both outside that range.
- Submitted status: `Planned`, which requires `end_time = NULL`.
- Submitted depth: 500, which is inside the selected zone's allowed band and is therefore not an error.

Browser verification showed both applicable field errors, kept the dialog open, and inserted zero rows.

### Shared silent API-error defect

`master-data.js` created the modal alert node using `{id: "resource-modal-alert"}`. The shared DOM helper accepts attributes only through `attributes`, so no element received that ID and `showModalError()` had no target. API errors without a field map, including a duplicate-vessel `409`, appeared to do nothing.

The node is now created with `attributes: {id: "resource-modal-alert"}` in loading, create/edit, and delete dialogs. A live duplicate-name retest displayed `A research vessel with this name already exists` while leaving the form open.

## Application and database inventory

- 21 base tables, including `app_user` and `notification`.
- 19 direct CRUD resources.
- Five SQL reporting views: `vw_expedition_summary`, `vw_mission_operations`, `vw_vehicle_readiness`, `vw_sample_lineage`, and `vw_incident_overview`.
- Four stored procedures: `sp_get_expedition_report`, `sp_get_vehicle_maintenance_history`, `sp_get_mission_summary`, and `sp_get_expedition_metrics`.
- Twelve triggers:
  - Six integrity triggers: mission insert/update validation, mission-vehicle insert/update readiness, expedition date update protection, and marine-zone depth update protection.
  - Six notification triggers: incident insert/update, battery insert/update, and maintenance insert/update.
- Four application roles: Admin, Researcher, Operator, and Viewer.

The frontend resource registry, form registry, workspace pages, Flask blueprints, endpoints, and backing table/view relationships were inspected for all resources.

## Live browser CRUD matrix

One uniquely tagged dependency chain was created and edited through the real frontend. Each creation and edit was confirmed with a direct MySQL `SELECT`. Cleanup used the authenticated DELETE endpoint in reverse dependency order except for the completed inspection noted below.

| Resource | Browser create | Browser edit | Delete verification | MySQL persistence |
|---|---:|---:|---:|---:|
| Research Vessels | PASS | PASS | Confirmation/Cancel PASS; API delete PASS | PASS |
| Marine Zones | PASS | PASS | API delete PASS | PASS |
| AUV/ROV Vehicles | PASS | PASS | API delete PASS | PASS |
| Operators + contact | PASS | PASS | API delete PASS | PASS |
| Sensors | PASS | PASS | API delete PASS | PASS |
| Battery Packs | PASS | PASS | API delete PASS | PASS |
| Offshore Assets | PASS | PASS | API delete PASS | PASS |
| Expeditions | PASS | PASS | API delete PASS | PASS |
| Missions | PASS | PASS | API delete PASS | PASS |
| Mission Vehicles | PASS | PASS | API delete PASS | PASS |
| Mission Operators | PASS | PASS | API delete PASS | PASS |
| Vehicle Sensors | PASS | PASS | API delete PASS | PASS |
| Vehicle Batteries | PASS | PASS | API delete PASS | PASS |
| Maintenance Records | PASS | PASS | API delete PASS | PASS |
| Telemetry Points | PASS | PASS | API delete PASS | PASS |
| Samples | PASS | PASS | API delete PASS | PASS |
| Sample Aliquots | PASS | PASS | API delete PASS | PASS |
| Incidents | PASS | PASS | API delete PASS | PASS |
| Inspection Tasks | PASS | PASS | Historical-delete guard PASS; scoped SQL cleanup | PASS |

The completed inspection DELETE correctly returned `409` because completed inspections are immutable historical records. After verifying the row ID and unique audit tag, that single test row was removed directly so no audit data remained. No original row was affected.

The final destructive button in the graphical delete confirmation was not clicked; the confirmation and Cancel behavior were verified in the browser and the actual deletion contract was verified through the same local Flask DELETE endpoints. This avoids an unconfirmed destructive UI action while still testing backend deletion and persistence.

## Mission rules and workflow evidence

| Rule | Browser | API/database | Result |
|---|---:|---:|---|
| Planned / In Progress require `end_time = NULL` | PASS | PASS | Invalid end time is field-specific; constraint rejects invalid rows |
| Completed / Aborted require an end time | PASS | PASS | Missing end time keeps dialog open; valid completion persists |
| End time later than start time | Covered by form/tests | PASS | CHECK and validation reject invalid order |
| Mission dates within expedition dates | PASS | PASS | Supplied 2026/2025 mismatch correctly rejected |
| Target depth within zone band | PASS | PASS | Out-of-band rejected; supplied depth 500 accepted as valid |
| Dashboard refresh after edit | PASS | N/A | Active KPI changed from 2 to 1; row changed to Completed; success shown |

The live database contained seven original missions and zero rows violating the new status/end-time rule before migration verification. `chk_mission_status_end` exists exactly once after the migration and still exists after all testing.

## Database migration safety

- `phase5_mission_status_end_constraint.sql` is non-destructive and checks `information_schema` before adding the named constraint.
- It aborts if any existing mission violates the rule.
- It preserves all rows and is repeatable.
- The migration manager registers it as `003_mission_status_end_constraint`.
- The live database did not contain the migration history table used by the manager, so the guarded migration SQL was applied directly rather than replaying earlier migrations.
- `schema.sql` and `sample_data.sql` were never executed against `aquafleet_db`.
- Disposable test schemas were explicitly confirmed distinct from `aquafleet_db`; the full test suite created and removed only fixed `aquafleet_*_test` schemas.

## Integrity, triggers, views, procedures, and transactions

Disposable-DB tests passed for:

- primary, composite primary, unique, foreign-key, CHECK, and restricted-delete behavior;
- duplicate junction rows and orphan foreign keys;
- mission date/depth and mission-vehicle readiness triggers on insert and update;
- parent expedition/zone updates that would invalidate child missions;
- incident, battery-health, and maintenance notification insert/update rules;
- notification deduplication/escalation and rollback with its source mutation;
- commit/rollback of a multi-row mission resource workflow;
- savepoint recovery from an invalid sample aliquot;
- all five views, report filters, indexes, and read-only API behavior;
- all four stored procedures and OUT parameters.

Live read-only calls additionally returned the temporary chain from every view. Procedure result-set counts were `1+1` for expedition and maintenance procedures, `1+1+1` for the mission summary, and expedition OUT metrics were one mission, one incident, and one sample.

## Notifications

The live audit chain generated exactly two notifications:

- maintenance due soon;
- high incident reported, subsequently escalated to Critical without duplicate spam.

The browser showed a badge of two, both messages, timestamps, and categories. `Mark all read` changed the badge to zero and MySQL recorded both as read. The two temporary notification rows were then removed during cleanup. Automated tests also cover battery condition notifications, severity thresholds, escalation deduplication, timing windows, and transactional rollback.

## Authentication and RBAC

Real browser sessions verified:

- invalid credentials show a visible rejection;
- Viewer sees read-only data and reports, with no Add/Edit/Delete controls;
- Researcher can add expeditions and missions and edit missions, but cannot delete them or add telemetry;
- Operator can edit missions and add telemetry, but cannot create/delete missions or add samples;
- Admin sees full mutation controls.

Backend tests verified 401/403 boundaries, all resource policies, inactive-account session invalidation, database role changes taking effect without cookie changes, and that forbidden requests do not clear an otherwise valid session. Session lifetime configuration is covered by an automated test; a real-time browser wait through the full expiry interval was not performed.

## Reports and general UX

- All sidebar groups and all 19 resource pages loaded through real navigation.
- Detail panels, Add/Edit dialogs, validation errors, success alerts, Cancel, delete confirmation, search, filters, empty results, Clear Filters, and pagination were exercised.
- Telemetry pagination moved from page 1 to page 2; an impossible search displayed `No matching records` and Clear Filters restored eight rows.
- All five reports loaded without error and returned 6, 8, 6, 13, and 7 rows respectively while the temporary chain existed.
- Mission status filtering plus search isolated one temporary completed mission.
- CSV export completed successfully; the downloaded audit CSV was removed afterward.
- A direct SQL update to the temporary vessel became visible after frontend navigation/refetch, confirming frontend/database synchronization.
- No console-visible application error was encountered during the verified workflows.

The normal desktop layout was exercised. Dedicated mobile/tablet viewport emulation was not available in the connected browser surface, so responsive behavior was inspected from the repository CSS and existing frontend tests but not claimed as a real-device browser pass.

## Automated test results

Final post-fix run:

- Python compilation: PASS.
- Backend/database: **68 of 68 passed**, zero skipped, zero failed, with database tests enabled.
- Frontend: **11 of 11 test files passed**.
- JavaScript syntax: all frontend JavaScript files passed `node --check`.
- Git diff hygiene: PASS.
- Disposable database cleanup: PASS; zero `aquafleet_*_test` schemas remain.

## Live data preservation and cleanup

Pre- and post-audit row counts matched exactly for all 21 tables:

`app_user 6`, `auv_rov 5`, `battery_pack 5`, `expedition 5`, `incident 6`, `inspection_task 7`, `maintenance_record 6`, `marine_zone 4`, `mission 7`, `mission_operator 10`, `mission_vehicle 8`, `notification 0`, `offshore_asset 5`, `operator 6`, `operator_contact 8`, `research_vessel 6`, `sample 8`, `sample_aliquot 12`, `sensor 6`, `telemetry_point 15`, `vehicle_battery 6`, and `vehicle_sensor 8`.

Final checks: zero audit-tagged rows, zero invalid missions, one named mission constraint, zero disposable test schemas, and no downloaded audit CSV.

Auto-increment counters advanced while temporary rows were created and deleted. This is normal MySQL behavior and does not alter or renumber existing records.

## Files modified

- `backend/manage_database.py` - registers the new migration.
- `backend/tests/test_deployment.py` - migration safety/idempotence regression coverage.
- `backend/tests/test_missions_validation.py` - mission business-rule regression tests.
- `database/schema.sql` - fresh-schema mission status/end-time CHECK.
- `database/migrations/phase5_mission_status_end_constraint.sql` - guarded live migration.
- `frontend/js/app.js` - dashboard refresh after a successful dashboard-origin mission mutation.
- `frontend/js/master-data.js` - mission cross-record validation, backend field-error handling, and functional modal alert IDs.
- `frontend/tests/dashboard.test.js` - dashboard mutation refresh regression.
- `frontend/tests/phase1.test.js` - mission form rules and modal-alert regression.
- `docs/FINAL_APPLICATION_AUDIT.md` - this report.

## Remaining issues / limitations

1. The final destructive action inside the graphical Delete confirmation was not executed; authenticated API DELETE behavior, referential rejection, cleanup, and browser confirmation/Cancel were verified instead.
2. A full real-time session-expiry wait was not performed; configuration and inactive-session behavior passed automated tests.
3. Mobile/tablet viewport emulation was unavailable in the connected browser surface, so no real-device responsive claim is made.
4. Auto-increment gaps remain from safe temporary record creation/deletion; no original data is missing.

No known functional defect remains in the audited Mission Create/Edit workflow or shared CRUD error reporting.
