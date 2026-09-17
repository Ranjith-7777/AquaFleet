# AquaFleet Final Database Inventory

This inventory was checked against the upgraded local `aquafleet_db` on
18 September 2026 (MySQL 8.0.46). It describes the implemented database, not
a proposed design.

## Object totals

| Object | Count | Implemented objects |
|---|---:|---|
| Base tables | 21 | Domain tables plus `app_user` |
| Reporting views | 5 | `vw_expedition_summary`, `vw_mission_operations`, `vw_vehicle_readiness`, `vw_sample_lineage`, `vw_incident_overview` |
| Integrity triggers | 4 | Mission insert/update validation and mission-vehicle insert/update readiness checks |
| Stored procedures | 4 | Expedition report, mission summary, vehicle maintenance history, expedition metrics |
| Dedicated reporting indexes | 3 | `idx_expedition_status`, `idx_mission_status`, `idx_incident_severity_time` |

The live database contains 21 primary keys, 19 foreign keys, 6 additional
UNIQUE constraints and 35 CHECK constraints.

## Base tables and identifiers

| Table | Primary key | Purpose |
|---|---|---|
| `research_vessel` | `vessel_id` | Research ships |
| `marine_zone` | `zone_id` | Named operating areas and depth/risk limits |
| `auv_rov` | `vehicle_id` | Autonomous and remotely operated vehicles |
| `operator` | `operator_id` | Qualified human operators |
| `sensor` | `sensor_id` | Sensor catalogue |
| `battery_pack` | `battery_id` | Battery catalogue and health |
| `offshore_asset` | `asset_id` | Inspectable offshore infrastructure |
| `expedition` | `expedition_id` | Vessel-backed research campaigns |
| `mission` | `mission_id` | Operations within expeditions and zones |
| `operator_contact` | (`operator_id`, `contact_no`) | Multivalued operator contact numbers |
| `mission_vehicle` | (`mission_id`, `vehicle_id`) | Mission–vehicle assignment with deployment times |
| `mission_operator` | (`mission_id`, `operator_id`) | Mission–operator assignment with role and shift |
| `vehicle_sensor` | (`vehicle_id`, `sensor_id`) | Installed sensor configuration |
| `vehicle_battery` | (`vehicle_id`, `battery_id`, `start_cycle`) | Time-varying battery configuration |
| `maintenance_record` | `maintenance_id` | Vehicle maintenance history |
| `telemetry_point` | (`mission_id`, `log_no`) | Mission-owned telemetry weak entity |
| `sample` | `sample_id` | Scientific sample and custody state |
| `sample_aliquot` | (`sample_id`, `aliquot_no`) | Sample-owned aliquot weak entity |
| `incident` | `incident_id` | Mission incident history |
| `inspection_task` | `inspection_id` | Mission work against an offshore asset |
| `app_user` | `user_id` | Web login, activation state and role |

## Foreign keys and delete policy

Every FK uses `ON UPDATE CASCADE`. Delete behavior is deliberate:

| Child FK | Parent | ON DELETE | Reason |
|---|---|---|---|
| `expedition.vessel_id` | `research_vessel` | RESTRICT | A vessel with expedition history cannot disappear |
| `mission.expedition_id` | `expedition` | CASCADE | A mission is part of one expedition |
| `mission.zone_id` | `marine_zone` | RESTRICT | Zones with mission history are retained |
| `mission_vehicle.mission_id` | `mission` | CASCADE | Assignment has no meaning without its mission |
| `mission_vehicle.vehicle_id` | `auv_rov` | CASCADE | Removes the associative row with its vehicle |
| `mission_operator.mission_id` | `mission` | CASCADE | Assignment is mission-owned |
| `mission_operator.operator_id` | `operator` | CASCADE | Removes the associative row with its operator |
| `vehicle_sensor.vehicle_id` | `auv_rov` | CASCADE | Configuration is vehicle-owned |
| `vehicle_sensor.sensor_id` | `sensor` | CASCADE | Removes configuration when its catalogue item is removed |
| `vehicle_battery.vehicle_id` | `auv_rov` | CASCADE | Configuration is vehicle-owned |
| `vehicle_battery.battery_id` | `battery_pack` | CASCADE | Removes configuration when its pack is removed |
| `operator_contact.operator_id` | `operator` | CASCADE | Contact number is owned by the operator |
| `maintenance_record.vehicle_id` | `auv_rov` | CASCADE | Maintenance row is vehicle history |
| `telemetry_point.mission_id` | `mission` | CASCADE | Weak row cannot exist without its mission |
| `sample.mission_id` | `mission` | CASCADE | Sample is collected by a mission |
| `sample_aliquot.sample_id` | `sample` | CASCADE | Weak aliquot cannot exist without its sample |
| `incident.mission_id` | `mission` | CASCADE | Incident is mission history |
| `inspection_task.mission_id` | `mission` | CASCADE | Task is performed as part of a mission |
| `inspection_task.asset_id` | `offshore_asset` | RESTRICT | Asset inspection history must not be orphaned |

The API adds further history-protection checks for selected deletes even where
the physical FK could cascade. Database constraints remain the final integrity
boundary for direct SQL.

## Constraints

- UNIQUE business identifiers: usernames, vessel names, vehicle names, zone
  names, offshore asset names and operator email addresses.
- CHECK constraints cover positive capacities/costs/volumes, date and time
  ordering, latitude/longitude ranges, battery percentage, depth, status
  enumerations, severity, priority, custody state and canonical application
  roles.
- Composite primary keys prevent duplicate assignments and identify weak rows.
- All relationship FKs are `NOT NULL`; each child row therefore has mandatory
  participation in its stated parent relationship. A parent may exist before
  any child rows are added.

## M:N and dependent entities

The four M:N relationships are normalized into `mission_vehicle`,
`mission_operator`, `vehicle_sensor` and `vehicle_battery`. Their relationship
attributes—such as launch time, duty role, mount position and installation
period—belong in the junction row rather than either parent.

`telemetry_point` is identified by its owning mission plus `log_no`.
`sample_aliquot` is identified by its owning sample plus `aliquot_no`. These
are the clearest weak/dependent entities. `operator_contact` is also
existence-dependent and decomposes a multivalued attribute for first normal
form.

## Index inventory

Primary and UNIQUE keys are indexed automatically. Explicit FK-supporting
indexes cover expedition vessel, mission expedition/zone, reverse sides of
junctions, maintenance vehicle, sample mission, incident mission and
inspection mission/asset lookups. The three report-specific indexes are:

| Index | Columns | Demonstrated query |
|---|---|---|
| `idx_expedition_status` | `expedition(status)` | Expedition report status filter |
| `idx_mission_status` | `mission(status)` | Mission operations status filter |
| `idx_incident_severity_time` | `incident(severity, time_reported)` | Severity filter with time ordering |

Live `EXPLAIN` selected all three indexes. The incident query used a backward
index scan for descending report order.

## Live demonstration dataset

The existing deterministic sample dataset is sufficient and is not replaced.
It contains all domain resources in modest quantities: 3 vessels, 5 vehicles,
4 zones, 4 expeditions, 7 missions, 8 mission-vehicle rows, 10
mission-operator rows, 15 telemetry points, 8 samples, 12 aliquots, 6
incidents, 7 inspections and 6 maintenance records. The audited live database
also contains a few user-created master/expedition rows; those are preserved
and are not required by the runbook. The strongest seeded story is **Carlsberg Ridge
Hydrothermal Vent Programme** aboard **RV Samudra Anveshak**, with two
missions, assigned AUV/ROV resources, operators, telemetry, samples, aliquots
and incidents.

`database/sample_data.sql` is the deterministic reset mechanism for a known
demo database. It truncates/reloads domain data, so it must never be run
casually against an active user database.
