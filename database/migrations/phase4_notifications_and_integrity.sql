-- AquaFleet Phase 4 upgrade for an existing database (MySQL 8).
--
-- Adds (1) a `notification` table populated by AFTER triggers and (2) two BEFORE
-- UPDATE integrity triggers that close gaps in the Phase 3 triggers.
-- Never drops a domain table or a row.  Safe to run again: the table is created
-- only if missing and triggers are dropped/recreated by name.
--
-- Notification triggers run inside the writer's own transaction, so a
-- notification exists if and only if the change that caused it committed.

USE aquafleet_db;

CREATE TABLE IF NOT EXISTS notification (
    notification_id INT AUTO_INCREMENT,
    category        VARCHAR(30)  NOT NULL,
    severity        VARCHAR(20)  NOT NULL,
    title           VARCHAR(150) NOT NULL,
    message         VARCHAR(500) NOT NULL,
    source_table    VARCHAR(40)  NOT NULL,
    source_id       INT          NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read         TINYINT(1)   NOT NULL DEFAULT 0,
    read_at         DATETIME     NULL,

    CONSTRAINT pk_notification          PRIMARY KEY (notification_id),
    CONSTRAINT chk_notification_cat     CHECK (category IN ('Incident', 'Battery', 'Maintenance')),
    CONSTRAINT chk_notification_sev     CHECK (severity IN ('Info', 'Warning', 'Critical')),
    CONSTRAINT chk_notification_read    CHECK (is_read IN (0, 1)),

    INDEX idx_notification_unread (is_read, created_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

DELIMITER $$

-- ---------------------------------------------------------------------------
-- Integrity: parents may not be edited so that existing missions fall outside
-- them.  (trg_mission_validate_* only protects the mission side.)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_expedition_dates_bu$$
CREATE TRIGGER trg_expedition_dates_bu
BEFORE UPDATE ON expedition
FOR EACH ROW
BEGIN
    IF (NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date)
       AND EXISTS (
            SELECT 1 FROM mission m
             WHERE m.expedition_id = NEW.expedition_id
               AND (DATE(m.start_time) < NEW.start_date
                    OR DATE(m.start_time) > NEW.end_date
                    OR (m.end_time IS NOT NULL
                        AND (DATE(m.end_time) < NEW.start_date
                             OR DATE(m.end_time) > NEW.end_date)))
       ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Expedition dates cannot exclude its existing missions';
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_zone_depth_bu$$
CREATE TRIGGER trg_zone_depth_bu
BEFORE UPDATE ON marine_zone
FOR EACH ROW
BEGIN
    IF (NEW.min_depth <> OLD.min_depth OR NEW.max_depth <> OLD.max_depth)
       AND EXISTS (
            SELECT 1 FROM mission m
             WHERE m.zone_id = NEW.zone_id
               AND (m.depth_target < NEW.min_depth OR m.depth_target > NEW.max_depth)
       ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Zone depth band cannot exclude the depth target of its existing missions';
    END IF;
END$$

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_incident_notify_ai$$
CREATE TRIGGER trg_incident_notify_ai
AFTER INSERT ON incident
FOR EACH ROW
BEGIN
    IF NEW.severity IN ('High', 'Critical') THEN
        INSERT INTO notification (category, severity, title, message, source_table, source_id)
        VALUES ('Incident',
                IF(NEW.severity = 'Critical', 'Critical', 'Warning'),
                CONCAT(NEW.severity, ' incident reported'),
                CONCAT(NEW.incident_type, ' on mission #', NEW.mission_id),
                'incident', NEW.incident_id);
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_incident_notify_au$$
CREATE TRIGGER trg_incident_notify_au
AFTER UPDATE ON incident
FOR EACH ROW
BEGIN
    IF NEW.severity IN ('High', 'Critical') AND OLD.severity <> NEW.severity
       AND OLD.severity NOT IN ('High', 'Critical') THEN
        INSERT INTO notification (category, severity, title, message, source_table, source_id)
        VALUES ('Incident',
                IF(NEW.severity = 'Critical', 'Critical', 'Warning'),
                CONCAT('Incident escalated to ', NEW.severity),
                CONCAT(NEW.incident_type, ' on mission #', NEW.mission_id),
                'incident', NEW.incident_id);
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_battery_notify_ai$$
CREATE TRIGGER trg_battery_notify_ai
AFTER INSERT ON battery_pack
FOR EACH ROW
BEGIN
    IF NEW.health_status IN ('Poor', 'Replace') THEN
        INSERT INTO notification (category, severity, title, message, source_table, source_id)
        VALUES ('Battery',
                IF(NEW.health_status = 'Replace', 'Critical', 'Warning'),
                CONCAT('Battery pack health: ', NEW.health_status),
                CONCAT('Battery pack #', NEW.battery_id, ' (', NEW.chemistry, ') is rated ', NEW.health_status),
                'battery_pack', NEW.battery_id);
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_battery_notify_au$$
CREATE TRIGGER trg_battery_notify_au
AFTER UPDATE ON battery_pack
FOR EACH ROW
BEGIN
    IF NEW.health_status IN ('Poor', 'Replace') AND OLD.health_status <> NEW.health_status THEN
        INSERT INTO notification (category, severity, title, message, source_table, source_id)
        VALUES ('Battery',
                IF(NEW.health_status = 'Replace', 'Critical', 'Warning'),
                CONCAT('Battery pack health: ', NEW.health_status),
                CONCAT('Battery pack #', NEW.battery_id, ' (', NEW.chemistry, ') is rated ', NEW.health_status),
                'battery_pack', NEW.battery_id);
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_maintenance_notify_ai$$
CREATE TRIGGER trg_maintenance_notify_ai
AFTER INSERT ON maintenance_record
FOR EACH ROW
BEGIN
    IF NEW.next_due_date IS NOT NULL
       AND NEW.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY) THEN
        INSERT INTO notification (category, severity, title, message, source_table, source_id)
        VALUES ('Maintenance',
                IF(NEW.next_due_date < CURDATE(), 'Critical', 'Warning'),
                IF(NEW.next_due_date < CURDATE(), 'Maintenance overdue', 'Maintenance due soon'),
                CONCAT((SELECT vehicle_name FROM auv_rov WHERE vehicle_id = NEW.vehicle_id),
                       ' next maintenance due ', DATE_FORMAT(NEW.next_due_date, '%d/%m/%Y')),
                'maintenance_record', NEW.maintenance_id);
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_maintenance_notify_au$$
CREATE TRIGGER trg_maintenance_notify_au
AFTER UPDATE ON maintenance_record
FOR EACH ROW
BEGIN
    IF NEW.next_due_date IS NOT NULL
       AND NEW.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
       AND (OLD.next_due_date IS NULL OR OLD.next_due_date <> NEW.next_due_date) THEN
        INSERT INTO notification (category, severity, title, message, source_table, source_id)
        VALUES ('Maintenance',
                IF(NEW.next_due_date < CURDATE(), 'Critical', 'Warning'),
                IF(NEW.next_due_date < CURDATE(), 'Maintenance overdue', 'Maintenance due soon'),
                CONCAT((SELECT vehicle_name FROM auv_rov WHERE vehicle_id = NEW.vehicle_id),
                       ' next maintenance due ', DATE_FORMAT(NEW.next_due_date, '%d/%m/%Y')),
                'maintenance_record', NEW.maintenance_id);
    END IF;
END$$

DELIMITER ;
