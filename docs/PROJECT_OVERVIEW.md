# AquaFleet Project Overview

## 1. Problem statement

Marine research operations combine ships, expeditions, missions, underwater
vehicles, crew, scientific samples, telemetry, incidents, maintenance and
offshore inspections. Separate spreadsheets make relationships, history and
integrity difficult to maintain.

## 2. Objective

Build an understandable DBMS coursework application that records the complete
fleet workflow in a normalized MySQL database, exposes it through a validated
Flask REST API, and gives each user role an appropriate browser interface.

## 3. Implemented solution

AquaFleet is a local web application using HTML5/CSS3/Bootstrap 5 and vanilla
JavaScript, Python Flask, MySQL 8 and JSON APIs. It supports master and
operational CRUD, relationship assignments, authentication, backend RBAC,
five reports and database programming features.

## 4. Users and roles

- **ADMIN:** complete master, research and operational administration.
- **RESEARCHER:** expedition/mission planning and scientific sample/aliquot
  management, plus mission resource assignments.
- **OPERATOR:** mission execution, resource configuration, assignments,
  telemetry, maintenance, incidents and inspection tasks.
- **VIEWER:** authenticated read-only access including reports.

## 5. Architecture

```text
Browser -> JavaScript fetch -> Flask REST API -> MySQL 8
```

Flask signed sessions authenticate users. A central backend policy authorizes
every method/resource action. SQL values are parameterized. MySQL constraints,
triggers and transactions protect data regardless of client.

## 6. Database design

The implemented schema has 21 base tables. Strong entities have surrogate
keys; M:N relationships use four normalized junction tables; telemetry and
aliquots use owner-based composite keys. Nineteen FKs express relationships,
while UNIQUE and CHECK constraints protect business rules. CASCADE is used for
owned data and RESTRICT where history must protect a parent.

## 7. Core workflow

```text
Research Vessel
  -> Expedition
  -> Mission
  -> assign Vehicle(s) and Operator(s)
  -> configure vehicle Sensor(s) and Battery Pack(s)
  -> record Telemetry and Samples/Aliquots
  -> report Incidents and Inspection Tasks
  -> record Vehicle Maintenance
  -> review joined Reports
```

## 8. DBMS features

- Primary, foreign, composite and unique keys
- CHECK constraints and referential actions
- Four M:N junction tables and weak/dependent entities
- Parameterized joins, aggregates, subqueries and filtering
- Five reporting views
- Six cross-table integrity triggers and six notification triggers
- Four stored procedures, including IN and OUT parameters
- Commit, rollback and savepoint demonstrations
- FK and three dedicated reporting indexes with EXPLAIN checks
- Idempotent existing-database migration and verified backup process

## 9. Reports

The Reports screen provides Expedition Summary, Mission Operations, Vehicle
Readiness, Sample Lineage and Incident Overview. These are read-only,
authenticated endpoints backed by SQL views. Filters are allow-listed and
parameterized.

## 10. Validation and security

Validation exists at three levels: browser form guidance, Flask payload and
business-rule validation, and MySQL constraints/triggers. Passwords use
Werkzeug one-way hashes. Session cookies are signed, HTTP-only and configured
through environment settings. Database or password secrets are not committed.
Frontend permissions improve usability; backend RBAC is authoritative.

## 11. Testing

The final automated runner covers Python compilation, RBAC policy and HTTP
boundaries, real-MySQL schema objects, trigger rejection, stored procedures,
transactions, migration idempotency/data preservation, complete CRUD workflows,
report contracts, JavaScript syntax, frontend permission/report logic and diff
hygiene. Phase 3 completed 40 backend/database tests plus real-browser checks
for all four roles and a live end-to-end operational workflow.

## 12. Current limitations

AquaFleet is a local coursework deployment with simulated data. It does not
provide production identity federation, high-volume pagination, live vehicle
telemetry ingestion, GIS maps, external (email/SMS/push) notifications or immutable audit logging. See
`LIMITATIONS_AND_FUTURE_WORK.md` for the complete distinction.

## 13. Possible future enhancements

Future work could add hardened deployment, production IAM, GIS visualization,
IoT ingestion, alerting, audit trails and richer analytics. These are clearly
outside the implemented course scope; core relational, CRUD, integrity, RBAC,
reporting and transaction requirements are complete now.
