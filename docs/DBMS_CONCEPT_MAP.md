# AquaFleet DBMS Concept Map

| DBMS concept | AquaFleet implementation |
|---|---|
| Primary Key | `mission.mission_id`, `expedition.expedition_id` and surrogate identifiers uniquely identify strong entities. |
| Foreign Key | `mission.expedition_id` and `mission.zone_id` require an existing expedition and marine zone. |
| Composite Key | `mission_vehicle(mission_id, vehicle_id)` uniquely identifies one assignment; `vehicle_battery` adds `start_cycle` for repeated installations. |
| UNIQUE | `research_vessel.vessel_name`, `auv_rov.vehicle_name`, `operator.email` and `app_user.username` enforce business uniqueness. |
| CHECK | Mission time/depth/status, coordinates, battery percentage, positive volumes/costs and canonical roles are constrained in MySQL 8. |
| 1:N | One expedition contains many missions; `mission.expedition_id` stores the FK. |
| M:N | Missions and vehicles are related through `mission_vehicle`, which also stores launch/recovery times. |
| Weak/dependent entity | `telemetry_point` uses (`mission_id`, `log_no`); `sample_aliquot` uses (`sample_id`, `aliquot_no`). Neither local number identifies a row without its owner. |
| Multivalued attribute | Operator phone numbers are decomposed into `operator_contact`, one atomic number per row. |
| Normalization | Reusable vessels, zones, vehicles, sensors, batteries and operators are separate tables; junctions resolve M:N relationships; derived duration/counts are not duplicated. The design follows 1NF–3NF principles. |
| Join | `vw_mission_operations` joins mission, expedition, zone and assignment aggregates to present operational context. |
| INNER JOIN | The faculty script follows vessel → expedition → mission → zone and returns only matching operational rows. |
| LEFT JOIN | Mission/vehicle reporting retains missions with no assignment and labels them “Not assigned.” |
| Aggregate | `COUNT`, `AVG` and `MAX` summarize mission totals and target depth; view subqueries derive assignment counts. |
| GROUP BY / HAVING | The faculty query returns only expeditions having at least two missions. |
| Subquery | Missions deeper than the overall average use a non-correlated AVG subquery. |
| Correlated subquery | A per-mission sample count refers to the current outer `mission_id`. |
| View | Five read-only report views expose expedition summary, mission operations, readiness, sample lineage and incidents. |
| Trigger | `trg_mission_validate_bi/bu` reject mission depths outside the zone and dates outside the expedition. Vehicle assignment triggers reject retired vehicles. `trg_expedition_dates_bu` and `trg_zone_depth_bu` protect missions from parent edits; six `*_notify_*` AFTER triggers populate `notification`. |
| Stored Procedure | `sp_get_expedition_report`, `sp_get_mission_summary` and `sp_get_vehicle_maintenance_history` package reusable reports. |
| IN parameter | `sp_get_mission_summary(IN p_mission_id INT)` selects one mission and its assignments. |
| OUT parameter | `sp_get_expedition_metrics` returns mission, incident and sample totals through three OUT variables. |
| Transaction | Mission-plus-resource assignment and sample-plus-aliquot workflows commit only when all required statements succeed. |
| Atomicity | A failed operator FK after mission/vehicle work causes the entire transaction to roll back in the integrity test. |
| COMMIT | The faculty script commits a valid sample and aliquot as one unit, displays it, then performs targeted cleanup. |
| ROLLBACK | A temporary battery-health update is rolled back, leaving the original value unchanged. |
| Savepoint | The sample workflow keeps the parent sample while rolling back a questionable aliquot before replacement. |
| Index | `idx_incident_severity_time(severity, time_reported)` supports the filtered, time-ordered incident report. |
| EXPLAIN | Query-plan checks prove the three reporting indexes are candidate/selected keys; the optimizer may choose differently as data volume changes. |
| Authentication | Login verifies a Werkzeug password hash and creates a Flask session signed with `SECRET_KEY`. Plaintext passwords are never stored. |
| RBAC | `app_user.role` provides identity data; `authentication.py` maps HTTP resource/action pairs to ADMIN, RESEARCHER, OPERATOR and VIEWER. |
| Referential integrity | 19 FKs prevent orphans. CASCADE removes owned/dependent rows; RESTRICT protects vessels, zones and offshore assets with history. |
| Validation | Forms improve UX, Flask validates API payloads, and database constraints/triggers protect every client including direct SQL. |
| Parameterized query | Flask passes request values through `%s` placeholders, preventing them from becoming executable SQL text. |
| Derived attribute | Mission duration is calculated with `TIMESTAMPDIFF`; assignment and mission counts are derived through queries/views instead of stored redundantly. |
| Chain of custody | `sample.chain_of_custody_status` plus `sample_aliquot` creates queryable scientific lineage without duplicating expedition/mission names. |

## Normal-form explanation

- **1NF:** fields hold atomic values; repeating operator contacts are rows.
- **2NF:** relationship attributes in composite-key tables depend on the whole
  relationship key—for example, a mission vehicle's launch time belongs to
  both that mission and vehicle.
- **3NF:** descriptive data belongs to its own entity. A mission stores foreign
  keys, not copied vessel/expedition/zone names. Reports reconstruct context
  with joins.

The system deliberately derives mission duration and report counts. Storing
them alongside source timestamps/relationships would introduce update
anomalies and conflicting truths.
