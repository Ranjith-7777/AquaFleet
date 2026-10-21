-- ============================================================================
-- AquaFleet - sample_data.sql
-- ----------------------------------------------------------------------------
-- Realistic demonstration data for the AquaFleet marine operations database.
--
-- Run AFTER database/schema.sql:
--   mysql -u <username> -p < database/sample_data.sql
--
-- Rows are inserted parent-first so every foreign key resolves. AUTO_INCREMENT
-- ids are never supplied explicitly; because schema.sql recreates each table,
-- the generated ids always start at 1 in the insert order shown below.
--
-- Reference ids used by the child inserts
--   research_vessel 1..3   marine_zone 1..4   auv_rov 1..5   operator 1..6
--   sensor 1..6            battery_pack 1..5  offshore_asset 1..4
--   expedition 1..4        mission 1..7       sample 1..8
-- ============================================================================

USE aquafleet_db;

-- Clear existing rows so this script can be rerun on its own.
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE notification;
TRUNCATE TABLE inspection_task;
TRUNCATE TABLE incident;
TRUNCATE TABLE sample_aliquot;
TRUNCATE TABLE sample;
TRUNCATE TABLE telemetry_point;
TRUNCATE TABLE maintenance_record;
TRUNCATE TABLE vehicle_battery;
TRUNCATE TABLE vehicle_sensor;
TRUNCATE TABLE mission_operator;
TRUNCATE TABLE mission_vehicle;
TRUNCATE TABLE operator_contact;
TRUNCATE TABLE mission;
TRUNCATE TABLE expedition;
TRUNCATE TABLE offshore_asset;
TRUNCATE TABLE battery_pack;
TRUNCATE TABLE sensor;
TRUNCATE TABLE `operator`;
TRUNCATE TABLE auv_rov;
TRUNCATE TABLE marine_zone;
TRUNCATE TABLE research_vessel;
SET FOREIGN_KEY_CHECKS = 1;


-- ############################################################################
-- RESOURCE TABLES
-- ############################################################################

-- research_vessel : ids 1..3
INSERT INTO research_vessel (vessel_name, vessel_type, capacity, home_port) VALUES
('ORV Sagar Nidhi',    'Ocean Research Vessel',       60, 'Chennai, India'),
('RV Sindhu Sadhana',  'Coastal Research Vessel',     42, 'Vasco da Gama, Goa, India'),
('RV Samudra Anveshak','Deep Sea Research Vessel',    55, 'Kochi, Kerala, India');


-- marine_zone : ids 1..4
INSERT INTO marine_zone (zone_name, region, min_depth, max_depth, risk_level) VALUES
('Andaman Deep Reef Shelf',     'Andaman Sea',    50.00,  600.00, 'Moderate'),
('Kochi Offshore Shelf',        'Arabian Sea',    20.00,  250.00, 'Low'),
('Carlsberg Ridge Vent Field',  'Arabian Sea',  1500.00, 3200.00, 'Critical'),
('Bengal Fan Sediment Basin',   'Bay of Bengal', 400.00, 2400.00, 'High');


-- auv_rov : ids 1..5  (mixture of AUV and ROV)
INSERT INTO auv_rov (vehicle_name, vehicle_type, model, max_depth, status) VALUES
('Varuna AUV-1',   'AUV', 'Bluefin-21',         4500.00, 'Available'),
('Neelkanth ROV-1','ROV', 'Saab Seaeye Cougar-XT', 2000.00, 'Deployed'),
('Sagarika AUV-2', 'AUV', 'REMUS 6000',         6000.00, 'Deployed'),
('Trishul ROV-2',  'ROV', 'Schilling UHD-III',  3000.00, 'Maintenance'),
('Meghna AUV-3',   'AUV', 'Teledyne Gavia Offshore', 1000.00, 'Retired');


-- operator : ids 1..6
INSERT INTO `operator` (first_name, last_name, `role`, certification_level, email) VALUES
('Ananya',  'Iyer',        'Chief AUV Pilot',            'Level 4 - Expert',       'ananya.iyer@aquafleet.in'),
('Rahul',   'Menon',       'ROV Supervisor',             'Level 3 - Advanced',     'rahul.menon@aquafleet.in'),
('Priya',   'Deshmukh',    'Marine Data Analyst',        'Level 2 - Intermediate', 'priya.deshmukh@aquafleet.in'),
('Karthik', 'Subramanian', 'Sonar and Acoustics Specialist','Level 3 - Advanced',  'karthik.subramanian@aquafleet.in'),
('Lena',    'Fischer',     'Deep Sea Systems Engineer',  'Level 4 - Expert',       'lena.fischer@aquafleet.de'),
('Vikram',  'Nair',        'Sample Custody Officer',     'Level 2 - Intermediate', 'vikram.nair@aquafleet.in');


-- sensor : ids 1..6
INSERT INTO sensor (sensor_type, manufacturer, calibration_date, accuracy) VALUES
('CTD Profiler',            'Sea-Bird Scientific',      '2026-01-15', 0.005),
('Multibeam Echosounder',   'Kongsberg Maritime',       '2025-12-02', 0.150),
('Dissolved Oxygen Optode', 'Aanderaa Data Instruments','2026-02-20', 0.020),
('4K Subsea Camera',        'DeepSea Power & Light',    '2026-03-11', 0.010),
('Chlorophyll Fluorometer', 'Turner Designs',           '2025-10-28', 0.030),
('Sub-Bottom Profiler',     'EdgeTech',                 '2026-04-05', 0.250);


-- battery_pack : ids 1..5
INSERT INTO battery_pack (chemistry, capacity_wh, health_status, cycle_count) VALUES
('Lithium-Ion',      12000.00, 'Excellent',  42),
('Lithium-Ion',       9500.00, 'Good',      130),
('Lithium Polymer',   6400.00, 'Fair',      260),
('Silver-Zinc',      15000.00, 'Good',       88),
('Lithium-Ion',       8000.00, 'Replace',   410);


-- offshore_asset : ids 1..4
INSERT INTO offshore_asset (asset_name, asset_type, latitude, longitude) VALUES
('Mumbai High North Platform',      'Production Platform',  19.451200,  71.312400),
('KG-D6 Subsea Manifold',           'Subsea Manifold',      16.312500,  82.145600),
('Kochi LNG Terminal Jetty',        'LNG Terminal Jetty',    9.965400,  76.243100),
('Andaman Submarine Cable Segment A','Submarine Cable',      11.623400,  92.712900);


-- ############################################################################
-- CORE OPERATIONAL TABLES
-- ############################################################################

-- expedition : ids 1..4
-- Expedition 1 deliberately contains three missions (1, 2, 3).
INSERT INTO expedition (vessel_id, title, start_date, end_date, objective, status, budget) VALUES
(1, 'Andaman Deep Reef Biodiversity Survey', '2025-11-03', '2025-11-28',
    'Map mesophotic coral communities and collect reference tissue samples along the Andaman shelf break.',
    'Completed', 18500000.00),
(3, 'Carlsberg Ridge Hydrothermal Vent Programme', '2026-07-20', '2026-08-30',
    'Locate active vent chimneys on the Carlsberg Ridge and characterise plume chemistry and vent fauna.',
    'Active', 42750000.00),
(2, 'Bengal Fan Sediment Core Campaign', '2026-01-12', '2026-02-08',
    'Recover shallow sediment cores to reconstruct monsoon-driven sediment flux in the Bengal Fan.',
    'Completed', 23100000.00),
(1, 'Kochi Offshore Pipeline Integrity Campaign', '2026-09-15', '2026-10-10',
    'Inspect subsea pipeline, jetty piles and cathodic protection systems on the Kochi offshore shelf.',
    'Planned', 9800000.00);


-- mission : ids 1..7
-- Note: mission_duration is not stored; derive it from start_time and end_time.
INSERT INTO mission (expedition_id, zone_id, mission_type, start_time, end_time, depth_target, status) VALUES
(1, 1, 'Benthic Photographic Transect', '2025-11-05 09:00:00', '2025-11-05 15:30:00',  320.00, 'Completed'),
(1, 1, 'Coral Tissue Sample Collection','2025-11-09 07:45:00', '2025-11-09 13:10:00',  180.50, 'Completed'),
(1, 1, 'Water Column Profiling',        '2025-11-16 06:30:00', '2025-11-16 11:45:00',  450.00, 'Completed'),
(2, 3, 'Hydrothermal Plume Survey',     '2026-07-24 05:00:00', '2026-07-24 12:20:00', 1850.00, 'Completed'),
(2, 3, 'Vent Fauna Sampling',           '2026-08-03 04:30:00', NULL,                  1920.00, 'In Progress'),
(3, 4, 'Sediment Core Extraction',      '2026-01-18 08:00:00', '2026-01-18 16:40:00',  980.00, 'Completed'),
(4, 2, 'Pipeline Corrosion Inspection', '2026-09-18 07:00:00', NULL,                   120.00, 'Planned');


-- ############################################################################
-- JUNCTION TABLES
-- ############################################################################

-- operator_contact : operators 1 and 2 have two numbers each (multivalued attribute)
INSERT INTO operator_contact (operator_id, contact_no) VALUES
(1, '+91-9840012345'),
(1, '+91-4428451200'),
(2, '+91-9847065521'),
(2, '+91-4842671188'),
(3, '+91-9820071144'),
(4, '+91-9445533221'),
(5, '+49-40-428387650'),
(6, '+91-9995512347');


-- mission_vehicle : M:N EXECUTED_BY
-- Missions 1 and 4 each use two vehicles.
INSERT INTO mission_vehicle (mission_id, vehicle_id, launch_time, recovery_time) VALUES
(1, 1, '2025-11-05 09:15:00', '2025-11-05 15:05:00'),
(1, 2, '2025-11-05 09:40:00', '2025-11-05 14:50:00'),
(2, 1, '2025-11-09 08:00:00', '2025-11-09 12:55:00'),
(3, 3, '2025-11-16 06:45:00', '2025-11-16 11:30:00'),
(4, 3, '2026-07-24 05:20:00', '2026-07-24 12:00:00'),
(4, 2, '2026-07-24 06:05:00', '2026-07-24 11:40:00'),
(5, 3, '2026-08-03 04:45:00', NULL),
(6, 4, '2026-01-18 08:20:00', '2026-01-18 16:15:00');


-- mission_operator : M:N ASSIGNED_TO
-- Mission 1 has three operators; mission 4 has two.
INSERT INTO mission_operator (mission_id, operator_id, duty_role, shift) VALUES
(1, 1, 'Lead AUV Pilot',        'Day 06:00-14:00'),
(1, 2, 'ROV Supervisor',        'Day 06:00-14:00'),
(1, 3, 'Onboard Data Analyst',  'Day 06:00-14:00'),
(2, 1, 'Lead AUV Pilot',        'Day 06:00-14:00'),
(2, 6, 'Sample Custody Officer','Day 06:00-14:00'),
(3, 4, 'Acoustics Watchkeeper', 'Early 04:00-12:00'),
(4, 5, 'Dive Supervisor',       'Early 04:00-12:00'),
(4, 4, 'Acoustics Watchkeeper', 'Early 04:00-12:00'),
(5, 5, 'Dive Supervisor',       'Early 04:00-12:00'),
(6, 2, 'ROV Supervisor',        'Day 08:00-16:00');


-- vehicle_sensor : M:N EQUIPPED_WITH
-- Vehicles 1 and 3 each carry three sensors.
INSERT INTO vehicle_sensor (vehicle_id, sensor_id, mount_position, install_date) VALUES
(1, 1, 'Forward payload bay',       '2025-09-14'),
(1, 2, 'Ventral hull mount',        '2025-09-14'),
(1, 4, 'Nose gimbal',               '2025-10-02'),
(2, 4, 'Manipulator boom camera',   '2025-10-11'),
(2, 5, 'Starboard skid',            '2025-10-11'),
(3, 1, 'Mid-section payload bay',   '2026-01-05'),
(3, 3, 'Port instrument rail',      '2026-01-05'),
(3, 6, 'Ventral towed array mount', '2026-06-28');


-- vehicle_battery : M:N POWERED_BY
-- Battery 1 is fitted to vehicle 1 twice, in two separate operational periods.
INSERT INTO vehicle_battery (vehicle_id, battery_id, start_cycle, end_cycle) VALUES
(1, 1, '2025-11-01 06:00:00', '2025-11-30 18:00:00'),
(1, 1, '2026-07-01 06:00:00', NULL),
(2, 2, '2025-11-04 05:30:00', '2025-11-20 17:00:00'),
(3, 3, '2026-01-10 07:00:00', '2026-02-10 19:00:00'),
(3, 4, '2026-07-20 04:00:00', '2026-08-10 20:00:00'),
(4, 5, '2026-01-15 06:30:00', '2026-01-25 18:30:00');


-- ############################################################################
-- MISSION-GENERATED RECORDS
-- ############################################################################

-- maintenance_record : AUV_ROV 1:N UNDERGOES
INSERT INTO maintenance_record (vehicle_id, maint_date, action_taken, cost, next_due_date) VALUES
(1, '2025-12-05', 'Post-expedition hull inspection, thruster seal replacement and full CTD recalibration.', 185000.00, '2026-06-05'),
(1, '2026-06-18', 'Firmware upgrade of navigation computer and replacement of two ballast actuators.',        96500.00, '2026-12-18'),
(2, '2026-02-14', 'Umbilical tether re-termination after abrasion damage on the Andaman deployment.',       142000.00, '2026-08-14'),
(3, '2026-05-30', 'Pressure housing re-certification to 6000 m and syntactic foam block replacement.',      410000.00, '2027-05-30'),
(4, '2026-08-01', 'Hydraulic manipulator overhaul; vehicle held out of service pending parts.',             268000.00, NULL),
(5, '2026-03-22', 'Decommissioning survey and removal of reusable payload modules before retirement.',       54000.00, NULL);


-- telemetry_point : weak entity (mission_id, log_no)
INSERT INTO telemetry_point (mission_id, log_no, `timestamp`, latitude, longitude, depth, battery_level, temperature) VALUES
-- Mission 1 - Andaman Deep Reef Shelf
(1, 1, '2025-11-05 09:30:00', 11.612400, 92.704500,  85.40,  97.50, 27.80),
(1, 2, '2025-11-05 11:00:00', 11.618900, 92.709300, 246.10,  84.20, 18.40),
(1, 3, '2025-11-05 12:45:00', 11.624700, 92.715100, 318.75,  69.80, 14.10),
(1, 4, '2025-11-05 14:40:00', 11.619200, 92.708800,  62.30,  55.60, 28.05),
-- Mission 2 - coral sampling dive
(2, 1, '2025-11-09 08:20:00', 11.605100, 92.698700,  74.60,  95.10, 28.20),
(2, 2, '2025-11-09 10:15:00', 11.609800, 92.702400, 176.90,  78.40, 21.60),
(2, 3, '2025-11-09 12:30:00', 11.604300, 92.697100,  41.20,  61.30, 28.60),
-- Mission 3 - water column profiling
(3, 1, '2025-11-16 07:10:00', 11.640500, 92.731200, 210.00,  93.70, 20.90),
(3, 2, '2025-11-16 09:50:00', 11.647300, 92.738600, 448.30,  72.10, 11.75),
-- Mission 4 - Carlsberg Ridge plume survey
(4, 1, '2026-07-24 06:00:00', 10.104500, 62.318700, 640.20,  96.80, 15.30),
(4, 2, '2026-07-24 08:45:00', 10.112300, 62.326400, 1512.90, 74.50,  4.60),
(4, 3, '2026-07-24 11:10:00', 10.118700, 62.331900, 1846.50, 48.20,  3.85),
-- Mission 6 - Bengal Fan coring
(6, 1, '2026-01-18 09:05:00', 15.482600, 87.115400, 305.70,  98.20, 19.40),
(6, 2, '2026-01-18 12:30:00', 15.490100, 87.122800, 812.40,  71.60,  6.20),
(6, 3, '2026-01-18 15:45:00', 15.486900, 87.119500, 974.80,  43.90,  4.95);


-- sample : MISSION 1:N COLLECTS
-- sample ids 1..8 in the order below.
INSERT INTO sample (mission_id, sample_type, collected_at, preservation_method, chain_of_custody_status) VALUES
(2, 'Coral Tissue',           '2025-11-09 09:40:00', 'Ethanol 95% at 4 C',            'Stored'),
(2, 'Reef Sediment',          '2025-11-09 10:25:00', 'Frozen at -20 C',               'Stored'),
(2, 'Seawater - Reef Column', '2025-11-09 11:50:00', 'Filtered and refrigerated 4 C', 'Released'),
(4, 'Hydrothermal Fluid',     '2026-07-24 09:30:00', 'Acidified titanium sampler',    'Received'),
(4, 'Vent Chimney Sulphide',  '2026-07-24 10:20:00', 'Nitrogen purged dry container', 'Stored'),
(5, 'Vent Fauna - Shrimp',    '2026-08-03 06:15:00', 'RNAlater at -80 C',             'In Transit'),
(6, 'Sediment Core Section A','2026-01-18 11:10:00', 'Sealed core liner at 4 C',      'Sealed'),
(6, 'Sediment Core Section B','2026-01-18 14:20:00', 'Sealed core liner at 4 C',      'Collected');


-- sample_aliquot : weak entity (sample_id, aliquot_no)
INSERT INTO sample_aliquot (sample_id, aliquot_no, volume_ml, storage_temp) VALUES
(1, 1,  15.00,  -20.00),
(1, 2,  15.00,  -80.00),
(2, 1, 120.50,  -20.00),
(2, 2,  95.00,    4.00),
(3, 1, 500.00,    4.00),
(4, 1,  60.00,    4.00),
(4, 2,  60.00,  -20.00),
(5, 1,  25.75,   20.00),
(6, 1,   8.50,  -80.00),
(7, 1, 250.00,    4.00),
(7, 2, 250.00,    4.00),
(8, 1, 310.00,    4.00);


-- incident : MISSION 1:N REPORTS
-- Missions 2, 3 and 7 deliberately have no incidents.
INSERT INTO incident (mission_id, incident_type, severity, time_reported, description) VALUES
(1, 'Acoustic Positioning Dropout', 'Moderate', '2025-11-05 11:35:00',
    'USBL fix lost for eleven minutes over the reef slope; vehicle continued on dead reckoning until reacquisition.'),
(1, 'Fishing Net Entanglement Risk','Low',      '2025-11-05 13:20:00',
    'Discarded gill net observed on the transect line; survey path offset by 40 m to avoid snagging the ROV tether.'),
(4, 'Thermal Shutdown Warning',     'High',     '2026-07-24 10:05:00',
    'Payload bay temperature exceeded threshold near an active vent; sampling paused for eighteen minutes to cool.'),
(4, 'Turbidity Loss of Visibility', 'Moderate', '2026-07-24 11:25:00',
    'Plume backscatter reduced camera visibility below one metre; imaging transect shortened.'),
(5, 'Manipulator Hydraulic Leak',   'Critical', '2026-08-03 07:40:00',
    'Minor hydraulic weep detected on the port manipulator joint; sampling arm locked out and dive continued on the spare.'),
(6, 'Core Barrel Jam',              'Low',      '2026-01-18 13:05:00',
    'Core barrel failed to release on the second attempt; cleared on deck with no loss of recovered sediment.');


-- ############################################################################
-- OFFSHORE INSPECTION TABLES
-- ############################################################################

-- inspection_task : MISSION 1:N PERFORMS and OFFSHORE_ASSET 1:N TARGETS
-- Covers all four priorities and all four statuses across different assets.
INSERT INTO inspection_task (mission_id, asset_id, task_type, priority, status, finding_summary) VALUES
(1, 4, 'Visual Cable Route Survey',            'Medium', 'Completed',
    'Cable exposed over a 60 m span at the shelf break; no armour damage observed. Reburial recommended.'),
(3, 4, 'Cable Burial Depth Verification',      'Low',    'Completed',
    'Burial depth between 0.9 m and 1.4 m along the surveyed corridor; within specification.'),
(6, 2, 'Subsea Manifold Structural Scan',      'High',   'Completed',
    'No structural deformation detected. Light marine growth on the northern support frame.'),
(6, 2, 'Sacrificial Anode Depletion Survey',   'Medium', 'Completed',
    'Anodes on the manifold skirt show approximately 45% depletion; replacement due within eighteen months.'),
(7, 3, 'LNG Jetty Pile Corrosion Inspection',  'Urgent', 'Pending',       NULL),
(7, 3, 'Scour Survey at Jetty Foundation',     'High',   'In Progress',   NULL),
(5, 1, 'Platform Leg Cathodic Protection Check','Low',   'Cancelled',
    'Task cancelled; vehicle reassigned to vent fauna sampling after the manipulator fault.');


-- ############################################################################
-- VALIDATION QUERIES (read-only)
-- ----------------------------------------------------------------------------
-- These do not modify data. They confirm the load succeeded and demonstrate the
-- joins and aggregates the application will use later.
-- ############################################################################

-- 1. Row count in every table -------------------------------------------------
SELECT 'research_vessel' AS table_name, COUNT(*) AS row_count FROM research_vessel
UNION ALL SELECT 'marine_zone',        COUNT(*) FROM marine_zone
UNION ALL SELECT 'auv_rov',            COUNT(*) FROM auv_rov
UNION ALL SELECT 'operator',           COUNT(*) FROM `operator`
UNION ALL SELECT 'sensor',             COUNT(*) FROM sensor
UNION ALL SELECT 'battery_pack',       COUNT(*) FROM battery_pack
UNION ALL SELECT 'offshore_asset',     COUNT(*) FROM offshore_asset
UNION ALL SELECT 'expedition',         COUNT(*) FROM expedition
UNION ALL SELECT 'mission',            COUNT(*) FROM mission
UNION ALL SELECT 'operator_contact',   COUNT(*) FROM operator_contact
UNION ALL SELECT 'mission_vehicle',    COUNT(*) FROM mission_vehicle
UNION ALL SELECT 'mission_operator',   COUNT(*) FROM mission_operator
UNION ALL SELECT 'vehicle_sensor',     COUNT(*) FROM vehicle_sensor
UNION ALL SELECT 'vehicle_battery',    COUNT(*) FROM vehicle_battery
UNION ALL SELECT 'maintenance_record', COUNT(*) FROM maintenance_record
UNION ALL SELECT 'telemetry_point',    COUNT(*) FROM telemetry_point
UNION ALL SELECT 'sample',             COUNT(*) FROM sample
UNION ALL SELECT 'sample_aliquot',     COUNT(*) FROM sample_aliquot
UNION ALL SELECT 'incident',           COUNT(*) FROM incident
UNION ALL SELECT 'inspection_task',    COUNT(*) FROM inspection_task;


-- 2. Expeditions with their research vessels ----------------------------------
SELECT e.expedition_id,
       e.title,
       rv.vessel_name,
       rv.home_port,
       e.start_date,
       e.end_date,
       e.status,
       e.budget
FROM expedition e
JOIN research_vessel rv ON rv.vessel_id = e.vessel_id
ORDER BY e.expedition_id;


-- 3. Missions with expedition title and marine zone ---------------------------
-- mission_duration is derived here rather than stored in the table.
SELECT m.mission_id,
       e.title AS expedition_title,
       mz.zone_name,
       mz.region,
       m.mission_type,
       m.start_time,
       m.end_time,
       TIMESTAMPDIFF(MINUTE, m.start_time, m.end_time) AS mission_duration_minutes,
       m.depth_target,
       m.status
FROM mission m
JOIN expedition  e  ON e.expedition_id = m.expedition_id
JOIN marine_zone mz ON mz.zone_id      = m.zone_id
ORDER BY m.mission_id;


-- 4. Mission-vehicle assignments ----------------------------------------------
SELECT mv.mission_id,
       m.mission_type,
       v.vehicle_name,
       v.vehicle_type,
       mv.launch_time,
       mv.recovery_time
FROM mission_vehicle mv
JOIN mission m ON m.mission_id = mv.mission_id
JOIN auv_rov v ON v.vehicle_id = mv.vehicle_id
ORDER BY mv.mission_id, v.vehicle_name;


-- 5. Mission-operator assignments ---------------------------------------------
SELECT mo.mission_id,
       m.mission_type,
       CONCAT(o.first_name, ' ', o.last_name) AS operator_name,
       o.certification_level,
       mo.duty_role,
       mo.shift
FROM mission_operator mo
JOIN mission    m ON m.mission_id  = mo.mission_id
JOIN `operator` o ON o.operator_id = mo.operator_id
ORDER BY mo.mission_id, operator_name;


-- 6. Samples with their aliquot count ------------------------------------------
SELECT s.sample_id,
       s.sample_type,
       s.mission_id,
       s.chain_of_custody_status,
       COUNT(sa.aliquot_no)      AS aliquot_count,
       COALESCE(SUM(sa.volume_ml), 0) AS total_volume_ml
FROM sample s
LEFT JOIN sample_aliquot sa ON sa.sample_id = s.sample_id
GROUP BY s.sample_id, s.sample_type, s.mission_id, s.chain_of_custody_status
ORDER BY s.sample_id;


-- 7. Inspection tasks with their offshore assets --------------------------------
SELECT it.inspection_id,
       it.mission_id,
       oa.asset_name,
       oa.asset_type,
       it.task_type,
       it.priority,
       it.status,
       it.finding_summary
FROM inspection_task it
JOIN offshore_asset oa ON oa.asset_id = it.asset_id
ORDER BY it.inspection_id;


-- 8. Incidents with their missions ----------------------------------------------
SELECT i.incident_id,
       i.mission_id,
       m.mission_type,
       e.title AS expedition_title,
       i.incident_type,
       i.severity,
       i.time_reported
FROM incident i
JOIN mission    m ON m.mission_id    = i.mission_id
JOIN expedition e ON e.expedition_id = m.expedition_id
ORDER BY i.incident_id;
