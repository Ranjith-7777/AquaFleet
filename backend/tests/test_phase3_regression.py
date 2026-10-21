"""Whole-application Flask regression tests on a disposable MySQL database."""

import importlib
import os
import sys
import unittest
from pathlib import Path

import mysql.connector
from werkzeug.security import generate_password_hash

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import Config  # noqa: E402
from tests.test_phase2_database import execute_sql_script  # noqa: E402


RUN_DATABASE_TESTS = os.getenv("AQUAFLEET_RUN_DB_TESTS") == "1"


@unittest.skipUnless(RUN_DATABASE_TESTS, "set AQUAFLEET_RUN_DB_TESTS=1")
class Phase3ApplicationRegressionTests(unittest.TestCase):
    DB_NAME = "aquafleet_phase3_regression_test"
    PASSWORD = "AquaFleet-Test-Password-2026"

    @classmethod
    def setUpClass(cls):
        cls.original_db_name = Config.DB_NAME
        params = Config.db_params()
        params.pop("database", None)
        cls.server_connection = mysql.connector.connect(**params)
        cursor = cls.server_connection.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
        cursor.close()
        schema = (PROJECT_DIR / "database" / "schema.sql").read_text(
            encoding="utf-8"
        ).replace("aquafleet_db", cls.DB_NAME)
        sample = (PROJECT_DIR / "database" / "sample_data.sql").read_text(
            encoding="utf-8"
        ).replace("aquafleet_db", cls.DB_NAME)
        try:
            execute_sql_script(cls.server_connection, schema)
            execute_sql_script(cls.server_connection, sample)
            cursor = cls.server_connection.cursor()
            password_hash = generate_password_hash(cls.PASSWORD)
            cursor.executemany(
                "INSERT INTO app_user"
                "(username,password_hash,full_name,role,is_active) "
                "VALUES(%s,%s,%s,%s,%s)",
                [
                    ("p3_admin", password_hash, "Phase 3 Admin", "ADMIN", True),
                    (
                        "p3_researcher", password_hash, "Phase 3 Researcher",
                        "RESEARCHER", True,
                    ),
                    (
                        "p3_operator", password_hash, "Phase 3 Operator",
                        "OPERATOR", True,
                    ),
                    ("p3_viewer", password_hash, "Phase 3 Viewer", "VIEWER", True),
                    (
                        "p3_inactive", password_hash, "Phase 3 Inactive",
                        "VIEWER", False,
                    ),
                ],
            )
            cls.server_connection.commit()
            cursor.close()
            Config.DB_NAME = cls.DB_NAME
            cls.flask_app = importlib.import_module("app").app
            cls.flask_app.config.update(
                TESTING=True, SECRET_KEY="phase3-regression-secret"
            )
        except Exception:
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
            cls.server_connection.close()
            Config.DB_NAME = cls.original_db_name
            raise

    @classmethod
    def tearDownClass(cls):
        Config.DB_NAME = cls.original_db_name
        try:
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
        finally:
            cls.server_connection.close()

    def setUp(self):
        self.client = self.flask_app.test_client()

    def login(self, role="admin"):
        response = self.client.post(
            "/api/auth/login",
            json={"username": f"p3_{role}", "password": self.PASSWORD},
        )
        self.assertEqual(200, response.status_code, response.get_json())
        return response

    def create(self, path, payload, key):
        response = self.client.post(path, json=payload)
        self.assertEqual(201, response.status_code, response.get_json())
        return response.get_json()["data"][key]

    def test_authentication_session_and_inactive_account(self):
        self.assertEqual(401, self.client.get("/api/vessels").status_code)
        bad = self.client.post(
            "/api/auth/login",
            json={"username": "p3_admin", "password": "wrong"},
        )
        self.assertEqual(401, bad.status_code)
        self.assertNotIn("password_hash", str(bad.get_json()).lower())
        self.assertNotIn("wrong", str(bad.get_json()).lower())

        logged_in = self.login("admin")
        self.assertEqual("ADMIN", logged_in.get_json()["data"]["role"])
        me = self.client.get("/api/auth/me")
        self.assertEqual(200, me.status_code)
        self.assertEqual("p3_admin", me.get_json()["data"]["username"])
        self.assertNotIn("password_hash", me.get_json()["data"])
        self.assertEqual(200, self.client.post("/api/auth/logout").status_code)
        self.assertEqual(401, self.client.get("/api/auth/me").status_code)

        inactive = self.client.post(
            "/api/auth/login",
            json={"username": "p3_inactive", "password": self.PASSWORD},
        )
        self.assertEqual(403, inactive.status_code)

    def test_role_matrix_reaches_backend_boundary(self):
        cases = {
            "admin": [
                ("post", "/api/vessels", {}, 400),
                ("delete", "/api/expeditions/999999", None, 404),
            ],
            "researcher": [
                ("post", "/api/expeditions", {}, 400),
                ("post", "/api/samples", {}, 400),
                ("delete", "/api/expeditions/999999", None, 403),
                ("post", "/api/vessels", {}, 403),
            ],
            "operator": [
                ("put", "/api/missions/999999", {}, 400),
                ("post", "/api/telemetry-points", {}, 400),
                ("post", "/api/samples", {}, 403),
                ("post", "/api/vessels", {}, 403),
            ],
            "viewer": [
                ("get", "/api/vessels", None, 200),
                ("get", "/api/reports/expeditions", None, 200),
                ("post", "/api/vessels", {}, 403),
                ("post", "/api/samples", {}, 403),
            ],
        }
        for role, requests in cases.items():
            self.client = self.flask_app.test_client()
            self.login(role)
            for method, path, body, expected in requests:
                response = getattr(self.client, method)(path, json=body)
                self.assertEqual(expected, response.status_code, (role, path))
            self.assertEqual(200, self.client.get("/api/auth/me").status_code)

    def test_master_data_crud_validation_duplicates_and_dependencies(self):
        self.login("admin")
        resources = [
            (
                "/api/vessels", "vessel_id",
                {
                    "vessel_name": "P3 Regression Vessel",
                    "vessel_type": "Research", "capacity": 28,
                    "home_port": "Kochi",
                },
                {
                    "vessel_name": "P3 Regression Vessel Updated",
                    "vessel_type": "Research", "capacity": 30,
                    "home_port": "Kochi",
                },
            ),
            (
                "/api/marine-zones", "zone_id",
                {
                    "zone_name": "P3 Regression Zone", "region": "Arabian Sea",
                    "min_depth": 10, "max_depth": 300,
                    "risk_level": "Moderate",
                },
                {
                    "zone_name": "P3 Regression Zone Updated",
                    "region": "Arabian Sea", "min_depth": 15,
                    "max_depth": 310, "risk_level": "High",
                },
            ),
            (
                "/api/vehicles", "vehicle_id",
                {
                    "vehicle_name": "P3 Regression ROV", "vehicle_type": "ROV",
                    "model": "P3-R", "max_depth": 500,
                    "status": "Available",
                },
                {
                    "vehicle_name": "P3 Regression ROV Updated",
                    "vehicle_type": "ROV", "model": "P3-R2",
                    "max_depth": 550, "status": "Available",
                },
            ),
            (
                "/api/operators", "operator_id",
                {
                    "first_name": "Phase", "last_name": "Three",
                    "role": "Pilot", "certification_level": "Level 3",
                    "email": "phase3.operator@example.test",
                    "contact_numbers": ["+91-9000000091"],
                },
                {
                    "first_name": "Phase", "last_name": "Three Updated",
                    "role": "Pilot", "certification_level": "Level 4",
                    "email": "phase3.operator.updated@example.test",
                    "contact_numbers": ["+91-9000000092"],
                },
            ),
            (
                "/api/sensors", "sensor_id",
                {
                    "sensor_type": "P3 Sonar", "manufacturer": "AquaFleet",
                    "calibration_date": "2026-09-01", "accuracy": 0.125,
                },
                {
                    "sensor_type": "P3 Sonar Updated",
                    "manufacturer": "AquaFleet", "calibration_date": "2026-09-02",
                    "accuracy": 0.1,
                },
            ),
            (
                "/api/battery-packs", "battery_id",
                {
                    "chemistry": "Li-ion P3", "capacity_wh": 4200,
                    "health_status": "Excellent", "cycle_count": 0,
                },
                {
                    "chemistry": "Li-ion P3", "capacity_wh": 4250,
                    "health_status": "Good", "cycle_count": 1,
                },
            ),
            (
                "/api/offshore-assets", "asset_id",
                {
                    "asset_name": "P3 Test Buoy", "asset_type": "Buoy",
                    "latitude": 10.1, "longitude": 76.2,
                },
                {
                    "asset_name": "P3 Test Buoy Updated", "asset_type": "Buoy",
                    "latitude": 10.2, "longitude": 76.3,
                },
            ),
        ]
        created = []
        for path, key, payload, updated in resources:
            record_id = self.create(path, payload, key)
            created.append((path, record_id))
            response = self.client.put(f"{path}/{record_id}", json=updated)
            self.assertEqual(200, response.status_code, response.get_json())

        duplicate = self.client.post("/api/vessels", json=resources[0][3])
        self.assertEqual(409, duplicate.status_code)
        self.assertEqual(400, self.client.post("/api/vessels", json={}).status_code)
        self.assertEqual(409, self.client.delete("/api/vessels/1").status_code)
        self.assertEqual(404, self.client.delete("/api/vessels/999999").status_code)

        for path, record_id in reversed(created):
            response = self.client.delete(f"{path}/{record_id}")
            self.assertEqual(200, response.status_code, (path, response.get_json()))

    def test_complete_operational_crud_workflow(self):
        self.login("admin")
        vessel_id = self.create(
            "/api/vessels",
            {
                "vessel_name": "P3 Workflow Vessel", "vessel_type": "Research",
                "capacity": 40, "home_port": "Kochi",
            }, "vessel_id",
        )
        zone_id = self.create(
            "/api/marine-zones",
            {
                "zone_name": "P3 Workflow Zone", "region": "Arabian Sea",
                "min_depth": 20, "max_depth": 400, "risk_level": "Moderate",
            }, "zone_id",
        )
        vehicle_id = self.create(
            "/api/vehicles",
            {
                "vehicle_name": "P3 Workflow ROV", "vehicle_type": "ROV",
                "model": "WF-3", "max_depth": 600, "status": "Available",
            }, "vehicle_id",
        )
        operator_id = self.create(
            "/api/operators",
            {
                "first_name": "Workflow", "last_name": "Operator",
                "role": "ROV Pilot", "certification_level": "Level 4",
                "email": "p3.workflow.operator@example.test",
                "contact_numbers": ["+91-9000000093"],
            }, "operator_id",
        )
        sensor_id = self.create(
            "/api/sensors",
            {
                "sensor_type": "Workflow Sonar", "manufacturer": "AquaFleet",
                "calibration_date": "2026-09-01", "accuracy": 0.1,
            }, "sensor_id",
        )
        battery_id = self.create(
            "/api/battery-packs",
            {
                "chemistry": "Workflow Li-ion", "capacity_wh": 5000,
                "health_status": "Excellent", "cycle_count": 0,
            }, "battery_id",
        )
        asset_id = self.create(
            "/api/offshore-assets",
            {
                "asset_name": "Workflow Test Asset", "asset_type": "Test Rig",
                "latitude": 10.0, "longitude": 76.0,
            }, "asset_id",
        )
        expedition_payload = {
            "vessel_id": vessel_id, "title": "P3 Workflow Expedition",
            "start_date": "2026-10-01", "end_date": "2026-10-10",
            "objective": "Phase 3 complete workflow verification",
            "status": "Planned", "budget": 250000,
        }
        expedition_id = self.create(
            "/api/expeditions", expedition_payload, "expedition_id"
        )
        mission_payload = {
            "expedition_id": expedition_id, "zone_id": zone_id,
            "mission_type": "P3 Workflow Mission",
            "start_time": "2026-10-02 08:00:00",
            "end_time": None,
            "depth_target": 150, "status": "Planned",
        }
        mission_id = self.create("/api/missions", mission_payload, "mission_id")

        self.assertEqual(201, self.client.post(
            "/api/mission-vehicles",
            json={
                "mission_id": mission_id, "vehicle_id": vehicle_id,
                "launch_time": "2026-10-02 08:10:00",
                "recovery_time": None,
            },
        ).status_code)
        self.assertEqual(201, self.client.post(
            "/api/mission-operators",
            json={
                "mission_id": mission_id, "operator_id": operator_id,
                "duty_role": "Pilot", "shift": "Day",
            },
        ).status_code)
        self.assertEqual(201, self.client.post(
            "/api/vehicle-sensors",
            json={
                "vehicle_id": vehicle_id, "sensor_id": sensor_id,
                "mount_position": "Forward", "install_date": "2026-09-18",
            },
        ).status_code)
        battery_start = "2026-09-18 01:00:00"
        self.assertEqual(201, self.client.post(
            "/api/vehicle-batteries",
            json={
                "vehicle_id": vehicle_id, "battery_id": battery_id,
                "start_cycle": battery_start, "end_cycle": None,
            },
        ).status_code)
        maintenance_id = self.create(
            "/api/maintenance-records",
            {
                "vehicle_id": vehicle_id, "maint_date": "2026-09-18",
                "action_taken": "Pre-mission inspection", "cost": 1200,
                "next_due_date": "2026-12-25",
            }, "maintenance_id",
        )

        mission_payload["status"] = "In Progress"
        response = self.client.put(
            f"/api/missions/{mission_id}", json=mission_payload
        )
        self.assertEqual(200, response.status_code, response.get_json())

        telemetry = {
            "mission_id": mission_id, "log_no": 1,
            "timestamp": "2026-10-02 09:00:00", "latitude": 10.1,
            "longitude": 76.1, "depth": 120, "battery_level": 85,
            "temperature": 18.5,
        }
        self.assertEqual(201, self.client.post(
            "/api/telemetry-points", json=telemetry
        ).status_code)
        self.assertEqual(409, self.client.post(
            "/api/telemetry-points", json=telemetry
        ).status_code)
        sample_id = self.create(
            "/api/samples",
            {
                "mission_id": mission_id, "sample_type": "P3 Water",
                "collected_at": "2026-10-02 09:15:00",
                "preservation_method": "Chilled",
                "chain_of_custody_status": "Collected",
            }, "sample_id",
        )
        self.assertEqual(201, self.client.post(
            "/api/sample-aliquots",
            json={
                "sample_id": sample_id, "aliquot_no": 1,
                "volume_ml": 50, "storage_temp": 4,
            },
        ).status_code)
        incident_id = self.create(
            "/api/incidents",
            {
                "mission_id": mission_id, "incident_type": "P3 Minor Alert",
                "severity": "Low", "time_reported": "2026-10-02 09:30:00",
                "description": "Temporary workflow incident",
            }, "incident_id",
        )
        inspection_id = self.create(
            "/api/inspection-tasks",
            {
                "mission_id": mission_id, "asset_id": asset_id,
                "task_type": "P3 Visual Check", "priority": "Medium",
                "status": "Pending", "finding_summary": None,
            }, "inspection_id",
        )

        updates = [
            (
                f"/api/mission-vehicles/{mission_id}/{vehicle_id}",
                {
                    "launch_time": "2026-10-02 08:10:00",
                    "recovery_time": "2026-10-02 11:50:00",
                },
            ),
            (
                f"/api/mission-operators/{mission_id}/{operator_id}",
                {"duty_role": "Lead Pilot", "shift": "Day"},
            ),
            (
                f"/api/vehicle-sensors/{vehicle_id}/{sensor_id}",
                {"mount_position": "Forward Port", "install_date": "2026-09-18"},
            ),
            (
                f"/api/vehicle-batteries/{vehicle_id}/{battery_id}"
                f"?start_cycle=2026-09-18%2001%3A00%3A00",
                {"end_cycle": "2026-09-18 02:00:00"},
            ),
            (
                f"/api/maintenance-records/{maintenance_id}",
                {
                    "maint_date": "2026-09-18", "action_taken": "Verified",
                    "cost": 1250, "next_due_date": "2026-12-25",
                },
            ),
            (
                f"/api/telemetry-points/{mission_id}/1",
                {
                    "timestamp": "2026-10-02 09:05:00", "latitude": 10.1,
                    "longitude": 76.1, "depth": 125, "battery_level": 84,
                    "temperature": 18.4,
                },
            ),
            (
                f"/api/samples/{sample_id}",
                {
                    "sample_type": "P3 Water Updated",
                    "collected_at": "2026-10-02 09:15:00",
                    "preservation_method": "Chilled",
                    "chain_of_custody_status": "Sealed",
                },
            ),
            (
                f"/api/sample-aliquots/{sample_id}/1",
                {"volume_ml": 45, "storage_temp": 4},
            ),
            (
                f"/api/incidents/{incident_id}",
                {
                    "incident_type": "P3 Minor Alert Updated", "severity": "Low",
                    "time_reported": "2026-10-02 09:30:00",
                    "description": "Reviewed temporary incident",
                },
            ),
            (
                f"/api/inspection-tasks/{inspection_id}",
                {
                    "task_type": "P3 Visual Check Updated", "priority": "High",
                    "status": "Pending", "finding_summary": None,
                },
            ),
        ]
        for path, payload in updates:
            response = self.client.put(path, json=payload)
            self.assertEqual(200, response.status_code, (path, response.get_json()))

        report = self.client.get(
            f"/api/reports/missions?zone_id={zone_id}"
        ).get_json()
        self.assertTrue(any(
            row["mission_id"] == mission_id for row in report["data"]
        ))
        self.assertEqual(400, self.client.post(
            "/api/samples",
            json={
                "mission_id": 999999, "sample_type": "Missing parent",
                "collected_at": "2026-10-02 09:15:00",
                "preservation_method": "Chilled",
                "chain_of_custody_status": "Collected",
            },
        ).status_code)

        deletes = [
            f"/api/inspection-tasks/{inspection_id}",
            f"/api/incidents/{incident_id}",
            f"/api/sample-aliquots/{sample_id}/1",
            f"/api/samples/{sample_id}",
            f"/api/telemetry-points/{mission_id}/1",
            f"/api/maintenance-records/{maintenance_id}",
            (
                f"/api/vehicle-batteries/{vehicle_id}/{battery_id}"
                f"?start_cycle=2026-09-18%2001%3A00%3A00"
            ),
            f"/api/vehicle-sensors/{vehicle_id}/{sensor_id}",
            f"/api/mission-operators/{mission_id}/{operator_id}",
            f"/api/mission-vehicles/{mission_id}/{vehicle_id}",
            f"/api/missions/{mission_id}",
            f"/api/expeditions/{expedition_id}",
            f"/api/offshore-assets/{asset_id}",
            f"/api/battery-packs/{battery_id}",
            f"/api/sensors/{sensor_id}",
            f"/api/operators/{operator_id}",
            f"/api/vehicles/{vehicle_id}",
            f"/api/marine-zones/{zone_id}",
            f"/api/vessels/{vessel_id}",
        ]
        for path in deletes:
            response = self.client.delete(path)
            self.assertEqual(200, response.status_code, (path, response.get_json()))

    def test_reporting_contract_filters_empty_results_and_read_only(self):
        self.login("viewer")
        endpoints = (
            "/api/reports/expeditions", "/api/reports/missions",
            "/api/reports/vehicle-readiness", "/api/reports/sample-lineage",
            "/api/reports/incidents",
        )
        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(200, response.status_code, endpoint)
            body = response.get_json()
            self.assertEqual({"success", "report", "count", "data"}, set(body))
            self.assertEqual(body["count"], len(body["data"]))
            self.assertEqual(405, self.client.post(endpoint, json={}).status_code)
        filtered = self.client.get(
            "/api/reports/expeditions?status=Completed"
        ).get_json()
        self.assertTrue(all(row["status"] == "Completed" for row in filtered["data"]))
        empty = self.client.get(
            "/api/reports/sample-lineage?mission_id=2147483647"
        ).get_json()
        self.assertEqual(0, empty["count"])
        self.assertEqual([], empty["data"])
        self.client.post("/api/auth/logout")
        self.assertEqual(401, self.client.get(endpoints[0]).status_code)


if __name__ == "__main__":
    unittest.main()
