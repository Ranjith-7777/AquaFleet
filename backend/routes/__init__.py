"""
routes package
--------------
Holds the REST API endpoints of AquaFleet, grouped by feature so that app.py
stays small and readable. Each module defines one Flask Blueprint, and app.py
registers it.

Implemented:
    vessels.py      - CRUD for research_vessel
    marine_zones.py - CRUD for marine_zone
    vehicles.py     - CRUD for auv_rov
    operators.py    - CRUD for operator + operator_contact
    sensors.py      - CRUD for sensor
    battery_packs.py - CRUD for battery_pack
    offshore_assets.py - CRUD for offshore_asset
    expeditions.py  - CRUD for expedition
    missions.py     - CRUD for mission
    mission_vehicles.py   - CRUD for mission_vehicle
    mission_operators.py  - CRUD for mission_operator
    vehicle_sensors.py    - CRUD for vehicle_sensor
    vehicle_batteries.py  - CRUD for vehicle_battery
    maintenance_records.py - CRUD for maintenance_record
    telemetry_points.py    - CRUD for telemetry_point
    samples.py             - CRUD for sample
    sample_aliquots.py     - CRUD for sample_aliquot
    incidents.py           - CRUD for incident
    inspection_tasks.py    - CRUD for inspection_task
    auth.py                - session login/logout for app_user

Re-exported here so app.py can simply write:

    from routes import vessels_bp, marine_zones_bp, vehicles_bp, ...
"""

from routes.auth import auth_bp
from routes.battery_packs import battery_packs_bp
from routes.expeditions import expeditions_bp
from routes.incidents import incidents_bp
from routes.inspection_tasks import inspection_tasks_bp
from routes.maintenance_records import maintenance_records_bp
from routes.marine_zones import marine_zones_bp
from routes.mission_operators import mission_operators_bp
from routes.mission_vehicles import mission_vehicles_bp
from routes.missions import missions_bp
from routes.offshore_assets import offshore_assets_bp
from routes.operators import operators_bp
from routes.sensors import sensors_bp
from routes.sample_aliquots import sample_aliquots_bp
from routes.samples import samples_bp
from routes.telemetry_points import telemetry_points_bp
from routes.vehicle_batteries import vehicle_batteries_bp
from routes.vehicle_sensors import vehicle_sensors_bp
from routes.vehicles import vehicles_bp
from routes.vessels import vessels_bp

__all__ = [
    "auth_bp",
    "vessels_bp",
    "marine_zones_bp",
    "vehicles_bp",
    "operators_bp",
    "sensors_bp",
    "battery_packs_bp",
    "offshore_assets_bp",
    "expeditions_bp",
    "missions_bp",
    "mission_vehicles_bp",
    "mission_operators_bp",
    "vehicle_sensors_bp",
    "vehicle_batteries_bp",
    "maintenance_records_bp",
    "telemetry_points_bp",
    "samples_bp",
    "sample_aliquots_bp",
    "incidents_bp",
    "inspection_tasks_bp",
]
