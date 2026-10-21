"""Isolated MySQL integration tests for Phase 2 database objects and reports."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import mysql.connector
from flask import Flask, g, session

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from authentication import (  # noqa: E402
    SESSION_ROLE,
    SESSION_USER_ID,
    authentication_required_response,
    guard_authorization,
)
from config import Config  # noqa: E402
from routes.reports import reports_bp  # noqa: E402


RUN_DATABASE_TESTS = os.getenv("AQUAFLEET_RUN_DB_TESTS") == "1"


def execute_sql_script(connection, script):
    """Execute a mysql-client script, including DELIMITER changes."""
    delimiter = ";"
    statement_lines = []
    cursor = connection.cursor()
    try:
        for line in script.splitlines():
            stripped = line.strip()
            if stripped.upper().startswith("DELIMITER "):
                delimiter = stripped.split(maxsplit=1)[1]
                continue
            statement_lines.append(line)
            if not stripped.endswith(delimiter):
                continue

            statement_lines[-1] = line[:line.rfind(delimiter)]
            statement = "\n".join(statement_lines).strip()
            statement_lines = []
            if not statement:
                continue
            cursor.execute(statement)
            if cursor.with_rows:
                cursor.fetchall()
            while cursor.nextset():
                if cursor.with_rows:
                    cursor.fetchall()

        remaining = [
            line for line in statement_lines
            if line.strip() and not line.lstrip().startswith("--")
        ]
        if remaining:
            raise AssertionError("SQL script ended with an unterminated statement")
    finally:
        cursor.close()


@unittest.skipUnless(RUN_DATABASE_TESTS, "set AQUAFLEET_RUN_DB_TESTS=1")
class Phase2DatabaseTests(unittest.TestCase):
    DB_NAME = "aquafleet_phase2_test"

    @classmethod
    def setUpClass(cls):
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
            cls.server_connection.commit()
        except Exception:
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
            cls.server_connection.close()
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
        finally:
            cls.server_connection.close()

    def connect(self):
        params = Config.db_params()
        params["database"] = self.DB_NAME
        return mysql.connector.connect(**params)

    def test_all_schema_tables_exist(self):
        expected = {
            "research_vessel", "marine_zone", "auv_rov", "operator",
            "sensor", "battery_pack", "offshore_asset", "expedition",
            "mission", "operator_contact", "mission_vehicle",
            "mission_operator", "vehicle_sensor", "vehicle_battery",
            "maintenance_record", "telemetry_point", "sample",
            "sample_aliquot", "incident", "inspection_task", "app_user",
            "notification",
        }
        connection = self.connect()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=%s AND table_type='BASE TABLE'",
            (self.DB_NAME,),
        )
        self.assertEqual(expected, {row["TABLE_NAME"] for row in cursor})
        cursor.close()
        connection.close()

    def test_views_exist_and_return_expected_joined_values(self):
        connection = self.connect()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT table_name FROM information_schema.views "
            "WHERE table_schema=%s ORDER BY table_name", (self.DB_NAME,)
        )
        self.assertEqual({
            "vw_expedition_summary", "vw_incident_overview",
            "vw_mission_operations", "vw_sample_lineage",
            "vw_vehicle_readiness",
        }, {row["TABLE_NAME"] for row in cursor.fetchall()})
        cursor.execute(
            "SELECT vessel_name, mission_count FROM vw_expedition_summary "
            "WHERE expedition_id=1"
        )
        row = cursor.fetchone()
        self.assertEqual("ORV Sagar Nidhi", row["vessel_name"])
        self.assertEqual(3, row["mission_count"])
        cursor.execute(
            "SELECT vehicle_count, operator_count, duration_minutes "
            "FROM vw_mission_operations WHERE mission_id=1"
        )
        row = cursor.fetchone()
        self.assertEqual((2, 3, 390), (
            row["vehicle_count"], row["operator_count"],
            row["duration_minutes"],
        ))
        cursor.execute(
            "SELECT COUNT(*) AS count FROM vw_sample_lineage "
            "WHERE sample_id=1"
        )
        self.assertGreaterEqual(cursor.fetchone()["count"], 1)
        cursor.close()
        connection.close()

    def test_mission_insert_and_update_triggers(self):
        connection = self.connect()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO mission(expedition_id,zone_id,mission_type,start_time,"
            "end_time,depth_target,status) VALUES(4,2,%s,%s,NULL,100,'Planned')",
            ("Trigger valid mission", "2026-09-20 08:00:00"),
        )
        mission_id = cursor.lastrowid
        cursor.execute(
            "UPDATE mission SET status='In Progress' WHERE mission_id=%s",
            (mission_id,),
        )
        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(
                "UPDATE mission SET depth_target=999 WHERE mission_id=%s",
                (mission_id,),
            )
        self.assertEqual(1644, failure.exception.errno)
        connection.rollback()
        cursor.execute(
            "SELECT COUNT(*) FROM mission WHERE mission_type=%s",
            ("Trigger valid mission",),
        )
        self.assertEqual(0, cursor.fetchone()[0])

        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(
                "INSERT INTO mission(expedition_id,zone_id,mission_type,"
                "start_time,end_time,depth_target,status) "
                "VALUES(4,2,'Invalid date','2030-01-01 08:00:00',NULL,100,'Planned')"
            )
        self.assertEqual(1644, failure.exception.errno)
        connection.rollback()
        cursor.close()
        connection.close()

    def test_vehicle_assignment_insert_and_update_triggers(self):
        connection = self.connect()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO mission_vehicle(mission_id,vehicle_id,launch_time,"
            "recovery_time) VALUES(7,1,'2026-09-18 07:10:00',NULL)"
        )
        cursor.execute(
            "UPDATE mission_vehicle SET recovery_time='2026-09-18 09:00:00' "
            "WHERE mission_id=7 AND vehicle_id=1"
        )
        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(
                "UPDATE mission_vehicle SET vehicle_id=5 "
                "WHERE mission_id=7 AND vehicle_id=1"
            )
        self.assertEqual(1644, failure.exception.errno)
        connection.rollback()
        cursor.execute(
            "SELECT COUNT(*) FROM mission_vehicle "
            "WHERE mission_id=7 AND vehicle_id=1"
        )
        self.assertEqual(0, cursor.fetchone()[0])

        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(
                "INSERT INTO mission_vehicle(mission_id,vehicle_id,launch_time,"
                "recovery_time) VALUES(7,5,'2026-09-18 07:10:00',NULL)"
            )
        self.assertEqual(1644, failure.exception.errno)
        connection.rollback()
        cursor.close()
        connection.close()

    def test_procedures_and_out_parameters(self):
        connection = self.connect()
        cursor = connection.cursor(dictionary=True)
        cursor.callproc("sp_get_expedition_report", (1,))
        result_sets = [result.fetchall() for result in cursor.stored_results()]
        self.assertEqual(2, len(result_sets))
        self.assertEqual(1, result_sets[0][0]["expedition_id"])
        self.assertEqual(3, len(result_sets[1]))

        cursor.callproc("sp_get_vehicle_maintenance_history", (1,))
        result_sets = [result.fetchall() for result in cursor.stored_results()]
        self.assertEqual(2, len(result_sets))
        self.assertEqual(1, result_sets[0][0]["vehicle_id"])

        cursor.callproc("sp_get_mission_summary", (1,))
        result_sets = [result.fetchall() for result in cursor.stored_results()]
        self.assertEqual(3, len(result_sets))
        self.assertEqual((2, 3), (len(result_sets[1]), len(result_sets[2])))

        output = cursor.callproc("sp_get_expedition_metrics", (1, 0, 0, 0))
        output_values = list(output.values())
        self.assertEqual(3, output_values[1])
        self.assertGreaterEqual(output_values[2], 1)
        self.assertGreaterEqual(output_values[3], 1)

        cursor.callproc("sp_get_expedition_report", (999999,))
        missing_sets = [result.fetchall() for result in cursor.stored_results()]
        self.assertEqual([[], []], missing_sets)
        cursor.close()
        connection.close()

    def test_reporting_api_authentication_filters_and_read_only_methods(self):
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="phase2-tests")
        app.register_blueprint(reports_bp)

        @app.before_request
        def protect():
            if SESSION_USER_ID not in session:
                return authentication_required_response()
            g.current_user = {"user_id": session[SESSION_USER_ID],
                              "role": session[SESSION_ROLE]}
            return guard_authorization()

        client = app.test_client()
        self.assertEqual(401, client.get("/api/reports/expeditions").status_code)
        with client.session_transaction() as logged_in:
            logged_in[SESSION_USER_ID] = 1
            logged_in[SESSION_ROLE] = "VIEWER"

        def report_connection():
            return self.connect()

        with patch("routes.reports.get_db_connection", report_connection):
            for path in (
                "/api/reports/expeditions", "/api/reports/missions",
                "/api/reports/vehicle-readiness",
                "/api/reports/sample-lineage", "/api/reports/incidents",
            ):
                report_response = client.get(path)
                self.assertEqual(200, report_response.status_code, path)
                self.assertTrue(report_response.get_json()["success"], path)
            response = client.get("/api/reports/expeditions?status=Completed")
            self.assertEqual(200, response.status_code)
            self.assertGreater(response.get_json()["count"], 0)
            self.assertTrue(all(
                row["status"] == "Completed"
                for row in response.get_json()["data"]
            ))
            self.assertEqual(
                400,
                client.get("/api/reports/missions?zone_id=bad").status_code,
            )
            self.assertEqual(
                405, client.post("/api/reports/expeditions", json={}).status_code
            )

    def test_reporting_indexes_exist(self):
        connection = self.connect()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT index_name FROM information_schema.statistics "
            "WHERE table_schema=%s", (self.DB_NAME,)
        )
        names = {row[0] for row in cursor.fetchall()}
        self.assertTrue({
            "idx_expedition_status", "idx_mission_status",
            "idx_incident_severity_time",
        }.issubset(names))
        cursor.close()
        connection.close()

    def test_reporting_indexes_are_query_candidates(self):
        connection = self.connect()
        cursor = connection.cursor(dictionary=True)
        cases = [
            (
                "EXPLAIN SELECT expedition_id FROM expedition WHERE status=%s",
                ("Completed",),
                "idx_expedition_status",
            ),
            (
                "EXPLAIN SELECT mission_id FROM mission WHERE status=%s",
                ("Completed",),
                "idx_mission_status",
            ),
            (
                "EXPLAIN SELECT incident_id FROM incident "
                "WHERE severity=%s ORDER BY time_reported DESC",
                ("High",),
                "idx_incident_severity_time",
            ),
        ]
        for sql, params, expected_index in cases:
            cursor.execute(sql, params)
            plan = cursor.fetchone()
            possible = (plan["possible_keys"] or "").split(",")
            self.assertIn(expected_index, possible)
        cursor.close()
        connection.close()

    def test_transaction_demo_executes_and_cleans_up(self):
        connection = self.connect()
        script = (PROJECT_DIR / "database" / "demo_transactions.sql").read_text(
            encoding="utf-8"
        ).replace("aquafleet_db", self.DB_NAME)
        execute_sql_script(connection, script)
        cursor = connection.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM mission "
            "WHERE mission_type LIKE 'TRANSACTION DEMO%'"
        )
        self.assertEqual(0, cursor.fetchone()[0])
        cursor.execute(
            "SELECT COUNT(*) FROM sample "
            "WHERE sample_type LIKE 'TRANSACTION DEMO%'"
        )
        self.assertEqual(0, cursor.fetchone()[0])
        cursor.close()
        connection.close()


if __name__ == "__main__":
    unittest.main()
