# AquaFleet Limitations and Future Work

This document separates honest current limitations from optional expansion.
It does not defer any core DBMS requirement: the project already implements
relational design, CRUD, authentication/RBAC, views, triggers, procedures,
transactions, indexes, reports, validation, migration and testing.

## Current limitations

- **Local coursework deployment.** Configuration and run instructions target
  a single local Flask/MySQL installation, not a multi-node production system.
- **Coursework identities.** Users are stored locally with secure hashes and
  signed sessions; there is no institutional SSO, MFA, recovery flow or
  administrator-facing account-management screen.
- **Simulated operational data.** Telemetry and marine events are entered or
  seeded for demonstration; no physical AUV/ROV hardware is connected.
- **No streaming telemetry.** The REST CRUD model handles coursework-scale
  points but is not a high-frequency ingestion pipeline.
- **Limited pagination.** Resource tables load current datasets at once and
  use client-side search, suitable for the small demonstration dataset.
- **No GIS map.** Coordinates are validated and reportable but are displayed
  in tables rather than nautical/map layers.
- **No notification engine.** Incidents, maintenance due dates and critical
  battery health do not send email/SMS/push alerts.
- **No immutable audit trail.** Domain history is relationally protected, but
  the application does not record every user mutation in an append-only log.
- **Single database target.** The SQL and migration deliberately target
  MySQL 8 and are not advertised as portable to other engines.

## Credible future enhancements

- Deploy behind HTTPS with a production WSGI server, managed MySQL, secret
  management, monitoring and tested restore procedures.
- Integrate university/organization IAM with SSO and MFA while mapping external
  identities to AquaFleet roles.
- Add WebSocket/message-queue ingestion for authenticated vehicle telemetry,
  batching and retention management.
- Add GIS layers for zones, missions, assets and telemetry tracks.
- Add configurable alerts for critical incidents, low batteries, overdue
  maintenance and failed inspections.
- Add server-side pagination and indexed full-text/search strategies for much
  larger deployments.
- Add an append-only audit table capturing actor, operation, record identity,
  timestamp and approved before/after metadata.
- Add richer analytical dashboards such as reliability trends, mission success
  rates and maintenance cost forecasting, derived from existing normalized data.
- Add attachment/object storage for imagery, sonar files, laboratory documents
  and inspection media, referenced by database metadata rather than stored as
  large blobs in the relational tables.

These enhancements should be justified by deployment scale or research needs;
they are not required to demonstrate the completed DBMS course concepts.
