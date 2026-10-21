-- AquaFleet mission status/end-time integrity upgrade for MySQL 8.
--
-- This migration is non-destructive and repeatable. It refuses to add the
-- constraint if any existing mission violates the rule, and it checks
-- information_schema before changing the table so an already-upgraded
-- database is left untouched.

USE aquafleet_db;

DELIMITER $$

DROP PROCEDURE IF EXISTS migrate_mission_status_end_constraint$$
CREATE PROCEDURE migrate_mission_status_end_constraint()
BEGIN
    IF EXISTS (
        SELECT 1
          FROM mission
         WHERE (status IN ('Planned', 'In Progress') AND end_time IS NOT NULL)
            OR (status IN ('Completed', 'Aborted') AND end_time IS NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot add chk_mission_status_end: existing missions violate the rule';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.table_constraints
         WHERE constraint_schema = DATABASE()
           AND table_name = 'mission'
           AND constraint_name = 'chk_mission_status_end'
           AND constraint_type = 'CHECK'
    ) THEN
        ALTER TABLE mission
            ADD CONSTRAINT chk_mission_status_end CHECK (
                (status IN ('Planned', 'In Progress') AND end_time IS NULL)
                OR (status IN ('Completed', 'Aborted') AND end_time IS NOT NULL)
            );
    END IF;
END$$

CALL migrate_mission_status_end_constraint()$$
DROP PROCEDURE IF EXISTS migrate_mission_status_end_constraint$$

DELIMITER ;
