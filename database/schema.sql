-- ============================================================================
-- AquaFleet - schema.sql
-- ----------------------------------------------------------------------------
-- Integrated Autonomous Underwater Expedition, Research Vessel Coordination,
-- Marine Sample Lineage and Offshore Inspection Database.
--
-- Target  : MySQL 8.0.16 or newer (CHECK constraints are enforced from 8.0.16)
-- Engine  : InnoDB
-- Charset : utf8mb4 / utf8mb4_unicode_ci
--
-- This script is rerunnable during development: every table is dropped first,
-- in reverse dependency order, with foreign-key checks temporarily disabled.
--
-- Run with:
--   mysql -u <username> -p < database/schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS aquafleet_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aquafleet_db;


-- Database-programming objects depend on tables and must be removed first.
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


-- ============================================================================
-- DROP SECTION (reverse dependency order)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Application authentication (independent of the marine-domain tables)
DROP TABLE IF EXISTS app_user;

-- Offshore inspection tables
DROP TABLE IF EXISTS inspection_task;

-- Mission-generated records
DROP TABLE IF EXISTS incident;
DROP TABLE IF EXISTS sample_aliquot;
DROP TABLE IF EXISTS sample;
DROP TABLE IF EXISTS telemetry_point;
DROP TABLE IF EXISTS maintenance_record;

-- Junction tables
DROP TABLE IF EXISTS vehicle_battery;
DROP TABLE IF EXISTS vehicle_sensor;
DROP TABLE IF EXISTS mission_operator;
DROP TABLE IF EXISTS mission_vehicle;
DROP TABLE IF EXISTS operator_contact;

-- Core operational tables
DROP TABLE IF EXISTS mission;
DROP TABLE IF EXISTS expedition;

-- Resource tables
DROP TABLE IF EXISTS offshore_asset;
DROP TABLE IF EXISTS battery_pack;
DROP TABLE IF EXISTS sensor;
DROP TABLE IF EXISTS `operator`;
DROP TABLE IF EXISTS auv_rov;
DROP TABLE IF EXISTS marine_zone;
DROP TABLE IF EXISTS research_vessel;

SET FOREIGN_KEY_CHECKS = 1;


-- ############################################################################
-- SECTION 1 : RESOURCE TABLES
-- Independent master data. These tables have no outgoing foreign keys and are
-- created first so that every dependent table can reference them.
-- ############################################################################

-- ----------------------------------------------------------------------------
-- research_vessel : surface ships that carry expeditions
-- ----------------------------------------------------------------------------
CREATE TABLE research_vessel (
    vessel_id    INT AUTO_INCREMENT,
    vessel_name  VARCHAR(100) NOT NULL,
    vessel_type  VARCHAR(50)  NOT NULL,
    capacity     INT          NOT NULL,
    home_port    VARCHAR(100) NOT NULL,

    CONSTRAINT pk_research_vessel      PRIMARY KEY (vessel_id),
    CONSTRAINT uq_vessel_name          UNIQUE (vessel_name),
    CONSTRAINT chk_vessel_capacity     CHECK (capacity > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- marine_zone : geographic operating areas with a depth band and risk rating
-- ----------------------------------------------------------------------------
CREATE TABLE marine_zone (
    zone_id    INT AUTO_INCREMENT,
    zone_name  VARCHAR(100) NOT NULL,
    region     VARCHAR(100) NOT NULL,
    min_depth  DECIMAL(8,2) NOT NULL,
    max_depth  DECIMAL(8,2) NOT NULL,
    risk_level VARCHAR(20)  NOT NULL,

    CONSTRAINT pk_marine_zone       PRIMARY KEY (zone_id),
    CONSTRAINT uq_zone_name         UNIQUE (zone_name),
    CONSTRAINT chk_zone_min_depth   CHECK (min_depth >= 0),
    CONSTRAINT chk_zone_depth_order CHECK (max_depth >= min_depth),
    CONSTRAINT chk_zone_risk_level  CHECK (risk_level IN ('Low', 'Moderate', 'High', 'Critical'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- auv_rov : autonomous underwater vehicles and remotely operated vehicles
-- ----------------------------------------------------------------------------
CREATE TABLE auv_rov (
    vehicle_id   INT AUTO_INCREMENT,
    vehicle_name VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(20)  NOT NULL,
    model        VARCHAR(100) NOT NULL,
    max_depth    DECIMAL(8,2) NOT NULL,
    status       VARCHAR(30)  NOT NULL,

    CONSTRAINT pk_auv_rov            PRIMARY KEY (vehicle_id),
    CONSTRAINT uq_vehicle_name       UNIQUE (vehicle_name),
    CONSTRAINT chk_vehicle_type      CHECK (vehicle_type IN ('AUV', 'ROV')),
    CONSTRAINT chk_vehicle_max_depth CHECK (max_depth > 0),
    CONSTRAINT chk_vehicle_status    CHECK (status IN ('Available', 'Deployed', 'Maintenance', 'Retired'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- operator : crew members who pilot vehicles and run missions
-- The table name is quoted with backticks because OPERATOR reads as SQL
-- terminology and is easier to identify when quoted consistently.
-- ----------------------------------------------------------------------------
CREATE TABLE `operator` (
    operator_id         INT AUTO_INCREMENT,
    first_name          VARCHAR(60)  NOT NULL,
    last_name           VARCHAR(60)  NOT NULL,
    `role`              VARCHAR(80)  NOT NULL,
    certification_level VARCHAR(50)  NOT NULL,
    email               VARCHAR(120) NOT NULL,

    CONSTRAINT pk_operator    PRIMARY KEY (operator_id),
    CONSTRAINT uq_operator_email UNIQUE (email)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- sensor : scientific instruments that can be mounted on a vehicle
-- ----------------------------------------------------------------------------
CREATE TABLE sensor (
    sensor_id        INT AUTO_INCREMENT,
    sensor_type      VARCHAR(80)  NOT NULL,
    manufacturer     VARCHAR(100) NOT NULL,
    calibration_date DATE         NOT NULL,
    accuracy         DECIMAL(6,3) NOT NULL,

    CONSTRAINT pk_sensor           PRIMARY KEY (sensor_id),
    CONSTRAINT chk_sensor_accuracy CHECK (accuracy > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- battery_pack : swappable power packs used by the vehicles
-- ----------------------------------------------------------------------------
CREATE TABLE battery_pack (
    battery_id    INT AUTO_INCREMENT,
    chemistry     VARCHAR(50)   NOT NULL,
    capacity_wh   DECIMAL(10,2) NOT NULL,
    health_status VARCHAR(30)   NOT NULL,
    cycle_count   INT           NOT NULL DEFAULT 0,

    CONSTRAINT pk_battery_pack        PRIMARY KEY (battery_id),
    CONSTRAINT chk_battery_capacity   CHECK (capacity_wh > 0),
    CONSTRAINT chk_battery_cycles     CHECK (cycle_count >= 0),
    CONSTRAINT chk_battery_health     CHECK (health_status IN ('Excellent', 'Good', 'Fair', 'Poor', 'Replace'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- offshore_asset : fixed offshore structures that inspections target
-- ----------------------------------------------------------------------------
CREATE TABLE offshore_asset (
    asset_id   INT AUTO_INCREMENT,
    asset_name VARCHAR(120) NOT NULL,
    asset_type VARCHAR(80)  NOT NULL,
    latitude   DECIMAL(9,6) NOT NULL,
    longitude  DECIMAL(9,6) NOT NULL,

    CONSTRAINT pk_offshore_asset    PRIMARY KEY (asset_id),
    CONSTRAINT uq_asset_name        UNIQUE (asset_name),
    CONSTRAINT chk_asset_latitude   CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT chk_asset_longitude  CHECK (longitude BETWEEN -180 AND 180)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ############################################################################
-- SECTION 2 : CORE OPERATIONAL TABLES
-- The expedition/mission backbone of the database.
-- ############################################################################

-- ----------------------------------------------------------------------------
-- expedition : a funded research campaign carried out by one vessel
-- Relationship: RESEARCH_VESSEL 1 --- N EXPEDITION (UNDERTAKES)
-- ----------------------------------------------------------------------------
CREATE TABLE expedition (
    expedition_id INT AUTO_INCREMENT,
    vessel_id     INT           NOT NULL,
    title         VARCHAR(150)  NOT NULL,
    start_date    DATE          NOT NULL,
    end_date      DATE          NOT NULL,
    objective     TEXT          NOT NULL,
    status        VARCHAR(30)   NOT NULL,
    budget        DECIMAL(14,2) NOT NULL,

    CONSTRAINT pk_expedition           PRIMARY KEY (expedition_id),
    CONSTRAINT chk_expedition_dates    CHECK (end_date >= start_date),
    CONSTRAINT chk_expedition_budget   CHECK (budget >= 0),
    CONSTRAINT chk_expedition_status   CHECK (status IN ('Planned', 'Active', 'Completed', 'Cancelled')),

    -- A vessel that still has expeditions on record cannot be deleted.
    CONSTRAINT fk_expedition_vessel FOREIGN KEY (vessel_id)
        REFERENCES research_vessel (vessel_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    INDEX idx_expedition_vessel (vessel_id),
    INDEX idx_expedition_status (status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- mission : a single dive / operation inside an expedition, in one marine zone
-- Relationships: EXPEDITION 1 --- N MISSION (CONTAINS)
--                MARINE_ZONE 1 --- N MISSION (CONDUCTED_IN)
--
-- NOTE: mission_duration is NOT stored. It is derived at query time, e.g.
--       TIMESTAMPDIFF(MINUTE, start_time, end_time) AS mission_duration_minutes
-- ----------------------------------------------------------------------------
CREATE TABLE mission (
    mission_id   INT AUTO_INCREMENT,
    expedition_id INT          NOT NULL,
    zone_id      INT          NOT NULL,
    mission_type VARCHAR(80)  NOT NULL,
    start_time   DATETIME     NOT NULL,
    end_time     DATETIME     NULL,
    depth_target DECIMAL(8,2) NOT NULL,
    status       VARCHAR(30)  NOT NULL,

    CONSTRAINT pk_mission            PRIMARY KEY (mission_id),
    -- end_time may be NULL while a mission is still running.
    CONSTRAINT chk_mission_times     CHECK (end_time IS NULL OR end_time > start_time),
    CONSTRAINT chk_mission_depth     CHECK (depth_target >= 0),
    CONSTRAINT chk_mission_status    CHECK (status IN ('Planned', 'In Progress', 'Completed', 'Aborted')),

    -- Deleting an expedition removes its missions (and, in turn, their records).
    CONSTRAINT fk_mission_expedition FOREIGN KEY (expedition_id)
        REFERENCES expedition (expedition_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    -- A zone with mission history is protected from deletion.
    CONSTRAINT fk_mission_zone FOREIGN KEY (zone_id)
        REFERENCES marine_zone (zone_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    INDEX idx_mission_expedition (expedition_id),
    INDEX idx_mission_zone       (zone_id),
    INDEX idx_mission_status     (status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ############################################################################
-- SECTION 3 : JUNCTION TABLES
-- Multivalued attributes and M:N relationships resolved into their own tables.
-- ############################################################################

-- ----------------------------------------------------------------------------
-- operator_contact : the multivalued contact_no attribute of OPERATOR
-- ----------------------------------------------------------------------------
CREATE TABLE operator_contact (
    operator_id INT         NOT NULL,
    contact_no  VARCHAR(20) NOT NULL,

    CONSTRAINT pk_operator_contact PRIMARY KEY (operator_id, contact_no),

    CONSTRAINT fk_contact_operator FOREIGN KEY (operator_id)
        REFERENCES `operator` (operator_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- mission_vehicle : M:N EXECUTED_BY between MISSION and AUV_ROV
-- Descriptive attributes: launch_time, recovery_time
-- ----------------------------------------------------------------------------
CREATE TABLE mission_vehicle (
    mission_id    INT      NOT NULL,
    vehicle_id    INT      NOT NULL,
    launch_time   DATETIME NOT NULL,
    recovery_time DATETIME NULL,

    CONSTRAINT pk_mission_vehicle    PRIMARY KEY (mission_id, vehicle_id),
    CONSTRAINT chk_mv_recovery_time  CHECK (recovery_time IS NULL OR recovery_time > launch_time),

    CONSTRAINT fk_mv_mission FOREIGN KEY (mission_id)
        REFERENCES mission (mission_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_mv_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES auv_rov (vehicle_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    -- mission_id is already the PK prefix; vehicle_id needs its own index.
    INDEX idx_mv_vehicle (vehicle_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- mission_operator : M:N ASSIGNED_TO between MISSION and OPERATOR
-- Descriptive attributes: duty_role, shift
-- ----------------------------------------------------------------------------
CREATE TABLE mission_operator (
    mission_id  INT         NOT NULL,
    operator_id INT         NOT NULL,
    duty_role   VARCHAR(80) NOT NULL,
    shift       VARCHAR(50) NOT NULL,

    CONSTRAINT pk_mission_operator PRIMARY KEY (mission_id, operator_id),

    CONSTRAINT fk_mo_mission FOREIGN KEY (mission_id)
        REFERENCES mission (mission_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_mo_operator FOREIGN KEY (operator_id)
        REFERENCES `operator` (operator_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_mo_operator (operator_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- vehicle_sensor : M:N EQUIPPED_WITH between AUV_ROV and SENSOR
-- Descriptive attributes: mount_position, install_date
-- ----------------------------------------------------------------------------
CREATE TABLE vehicle_sensor (
    vehicle_id     INT          NOT NULL,
    sensor_id      INT          NOT NULL,
    mount_position VARCHAR(100) NOT NULL,
    install_date   DATE         NOT NULL,

    CONSTRAINT pk_vehicle_sensor PRIMARY KEY (vehicle_id, sensor_id),

    CONSTRAINT fk_vs_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES auv_rov (vehicle_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_vs_sensor FOREIGN KEY (sensor_id)
        REFERENCES sensor (sensor_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_vs_sensor (sensor_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- vehicle_battery : M:N POWERED_BY between AUV_ROV and BATTERY_PACK
-- start_cycle is part of the primary key so the same battery can be fitted to
-- the same vehicle again during a later operational period.
-- ----------------------------------------------------------------------------
CREATE TABLE vehicle_battery (
    vehicle_id  INT      NOT NULL,
    battery_id  INT      NOT NULL,
    start_cycle DATETIME NOT NULL,
    end_cycle   DATETIME NULL,

    CONSTRAINT pk_vehicle_battery  PRIMARY KEY (vehicle_id, battery_id, start_cycle),
    CONSTRAINT chk_vb_cycle_order  CHECK (end_cycle IS NULL OR end_cycle > start_cycle),

    CONSTRAINT fk_vb_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES auv_rov (vehicle_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_vb_battery FOREIGN KEY (battery_id)
        REFERENCES battery_pack (battery_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_vb_battery (battery_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ############################################################################
-- SECTION 4 : MISSION-GENERATED RECORDS
-- Data produced by, or attached to, a vehicle or a mission.
-- ############################################################################

-- ----------------------------------------------------------------------------
-- maintenance_record : AUV_ROV 1 --- N UNDERGOES
-- ----------------------------------------------------------------------------
CREATE TABLE maintenance_record (
    maintenance_id INT AUTO_INCREMENT,
    vehicle_id     INT           NOT NULL,
    maint_date     DATE          NOT NULL,
    action_taken   TEXT          NOT NULL,
    cost           DECIMAL(12,2) NOT NULL,
    next_due_date  DATE          NULL,

    CONSTRAINT pk_maintenance_record PRIMARY KEY (maintenance_id),
    CONSTRAINT chk_maint_cost        CHECK (cost >= 0),
    CONSTRAINT chk_maint_next_due    CHECK (next_due_date IS NULL OR next_due_date >= maint_date),

    CONSTRAINT fk_maint_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES auv_rov (vehicle_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_maint_vehicle (vehicle_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- telemetry_point : weak entity identified by (mission_id, log_no)
-- A telemetry point cannot exist without its owning mission.
-- ----------------------------------------------------------------------------
CREATE TABLE telemetry_point (
    mission_id    INT          NOT NULL,
    log_no        INT          NOT NULL,
    `timestamp`   DATETIME     NOT NULL,
    latitude      DECIMAL(9,6) NOT NULL,
    longitude     DECIMAL(9,6) NOT NULL,
    depth         DECIMAL(8,2) NOT NULL,
    battery_level DECIMAL(5,2) NOT NULL,
    temperature   DECIMAL(6,2) NOT NULL,

    CONSTRAINT pk_telemetry_point   PRIMARY KEY (mission_id, log_no),
    CONSTRAINT chk_tp_log_no        CHECK (log_no > 0),
    CONSTRAINT chk_tp_latitude      CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT chk_tp_longitude     CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_tp_depth         CHECK (depth >= 0),
    CONSTRAINT chk_tp_battery_level CHECK (battery_level BETWEEN 0 AND 100),

    CONSTRAINT fk_tp_mission FOREIGN KEY (mission_id)
        REFERENCES mission (mission_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- sample : MISSION 1 --- N COLLECTS
-- chain_of_custody_status carries the sample lineage state.
-- ----------------------------------------------------------------------------
CREATE TABLE sample (
    sample_id               INT AUTO_INCREMENT,
    mission_id              INT          NOT NULL,
    sample_type             VARCHAR(80)  NOT NULL,
    collected_at            DATETIME     NOT NULL,
    preservation_method     VARCHAR(120) NOT NULL,
    chain_of_custody_status VARCHAR(40)  NOT NULL,

    CONSTRAINT pk_sample        PRIMARY KEY (sample_id),
    CONSTRAINT chk_sample_custody CHECK (chain_of_custody_status IN
        ('Collected', 'Sealed', 'In Transit', 'Received', 'Stored', 'Released', 'Disposed')),

    CONSTRAINT fk_sample_mission FOREIGN KEY (mission_id)
        REFERENCES mission (mission_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_sample_mission (mission_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- sample_aliquot : weak entity identified by (sample_id, aliquot_no)
-- A sub-portion split off from a parent sample; the second lineage level.
-- ----------------------------------------------------------------------------
CREATE TABLE sample_aliquot (
    sample_id    INT           NOT NULL,
    aliquot_no   INT           NOT NULL,
    volume_ml    DECIMAL(10,2) NOT NULL,
    storage_temp DECIMAL(6,2)  NOT NULL,

    CONSTRAINT pk_sample_aliquot  PRIMARY KEY (sample_id, aliquot_no),
    CONSTRAINT chk_aliquot_no     CHECK (aliquot_no > 0),
    CONSTRAINT chk_aliquot_volume CHECK (volume_ml > 0),

    CONSTRAINT fk_aliquot_sample FOREIGN KEY (sample_id)
        REFERENCES sample (sample_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- incident : MISSION 1 --- N REPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE incident (
    incident_id   INT AUTO_INCREMENT,
    mission_id    INT          NOT NULL,
    incident_type VARCHAR(100) NOT NULL,
    severity      VARCHAR(20)  NOT NULL,
    time_reported DATETIME     NOT NULL,
    description   TEXT         NOT NULL,

    CONSTRAINT pk_incident           PRIMARY KEY (incident_id),
    CONSTRAINT chk_incident_severity CHECK (severity IN ('Low', 'Moderate', 'High', 'Critical')),

    CONSTRAINT fk_incident_mission FOREIGN KEY (mission_id)
        REFERENCES mission (mission_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    INDEX idx_incident_mission (mission_id),
    INDEX idx_incident_severity_time (severity, time_reported)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ############################################################################
-- SECTION 5 : OFFSHORE INSPECTION TABLES
-- ############################################################################

-- ----------------------------------------------------------------------------
-- inspection_task : MISSION 1 --- N PERFORMS  and  OFFSHORE_ASSET 1 --- N TARGETS
-- ----------------------------------------------------------------------------
CREATE TABLE inspection_task (
    inspection_id   INT AUTO_INCREMENT,
    mission_id      INT          NOT NULL,
    asset_id        INT          NOT NULL,
    task_type       VARCHAR(100) NOT NULL,
    priority        VARCHAR(20)  NOT NULL,
    status          VARCHAR(30)  NOT NULL,
    finding_summary TEXT         NULL,

    CONSTRAINT pk_inspection_task    PRIMARY KEY (inspection_id),
    CONSTRAINT chk_inspection_priority CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    CONSTRAINT chk_inspection_status   CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),

    CONSTRAINT fk_inspection_mission FOREIGN KEY (mission_id)
        REFERENCES mission (mission_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    -- An asset with inspection history is protected from deletion.
    CONSTRAINT fk_inspection_asset FOREIGN KEY (asset_id)
        REFERENCES offshore_asset (asset_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    INDEX idx_inspection_mission (mission_id),
    INDEX idx_inspection_asset   (asset_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ############################################################################
-- SECTION 6 : APPLICATION AUTHENTICATION
-- Deliberately separate from the marine-domain model above. No domain table
-- references app_user, and app_user references no domain table, so the two
-- can be reasoned about - and dropped or reloaded - independently.
-- ############################################################################

-- ----------------------------------------------------------------------------
-- app_user : login accounts for the AquaFleet web application
--
-- password_hash holds a werkzeug hash (scrypt by default), never a password.
-- 255 characters leaves ample room: a current scrypt hash is ~162 characters.
-- No API ever selects or returns this column.
--
-- role is re-read from this table on every protected request. Flask enforces
-- the resource/action permission matrix; the frontend mirrors it only to
-- avoid presenting controls that the current role cannot use.
-- ----------------------------------------------------------------------------
CREATE TABLE app_user (
    user_id       INT AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_app_user          PRIMARY KEY (user_id),
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT chk_app_user_role
        CHECK (role IN ('ADMIN', 'OPERATOR', 'RESEARCHER', 'VIEWER'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;


-- ############################################################################
-- SECTION 7 : REPORTING VIEWS
-- Derived reporting structures keep joins and aggregates reusable without
-- storing values that can be calculated from the normalized tables.
-- ############################################################################

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


-- ############################################################################
-- SECTION 8 : CROSS-TABLE INTEGRITY TRIGGERS
-- Flask gives friendly validation errors; these triggers protect the same
-- critical invariants when data is written directly through SQL.
-- ############################################################################

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


-- ############################################################################
-- SECTION 9 : REPORTING STORED PROCEDURES
-- ############################################################################

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


-- ============================================================================
-- End of schema. Next steps:
--   1. run database/sample_data.sql      (marine-domain demonstration data)
--   2. run backend/create_demo_users.py  (login accounts - passwords are
--      hashed by that script and never appear in this file)
-- ============================================================================
