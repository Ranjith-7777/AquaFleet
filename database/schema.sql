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


-- ============================================================================
-- DROP SECTION (reverse dependency order)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

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

    INDEX idx_expedition_vessel (vessel_id)
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
    INDEX idx_mission_zone       (zone_id)
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

    INDEX idx_incident_mission (mission_id)
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


-- ============================================================================
-- End of schema. Next step: run database/sample_data.sql
-- ============================================================================
