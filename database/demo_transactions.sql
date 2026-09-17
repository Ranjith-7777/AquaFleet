-- AquaFleet transaction demonstrations (MySQL 8)
-- Run only after schema.sql and sample_data.sql.  The script creates temporary
-- demonstration rows, shows COMMIT / ROLLBACK / SAVEPOINT, and removes every
-- committed demo row before it finishes.

USE aquafleet_db;

-- ==========================================================================
-- Workflow 1A: Mission + assignments fail as one atomic unit.
-- The explicit rollback models an assignment failure.  No mission or
-- junction row from this block remains visible after ROLLBACK.
-- ==========================================================================
START TRANSACTION;

INSERT INTO mission
    (expedition_id, zone_id, mission_type, start_time, end_time,
     depth_target, status)
VALUES
    (4, 2, 'TRANSACTION DEMO - rollback', '2026-09-20 08:00:00', NULL,
     120.00, 'Planned');

SET @rollback_mission_id = LAST_INSERT_ID();

INSERT INTO mission_vehicle
    (mission_id, vehicle_id, launch_time, recovery_time)
VALUES
    (@rollback_mission_id, 1, '2026-09-20 08:15:00', NULL);

-- Imagine the required operator assignment failed validation here.
ROLLBACK;

SELECT COUNT(*) AS rollback_left_no_mission
  FROM mission
 WHERE mission_type = 'TRANSACTION DEMO - rollback';


-- ==========================================================================
-- Workflow 1B: the complete mission/resource unit commits together.
-- A second committed transaction removes the demonstration row; FK cascades
-- remove its two assignments, leaving normal sample data unchanged.
-- ==========================================================================
START TRANSACTION;

INSERT INTO mission
    (expedition_id, zone_id, mission_type, start_time, end_time,
     depth_target, status)
VALUES
    (4, 2, 'TRANSACTION DEMO - committed', '2026-09-21 08:00:00', NULL,
     120.00, 'Planned');

SET @committed_mission_id = LAST_INSERT_ID();

INSERT INTO mission_vehicle
    (mission_id, vehicle_id, launch_time, recovery_time)
VALUES
    (@committed_mission_id, 1, '2026-09-21 08:15:00', NULL);

INSERT INTO mission_operator
    (mission_id, operator_id, duty_role, shift)
VALUES
    (@committed_mission_id, 1, 'Transaction demonstration pilot', 'Day');

COMMIT;

SELECT m.mission_id, COUNT(DISTINCT mv.vehicle_id) AS vehicles,
       COUNT(DISTINCT mo.operator_id) AS operators
  FROM mission m
  LEFT JOIN mission_vehicle mv ON mv.mission_id = m.mission_id
  LEFT JOIN mission_operator mo ON mo.mission_id = m.mission_id
 WHERE m.mission_id = @committed_mission_id
 GROUP BY m.mission_id;

START TRANSACTION;
DELETE FROM mission WHERE mission_id = @committed_mission_id;
COMMIT;


-- ==========================================================================
-- Workflow 2: Sample + aliquots with a SAVEPOINT.
-- The second aliquot is reconsidered, rolled back to the savepoint, and
-- replaced.  The valid sample family commits atomically, is displayed, then
-- is removed in its own cleanup transaction.
-- ==========================================================================
START TRANSACTION;

INSERT INTO sample
    (mission_id, sample_type, collected_at, preservation_method,
     chain_of_custody_status)
VALUES
    (5, 'TRANSACTION DEMO - water', '2026-08-03 06:00:00',
     'Chilled demonstration storage', 'Collected');

SET @demo_sample_id = LAST_INSERT_ID();

INSERT INTO sample_aliquot (sample_id, aliquot_no, volume_ml, storage_temp)
VALUES (@demo_sample_id, 1, 50.00, 4.00);

SAVEPOINT before_optional_aliquot;

INSERT INTO sample_aliquot (sample_id, aliquot_no, volume_ml, storage_temp)
VALUES (@demo_sample_id, 2, 25.00, -20.00);

ROLLBACK TO SAVEPOINT before_optional_aliquot;

INSERT INTO sample_aliquot (sample_id, aliquot_no, volume_ml, storage_temp)
VALUES (@demo_sample_id, 2, 20.00, 4.00);

COMMIT;

SELECT s.sample_id, s.sample_type, sa.aliquot_no, sa.volume_ml, sa.storage_temp
  FROM sample s
  JOIN sample_aliquot sa ON sa.sample_id = s.sample_id
 WHERE s.sample_id = @demo_sample_id
 ORDER BY sa.aliquot_no;

START TRANSACTION;
DELETE FROM sample WHERE sample_id = @demo_sample_id;
COMMIT;

SELECT COUNT(*) AS demo_rows_remaining
  FROM mission
 WHERE mission_type LIKE 'TRANSACTION DEMO%';
