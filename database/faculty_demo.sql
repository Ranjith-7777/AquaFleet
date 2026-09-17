-- ============================================================================
-- AquaFleet faculty DBMS demonstration (MySQL 8)
-- ============================================================================
-- Run after database/schema.sql and database/sample_data.sql.
-- The script uses existing named demo records. Temporary demonstration rows
-- use reserved negative identifiers and are removed before the script ends.
-- It never displays password hashes and never changes application accounts.

USE aquafleet_db;

-- 1. BASIC SELECT ------------------------------------------------------------
SELECT vessel_id, vessel_name, home_port, capacity
FROM research_vessel
ORDER BY vessel_id;

-- 2. WHERE / ORDER BY --------------------------------------------------------
SELECT vehicle_id, vehicle_name, vehicle_type, max_depth, status
FROM auv_rov
WHERE status IN ('Available', 'Deployed')
ORDER BY max_depth DESC, vehicle_name;

-- 3. AGGREGATE ---------------------------------------------------------------
SELECT COUNT(*) AS mission_count,
       ROUND(AVG(depth_target), 2) AS average_target_depth,
       MAX(depth_target) AS deepest_target
FROM mission;

-- 4. GROUP BY + HAVING -------------------------------------------------------
SELECT e.expedition_id, e.title, COUNT(m.mission_id) AS mission_count
FROM expedition AS e
JOIN mission AS m ON m.expedition_id = e.expedition_id
GROUP BY e.expedition_id, e.title
HAVING COUNT(m.mission_id) >= 2
ORDER BY mission_count DESC, e.title;

-- 5. INNER JOIN: the operational chain Vessel -> Expedition -> Mission -------
SELECT rv.vessel_name,
       e.title AS expedition,
       m.mission_type,
       z.zone_name,
       m.status
FROM research_vessel AS rv
JOIN expedition AS e ON e.vessel_id = rv.vessel_id
JOIN mission AS m ON m.expedition_id = e.expedition_id
JOIN marine_zone AS z ON z.zone_id = m.zone_id
ORDER BY e.start_date, m.start_time;

-- 6. LEFT JOIN: include missions even when no vehicle has been assigned ------
SELECT m.mission_id,
       m.mission_type,
       COALESCE(v.vehicle_name, 'Not assigned') AS vehicle
FROM mission AS m
LEFT JOIN mission_vehicle AS mv ON mv.mission_id = m.mission_id
LEFT JOIN auv_rov AS v ON v.vehicle_id = mv.vehicle_id
ORDER BY m.mission_id, v.vehicle_name;

-- 7. NON-CORRELATED SUBQUERY: missions deeper than the overall average --------
SELECT mission_id, mission_type, depth_target
FROM mission
WHERE depth_target > (SELECT AVG(depth_target) FROM mission)
ORDER BY depth_target DESC;

-- 8. CORRELATED SUBQUERY: sample count for each mission ----------------------
SELECT m.mission_id,
       m.mission_type,
       (SELECT COUNT(*)
          FROM sample AS s
         WHERE s.mission_id = m.mission_id) AS sample_count
FROM mission AS m
ORDER BY m.mission_id;

-- 9. REPORTING VIEWS ---------------------------------------------------------
SELECT expedition_id, title AS expedition_title, vessel_name, status, mission_count
FROM vw_expedition_summary
ORDER BY start_date;

SELECT mission_id, mission_type, expedition_title, duration_minutes,
       vehicle_count, operator_count, status
FROM vw_mission_operations
ORDER BY start_time;

SELECT expedition_title, mission_type, sample_id, sample_type,
       aliquot_no, volume_ml
FROM vw_sample_lineage
WHERE expedition_title = 'Carlsberg Ridge Hydrothermal Vent Programme'
ORDER BY mission_id, sample_id, aliquot_no;

-- 10. STORED PROCEDURE WITH AN IN PARAMETER ----------------------------------
SET @demo_expedition_id = (
    SELECT expedition_id
    FROM expedition
    WHERE title = 'Carlsberg Ridge Hydrothermal Vent Programme'
    LIMIT 1
);
CALL sp_get_expedition_report(@demo_expedition_id);

SET @demo_vehicle_id = (
    SELECT vehicle_id FROM auv_rov WHERE vehicle_name = 'Neelkanth ROV-1'
);
CALL sp_get_vehicle_maintenance_history(@demo_vehicle_id);

-- 11. OUT PARAMETERS ---------------------------------------------------------
CALL sp_get_expedition_metrics(
    @demo_expedition_id,
    @mission_total,
    @incident_total,
    @sample_total
);
SELECT @mission_total AS missions,
       @incident_total AS incidents,
       @sample_total AS samples;

-- 12. TRIGGER: safely attempt an impossible mission depth -------------------
-- The procedure catches SQLSTATE 45000 raised by trg_mission_validate_bi,
-- rolls back, reports the rejection, and is then dropped. No mission remains.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_faculty_trigger_demo$$
CREATE PROCEDURE sp_faculty_trigger_demo()
BEGIN
    DECLARE v_expedition_id INT;
    DECLARE v_zone_id INT;
    DECLARE v_zone_max_depth DECIMAL(8,2);
    DECLARE v_start DATETIME;
    DECLARE v_rejected BOOLEAN DEFAULT FALSE;

    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    BEGIN
        SET v_rejected = TRUE;
        ROLLBACK;
    END;

    SELECT e.expedition_id,
           z.zone_id,
           z.max_depth,
           TIMESTAMP(e.start_date, '12:00:00')
      INTO v_expedition_id, v_zone_id, v_zone_max_depth, v_start
      FROM expedition AS e
      JOIN marine_zone AS z
        ON z.zone_name = 'Carlsberg Ridge Vent Field'
     WHERE e.title = 'Carlsberg Ridge Hydrothermal Vent Programme'
     LIMIT 1;

    START TRANSACTION;
    INSERT INTO mission (
        mission_id, expedition_id, zone_id, mission_type,
        start_time, end_time, depth_target, status
    ) VALUES (
        -94001, v_expedition_id, v_zone_id, 'Faculty trigger rejection',
        v_start, DATE_ADD(v_start, INTERVAL 1 HOUR),
        v_zone_max_depth + 1, 'Planned'
    );
    ROLLBACK;

    SELECT v_rejected AS trigger_rejected_invalid_depth,
           (SELECT COUNT(*) FROM mission WHERE mission_id = -94001)
               AS invalid_rows_remaining;
END$$
DELIMITER ;

CALL sp_faculty_trigger_demo();
DROP PROCEDURE sp_faculty_trigger_demo;

-- 13. TRANSACTION + COMMIT ---------------------------------------------------
-- A reserved negative key avoids changing AUTO_INCREMENT. The committed row
-- is displayed and then removed in a second committed cleanup transaction.
SET @demo_mission_id = (
    SELECT mission_id FROM mission
    WHERE mission_type = 'Hydrothermal Plume Survey' LIMIT 1
);

DELETE FROM sample WHERE sample_id = -94002;
START TRANSACTION;
INSERT INTO sample (
    sample_id, mission_id, sample_type, collected_at,
    preservation_method, chain_of_custody_status
) VALUES (
    -94002, @demo_mission_id, 'Faculty transaction sample',
    '2026-07-24 10:30:00', 'Cryogenic storage', 'Stored'
);
INSERT INTO sample_aliquot (sample_id, aliquot_no, volume_ml, storage_temp)
VALUES (-94002, 1, 25.00, -80.00);
COMMIT;

SELECT s.sample_id, s.sample_type, a.aliquot_no, a.volume_ml
FROM sample AS s
JOIN sample_aliquot AS a ON a.sample_id = s.sample_id
WHERE s.sample_id = -94002;

START TRANSACTION;
DELETE FROM sample WHERE sample_id = -94002;
COMMIT;

-- 14. ROLLBACK ---------------------------------------------------------------
SET @battery_id = (SELECT battery_id FROM battery_pack ORDER BY battery_id LIMIT 1);
SET @original_health = (
    SELECT health_status FROM battery_pack WHERE battery_id = @battery_id
);
START TRANSACTION;
UPDATE battery_pack SET health_status = 'Replace'
WHERE battery_id = @battery_id;
ROLLBACK;
SELECT battery_id, health_status, @original_health AS expected_health
FROM battery_pack
WHERE battery_id = @battery_id;

-- 15. SAVEPOINT --------------------------------------------------------------
START TRANSACTION;
INSERT INTO sample (
    sample_id, mission_id, sample_type, collected_at,
    preservation_method, chain_of_custody_status
) VALUES (
    -94003, @demo_mission_id, 'Faculty savepoint sample',
    '2026-07-24 10:35:00', 'Frozen', 'Stored'
);
SAVEPOINT sample_created;
INSERT INTO sample_aliquot (sample_id, aliquot_no, volume_ml, storage_temp)
VALUES (-94003, 1, 15.00, -20.00);
ROLLBACK TO SAVEPOINT sample_created;
SELECT COUNT(*) AS aliquots_after_savepoint_rollback
FROM sample_aliquot WHERE sample_id = -94003;
ROLLBACK;

-- 16. INDEX / EXPLAIN --------------------------------------------------------
EXPLAIN SELECT incident_id, severity, time_reported
FROM incident
WHERE severity = 'High'
ORDER BY time_reported DESC;

-- 17. RBAC -------------------------------------------------------------------
-- Flask RBAC is not simulated in SQL. app_user.role stores the canonical
-- role, but authentication uses hashed passwords and a signed Flask session;
-- backend authentication.py checks the live database user on each request
-- and authorizes the HTTP method/resource. Frontend-hidden buttons are UX,
-- while a forbidden direct API mutation receives HTTP 403 from Flask.
SELECT username, full_name, role, is_active
FROM app_user
WHERE username IN ('admin', 'researcher', 'operator', 'viewer')
ORDER BY FIELD(role, 'ADMIN', 'RESEARCHER', 'OPERATOR', 'VIEWER');

-- Final safety proof: all reserved demonstration rows are absent.
SELECT
    (SELECT COUNT(*) FROM mission WHERE mission_id = -94001) AS demo_missions,
    (SELECT COUNT(*) FROM sample WHERE sample_id IN (-94002, -94003)) AS demo_samples,
    (SELECT COUNT(*) FROM sample_aliquot WHERE sample_id IN (-94002, -94003)) AS demo_aliquots;
