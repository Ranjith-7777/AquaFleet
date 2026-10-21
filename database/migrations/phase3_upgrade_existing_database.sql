-- AquaFleet safe upgrade for an existing database (MySQL 8).
--
-- This migration never drops the database or a domain table. It preserves all
-- rows while upgrading VIEWER role support, three reporting indexes, five
-- reporting views, four integrity triggers, and four reporting procedures.
-- It is intentionally safe to run again: indexes are added conditionally and
-- derived database objects are dropped/recreated by name.

USE aquafleet_db;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_aquafleet_phase3_metadata_upgrade$$
CREATE PROCEDURE sp_aquafleet_phase3_metadata_upgrade()
BEGIN
    IF EXISTS (
        SELECT 1
          FROM information_schema.table_constraints
         WHERE constraint_schema = DATABASE()
           AND table_name = 'app_user'
           AND constraint_name = 'chk_app_user_role'
           AND constraint_type = 'CHECK'
    ) THEN
        ALTER TABLE app_user DROP CHECK chk_app_user_role;
    END IF;

    ALTER TABLE app_user
        ADD CONSTRAINT chk_app_user_role
        CHECK (role IN ('ADMIN', 'OPERATOR', 'RESEARCHER', 'VIEWER'));

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = 'expedition'
           AND index_name = 'idx_expedition_status'
    ) THEN
        ALTER TABLE expedition ADD INDEX idx_expedition_status (status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = 'mission'
           AND index_name = 'idx_mission_status'
    ) THEN
        ALTER TABLE mission ADD INDEX idx_mission_status (status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = 'incident'
           AND index_name = 'idx_incident_severity_time'
    ) THEN
        ALTER TABLE incident
            ADD INDEX idx_incident_severity_time (severity, time_reported);
    END IF;
END$$

CALL sp_aquafleet_phase3_metadata_upgrade()$$
DROP PROCEDURE sp_aquafleet_phase3_metadata_upgrade$$

DELIMITER ;

DROP PROCEDURE IF EXISTS sp_get_expedition_report;
DROP PROCEDURE IF EXISTS sp_get_vehicle_maintenance_history;
DROP PROCEDURE IF EXISTS sp_get_mission_summary;
DROP PROCEDURE IF EXISTS sp_get_expedition_metrics;

DROP TRIGGER IF EXISTS trg_mission_validate_bi;
DROP TRIGGER IF EXISTS trg_mission_validate_bu;
DROP TRIGGER IF EXISTS trg_mission_vehicle_ready_bi;
DROP TRIGGER IF EXISTS trg_mission_vehicle_ready_bu;

DROP VIEW IF EXISTS vw_incident_overview;
DROP VIEW IF EXISTS vw_sample_lineage;
DROP VIEW IF EXISTS vw_vehicle_readiness;
DROP VIEW IF EXISTS vw_mission_operations;
DROP VIEW IF EXISTS vw_expedition_summary;

CREATE VIEW vw_expedition_summary AS
SELECT e.expedition_id,
       e.title,
       e.vessel_id,
       rv.vessel_name,
       rv.home_port,
       e.start_date,
       e.end_date,
       e.status,
       e.budget,
       COUNT(m.mission_id) AS mission_count
  FROM expedition e
  JOIN research_vessel rv ON rv.vessel_id = e.vessel_id
  LEFT JOIN mission m ON m.expedition_id = e.expedition_id
 GROUP BY e.expedition_id, e.title, e.vessel_id, rv.vessel_name, rv.home_port,
          e.start_date, e.end_date, e.status, e.budget;

CREATE VIEW vw_mission_operations AS
SELECT m.mission_id,
       m.expedition_id,
       e.title AS expedition_title,
       m.zone_id,
       z.zone_name,
       z.region,
       m.mission_type,
       m.start_time,
       m.end_time,
       TIMESTAMPDIFF(MINUTE, m.start_time, m.end_time) AS duration_minutes,
       m.depth_target,
       m.status,
       (SELECT COUNT(*) FROM mission_vehicle mv
         WHERE mv.mission_id = m.mission_id) AS vehicle_count,
       (SELECT COUNT(*) FROM mission_operator mo
         WHERE mo.mission_id = m.mission_id) AS operator_count
  FROM mission m
  JOIN expedition e ON e.expedition_id = m.expedition_id
  JOIN marine_zone z ON z.zone_id = m.zone_id;

CREATE VIEW vw_vehicle_readiness AS
SELECT v.vehicle_id,
       v.vehicle_name,
       v.vehicle_type,
       v.model,
       v.max_depth,
       v.status,
       (SELECT COUNT(*) FROM vehicle_sensor vs
         WHERE vs.vehicle_id = v.vehicle_id) AS sensor_count,
       (SELECT COUNT(*) FROM vehicle_battery vb
         WHERE vb.vehicle_id = v.vehicle_id
           AND vb.end_cycle IS NULL) AS open_battery_assignment_count,
       (SELECT MAX(mr.maint_date) FROM maintenance_record mr
         WHERE mr.vehicle_id = v.vehicle_id) AS last_maintenance_date,
       (SELECT MIN(mr.next_due_date) FROM maintenance_record mr
         WHERE mr.vehicle_id = v.vehicle_id
           AND mr.next_due_date IS NOT NULL) AS next_maintenance_due
  FROM auv_rov v;

CREATE VIEW vw_sample_lineage AS
SELECT e.expedition_id,
       e.title AS expedition_title,
       m.mission_id,
       m.mission_type,
       s.sample_id,
       s.sample_type,
       s.collected_at,
       s.preservation_method,
       s.chain_of_custody_status,
       sa.aliquot_no,
       sa.volume_ml,
       sa.storage_temp
  FROM sample s
  JOIN mission m ON m.mission_id = s.mission_id
  JOIN expedition e ON e.expedition_id = m.expedition_id
  LEFT JOIN sample_aliquot sa ON sa.sample_id = s.sample_id;

CREATE VIEW vw_incident_overview AS
SELECT i.incident_id,
       i.mission_id,
       m.mission_type,
       m.status AS mission_status,
       e.expedition_id,
       e.title AS expedition_title,
       z.zone_id,
       z.zone_name,
       i.incident_type,
       i.severity,
       i.time_reported,
       i.description
  FROM incident i
  JOIN mission m ON m.mission_id = i.mission_id
  JOIN expedition e ON e.expedition_id = m.expedition_id
  JOIN marine_zone z ON z.zone_id = m.zone_id;

DELIMITER $$

CREATE TRIGGER trg_mission_validate_bi
BEFORE INSERT ON mission
FOR EACH ROW
BEGIN
    DECLARE v_min_depth DECIMAL(8,2);
    DECLARE v_max_depth DECIMAL(8,2);
    DECLARE v_start_date DATE;
    DECLARE v_end_date DATE;

    SELECT min_depth, max_depth INTO v_min_depth, v_max_depth
      FROM marine_zone WHERE zone_id = NEW.zone_id;
    SELECT start_date, end_date INTO v_start_date, v_end_date
      FROM expedition WHERE expedition_id = NEW.expedition_id;

    IF NEW.depth_target < v_min_depth OR NEW.depth_target > v_max_depth THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Mission depth target is outside the marine zone depth band';
    END IF;
    IF DATE(NEW.start_time) < v_start_date OR DATE(NEW.start_time) > v_end_date
       OR (NEW.end_time IS NOT NULL AND
           (DATE(NEW.end_time) < v_start_date OR DATE(NEW.end_time) > v_end_date)) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Mission times must fall within the expedition date range';
    END IF;
END$$

CREATE TRIGGER trg_mission_validate_bu
BEFORE UPDATE ON mission
FOR EACH ROW
BEGIN
    DECLARE v_min_depth DECIMAL(8,2);
    DECLARE v_max_depth DECIMAL(8,2);
    DECLARE v_start_date DATE;
    DECLARE v_end_date DATE;

    SELECT min_depth, max_depth INTO v_min_depth, v_max_depth
      FROM marine_zone WHERE zone_id = NEW.zone_id;
    SELECT start_date, end_date INTO v_start_date, v_end_date
      FROM expedition WHERE expedition_id = NEW.expedition_id;

    IF NEW.depth_target < v_min_depth OR NEW.depth_target > v_max_depth THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Mission depth target is outside the marine zone depth band';
    END IF;
    IF DATE(NEW.start_time) < v_start_date OR DATE(NEW.start_time) > v_end_date
       OR (NEW.end_time IS NOT NULL AND
           (DATE(NEW.end_time) < v_start_date OR DATE(NEW.end_time) > v_end_date)) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Mission times must fall within the expedition date range';
    END IF;
END$$

CREATE TRIGGER trg_mission_vehicle_ready_bi
BEFORE INSERT ON mission_vehicle
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(30);
    SELECT status INTO v_status FROM auv_rov WHERE vehicle_id = NEW.vehicle_id;
    IF v_status = 'Retired' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Retired vehicles cannot be assigned to missions';
    END IF;
END$$

CREATE TRIGGER trg_mission_vehicle_ready_bu
BEFORE UPDATE ON mission_vehicle
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(30);
    SELECT status INTO v_status FROM auv_rov WHERE vehicle_id = NEW.vehicle_id;
    IF v_status = 'Retired' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Retired vehicles cannot be assigned to missions';
    END IF;
END$$

CREATE PROCEDURE sp_get_expedition_report(IN p_expedition_id INT)
BEGIN
    SELECT expedition_id, title, vessel_id, vessel_name, home_port,
           start_date, end_date, status, budget, mission_count
      FROM vw_expedition_summary
     WHERE expedition_id = p_expedition_id;
    SELECT mission_id, expedition_id, expedition_title, zone_id, zone_name,
           region, mission_type, start_time, end_time, duration_minutes,
           depth_target, status, vehicle_count, operator_count
      FROM vw_mission_operations
     WHERE expedition_id = p_expedition_id
     ORDER BY start_time, mission_id;
END$$

CREATE PROCEDURE sp_get_vehicle_maintenance_history(IN p_vehicle_id INT)
BEGIN
    SELECT vehicle_id, vehicle_name, vehicle_type, model, max_depth, status,
           sensor_count, open_battery_assignment_count,
           last_maintenance_date, next_maintenance_due
      FROM vw_vehicle_readiness
     WHERE vehicle_id = p_vehicle_id;
    SELECT maintenance_id, vehicle_id, maint_date, action_taken, cost,
           next_due_date
      FROM maintenance_record
     WHERE vehicle_id = p_vehicle_id
     ORDER BY maint_date DESC, maintenance_id DESC;
END$$

CREATE PROCEDURE sp_get_mission_summary(IN p_mission_id INT)
BEGIN
    SELECT mission_id, expedition_id, expedition_title, zone_id, zone_name,
           region, mission_type, start_time, end_time, duration_minutes,
           depth_target, status, vehicle_count, operator_count
      FROM vw_mission_operations WHERE mission_id = p_mission_id;
    SELECT mv.vehicle_id, v.vehicle_name, v.vehicle_type,
           mv.launch_time, mv.recovery_time
      FROM mission_vehicle mv
      JOIN auv_rov v ON v.vehicle_id = mv.vehicle_id
     WHERE mv.mission_id = p_mission_id
     ORDER BY v.vehicle_name;
    SELECT mo.operator_id, CONCAT(o.first_name, ' ', o.last_name) AS operator_name,
           mo.duty_role, mo.shift
      FROM mission_operator mo
      JOIN `operator` o ON o.operator_id = mo.operator_id
     WHERE mo.mission_id = p_mission_id
     ORDER BY operator_name;
END$$

CREATE PROCEDURE sp_get_expedition_metrics(
    IN p_expedition_id INT,
    OUT p_mission_count INT,
    OUT p_incident_count INT,
    OUT p_sample_count INT
)
BEGIN
    SELECT COUNT(*) INTO p_mission_count
      FROM mission WHERE expedition_id = p_expedition_id;
    SELECT COUNT(*) INTO p_incident_count
      FROM incident i
      JOIN mission m ON m.mission_id = i.mission_id
     WHERE m.expedition_id = p_expedition_id;
    SELECT COUNT(*) INTO p_sample_count
      FROM sample s
      JOIN mission m ON m.mission_id = s.mission_id
     WHERE m.expedition_id = p_expedition_id;
END$$

DELIMITER ;
