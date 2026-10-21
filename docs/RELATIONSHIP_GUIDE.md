# AquaFleet Relationship Guide

All listed FKs are `NOT NULL`, so every child row must participate in its
parent relationship. The parent side is optional unless business data creates
children: for example, a vessel may exist before its first expedition. Every
FK uses `ON UPDATE CASCADE`.

## Research planning

### Research Vessel 1:N Expedition

- FK: `expedition.vessel_id -> research_vessel.vessel_id`
- Participation: each expedition has exactly one vessel; a vessel has zero or
  many expeditions.
- Delete: RESTRICT. Historical expeditions prevent deletion of their vessel.
- Reason: vessel attributes are stored once and reused across campaigns.

### Expedition 1:N Mission

- FK: `mission.expedition_id -> expedition.expedition_id`
- Participation: each mission belongs to one expedition; an expedition may be
  planned before it has missions.
- Delete: CASCADE. Missions are constituent operations of the expedition.
- Reason: mission data stays separate from campaign-level vessel, dates,
  objective and budget.

### Marine Zone 1:N Mission

- FK: `mission.zone_id -> marine_zone.zone_id`
- Participation: every mission is conducted in one zone; a zone may have no
  missions yet.
- Delete: RESTRICT. An operating area referenced by mission history is kept.
- Reason: zone depth/risk attributes are reusable and the mission triggers can
  validate target depth against the chosen zone.

## Many-to-many assignments

### Mission M:N Vehicle through `mission_vehicle`

- FKs: `mission_id -> mission`, `vehicle_id -> auv_rov`
- Key: (`mission_id`, `vehicle_id`)
- Relationship attributes: `launch_time`, `recovery_time`
- Participation: a mission or vehicle may initially have no assignments; each
  junction row requires both parents.
- Delete: CASCADE from either parent.
- Reason: a mission can deploy several vehicles and a vehicle can serve many
  missions. The composite key prevents duplicate pairing.

### Mission M:N Operator through `mission_operator`

- FKs: `mission_id -> mission`, `operator_id -> operator`
- Key: (`mission_id`, `operator_id`)
- Relationship attributes: `duty_role`, `shift`
- Participation: parents are optional; every assignment has both parents.
- Delete: CASCADE from either parent.
- Reason: crew and missions are independently reusable, while duty/shift
  describes one assignment.

### Vehicle M:N Sensor through `vehicle_sensor`

- FKs: `vehicle_id -> auv_rov`, `sensor_id -> sensor`
- Key: (`vehicle_id`, `sensor_id`)
- Relationship attributes: `mount_position`, `install_date`
- Delete: CASCADE from either parent.
- Reason: one sensor type may equip many vehicles and a vehicle carries many
  sensors; installation facts belong to the pairing.

### Vehicle M:N Battery through `vehicle_battery`

- FKs: `vehicle_id -> auv_rov`, `battery_id -> battery_pack`
- Key: (`vehicle_id`, `battery_id`, `start_cycle`)
- Relationship attributes: installation start/end timestamps.
- Delete: CASCADE from either parent.
- Reason: the time component permits the same pack to be fitted to the same
  vehicle again in a later period without overwriting history.

## Operational and scientific records

### Vehicle 1:N Maintenance Record

- FK: `maintenance_record.vehicle_id -> auv_rov.vehicle_id`
- Participation: every record belongs to one vehicle; a new vehicle may have
  no maintenance history.
- Delete: CASCADE.
- Reason: action, cost and next-due date repeat over time and therefore belong
  in separate history rows.

### Mission 1:N Telemetry Point

- FK: `telemetry_point.mission_id -> mission.mission_id`
- Key: (`mission_id`, `log_no`)
- Participation: every point belongs to one mission; a mission may have no
  telemetry yet.
- Delete: CASCADE.
- Reason: telemetry is a weak entity. `log_no` is unique only within its
  owning mission and cannot independently identify a point.

### Mission 1:N Sample

- FK: `sample.mission_id -> mission.mission_id`
- Participation: every sample comes from one mission; not every mission is a
  sampling mission.
- Delete: CASCADE.
- Reason: sample identity, preservation and custody belong to collection
  events, not to mission columns.

### Sample 1:N Sample Aliquot

- FK: `sample_aliquot.sample_id -> sample.sample_id`
- Key: (`sample_id`, `aliquot_no`)
- Participation: every aliquot has one parent sample; a sample may remain
  unsplit.
- Delete: CASCADE.
- Reason: aliquot is a weak/dependent sub-portion identified only inside its
  sample. Volume and storage temperature may differ per aliquot.

### Mission 1:N Incident

- FK: `incident.mission_id -> mission.mission_id`
- Participation: every incident belongs to one mission; most missions may have
  none.
- Delete: CASCADE.
- Reason: multiple timestamped events with different severities must remain
  separate from the mission row.

## Offshore inspection

`inspection_task` connects one mission to one offshore asset. Viewed from each
parent, both relationships are 1:N:

- `inspection_task.mission_id -> mission.mission_id`, ON DELETE CASCADE.
- `inspection_task.asset_id -> offshore_asset.asset_id`, ON DELETE RESTRICT.
- Every task requires both parents; missions/assets may exist before tasks.
- Mission deletion removes its constituent task rows. Asset deletion is
  blocked while any inspection history references it.
- The table is not a pure junction because it has its own surrogate key and
  operational attributes: task type, priority, status and finding summary.

## Multivalued operator contact

`operator_contact` decomposes the repeating contact-number attribute:

- FK: `operator_contact.operator_id -> operator.operator_id`
- Key: (`operator_id`, `contact_no`)
- Cardinality: Operator 1:N Contact; each contact row has exactly one owner.
- Delete: CASCADE because the contact has no independent existence.
- Reason: one atomic number per row preserves first normal form and prevents a
  comma-separated list in `operator`.

## Authentication separation

`app_user` deliberately has no FK to the marine domain. A login account is an
application security identity, while `operator` represents a qualified person
assigned to missions. Keeping them separate avoids assuming every operator is
a web user or every administrator is a marine operator.
