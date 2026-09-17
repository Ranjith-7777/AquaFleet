# AquaFleet Faculty Demo Runbook

Target duration: 5–7 minutes. Use the existing deterministic data; do not add
live records unless the examiner specifically asks.

## Before entering the room

1. Start MySQL 8 and confirm `aquafleet_db` is selected in `backend/.env`.
2. If the four coursework logins need a deliberate reset, run:

   ```powershell
   backend\venv\Scripts\python.exe backend\create_demo_users.py --reset
   ```

3. Start Flask from `backend` with `venv\Scripts\python.exe app.py`.
4. Start the frontend from the repository root with
   `python -m http.server 5500 --directory frontend`.
5. Open `http://127.0.0.1:5500` and keep MySQL Workbench ready with
   `database/faculty_demo.sql` open.
6. Confirm `GET /api/health/database` reports `aquafleet_db`, then leave the
   browser at the sign-in screen.

Primary login: `admin` / `AquaAdmin@2026`
Read-only login: `viewer` / `AquaViewer@2026`

## 0:00–0:40 — Introduction

Say:

> AquaFleet is a Marine Research Fleet Management System built with Flask,
> MySQL and Bootstrap. It manages research vessels, expeditions, missions,
> underwater vehicles, scientific samples, telemetry, maintenance and
> offshore inspections in one normalized relational database.

Briefly point to the browser–REST API–MySQL architecture. Emphasize that the
frontend uses `fetch`, Flask owns validation/authorization, and MySQL owns
relational integrity.

## 0:40–1:20 — Database design

Open `database/schema.sql` or `docs/RELATIONSHIP_GUIDE.md`. Show this chain:

```text
Research Vessel 1:N Expedition 1:N Mission
Mission M:N Vehicle      through mission_vehicle
Mission M:N Operator     through mission_operator
Vehicle M:N Sensor       through vehicle_sensor
Vehicle M:N Battery      through vehicle_battery
Mission 1:N Telemetry / Sample / Incident / Inspection
Sample 1:N Sample Aliquot
```

Point out the composite primary key of `mission_vehicle` and the dependent
key `(mission_id, log_no)` in `telemetry_point`. Expected takeaway: M:N
relationships and weak entities are represented without duplicated data.

## 1:20–2:30 — Application workflow

Sign in as ADMIN and follow this existing story:

1. Dashboard: point out live counts and database connection.
2. Expeditions: open **Carlsberg Ridge Hydrothermal Vent Programme**. It uses
   **RV Samudra Anveshak** and has two missions.
3. Missions: open **Hydrothermal Plume Survey**. Point out expedition, zone,
   target depth, status and derived relationship data.
4. Assignments → Mission Vehicles: show **Neelkanth ROV-1** and
   **Sagarika AUV-2** assigned to that mission.
5. Assignments → Mission Operators: show the named crew, duty roles and shifts.
6. Scientific Records: show its telemetry, samples/aliquots and incidents.

Mention that Add/Edit/Delete forms use readable related names, while requests
carry normalized IDs. Do not submit a new row unless asked.

## 2:30–3:10 — RBAC

Sign out, then sign in as VIEWER.

1. Open Missions or Research Vessels: only View/Refresh are available.
2. Open Reports: all reports remain readable.
3. Say: “Hidden controls are only UX. Flask checks the live `app_user` row and
   the resource/action permission table. A direct unauthorized mutation gets
   HTTP 403 and the valid session remains active.”

If asked for other roles: RESEARCHER plans expeditions/missions and manages
samples; OPERATOR updates missions and manages assignments, telemetry,
equipment, incidents, inspections and maintenance.

## 3:10–4:00 — DBMS features

In MySQL Workbench, run these small sections from `database/faculty_demo.sql`:

1. View:
   `SELECT * FROM vw_mission_operations WHERE status = 'Completed';`
   Expected: joined expedition/zone names, duration and assignment counts.
2. Procedure:
   set `@demo_expedition_id` and call `sp_get_expedition_metrics`.
   Expected: separate mission, incident and sample OUT values.
3. Trigger section: call `sp_faculty_trigger_demo()`.
   Expected: `trigger_rejected_invalid_depth = 1` and
   `invalid_rows_remaining = 0`.
4. Transaction/savepoint sections if requested.
   Expected: committed sample is displayed then cleaned; rollback restores the
   original battery status; savepoint removes only the aliquot work.

Avoid typing large SQL live—the prepared script is deliberately ordered and
commented.

## 4:00–5:00 — Reports

Return to the VIEWER Reports screen and click each tab:

1. **Expedition Summary** — vessel plus derived mission count.
2. **Mission Operations** — expedition/zone, duration and assignment totals.
3. **Vehicle Readiness** — sensor/battery configuration and maintenance.
4. **Sample Lineage** — expedition → mission → sample → aliquot.
5. **Incident Overview** — severity with mission, expedition and zone.

Apply the Mission status filter **Completed** or Incident severity **High**.
Explain that Flask validates and parameterizes filters; the result rows come
from MySQL views.

## 5:00–6:00 — Integrity, migration and testing

Say:

- “PKs, 19 FKs, 6 UNIQUE constraints and 35 CHECK constraints protect data.”
- “Four triggers enforce cross-table depth/date/readiness rules.”
- “Transactions, rollback and savepoints protect multi-table workflows.”
- “The existing-database migration is idempotent and verifies row/user
  preservation after a backup.”
- “The final runner executes 40 backend/database tests, JavaScript syntax and
  frontend tests; browser verification covers every role.”

If asked about performance, run the prepared `EXPLAIN` section. Expected:
`idx_incident_severity_time` is a possible/selected key for the severity/time
query (the exact cost estimate may vary with dataset size).

## 6:00–7:00 — Questions / backup material

Useful prepared references:

- `docs/FINAL_DATABASE_INVENTORY.md` — exact objects and constraints
- `docs/DBMS_CONCEPT_MAP.md` — course concept mapping
- `docs/RELATIONSHIP_GUIDE.md` — cardinality and delete behavior
- `docs/VIVA_QA.md` — concise answers
- `database/faculty_demo.sql` — optional SQL questions

End by signing out. The prepared SQL script removes all reserved demo rows; its
final query should return zero demo missions, samples and aliquots.
