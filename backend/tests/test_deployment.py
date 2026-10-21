"""Deployment configuration, static hosting and guarded database tests."""

import os
import sys
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import app  # noqa: E402
from authentication import start_session  # noqa: E402
from config import Config  # noqa: E402
from extensions import limiter  # noqa: E402
from manage_database import (  # noqa: E402
    MIGRATIONS,
    REQUIRED_TABLES,
    applied_migrations,
    initialization_script,
    initialize,
    load_demo_data,
    migrate,
    parse_args,
    table_names,
)


RUN_DATABASE_TESTS = os.getenv("AQUAFLEET_RUN_DB_TESTS") == "1"


class UnknownUserCursor:
    with_rows = True

    def execute(self, query, params):
        self.params = params

    def fetchone(self):
        return None

    def close(self):
        pass


class UnknownUserConnection:
    def __init__(self):
        self.connected = True

    def cursor(self, dictionary=False):
        return UnknownUserCursor()

    def is_connected(self):
        return self.connected

    def close(self):
        self.connected = False


class DeploymentUnitTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)

    def tearDown(self):
        limiter.reset()

    def test_frontend_and_health_are_served_by_flask(self):
        client = app.test_client()
        root = client.get("/")
        try:
            self.assertEqual(200, root.status_code)
            self.assertIn(b"AquaFleet | Marine Operations Database", root.data)
            self.assertEqual("text/html", root.mimetype)
        finally:
            root.close()

        asset = client.get("/js/api.js")
        try:
            self.assertEqual(200, asset.status_code)
            self.assertIn(b"global.location.origin", asset.data)
        finally:
            asset.close()

        health = client.get("/api/health")
        try:
            self.assertEqual(200, health.status_code)
            self.assertTrue(health.get_json()["success"])
        finally:
            health.close()

    def test_initialization_sql_contains_no_destructive_statements(self):
        source = initialization_script().upper()
        self.assertIn("CREATE TABLE RESEARCH_VESSEL", source)
        self.assertNotIn("DROP TABLE", source)
        self.assertNotIn("TRUNCATE TABLE", source)
        self.assertNotIn("CREATE DATABASE", source)
        self.assertNotIn("USE AQUAFLEET_DB", source)

    def test_mission_constraint_migration_is_guarded_and_non_destructive(self):
        version, path = MIGRATIONS[-1]
        source = path.read_text(encoding="utf-8").upper()
        self.assertEqual("003_mission_status_end_constraint", version)
        self.assertIn("INFORMATION_SCHEMA.TABLE_CONSTRAINTS", source)
        self.assertIn("EXISTING MISSIONS VIOLATE THE RULE", source)
        self.assertIn("ADD CONSTRAINT CHK_MISSION_STATUS_END", source)
        self.assertNotIn("DROP TABLE", source)
        self.assertNotIn("TRUNCATE TABLE", source)
        self.assertNotIn("DELETE FROM", source)

    def test_destructive_commands_require_explicit_confirmation(self):
        with redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit):
                parse_args(["initialize"])
            with self.assertRaises(SystemExit):
                parse_args(["load-demo-data"])

    def test_login_is_rate_limited_with_json_response(self):
        limiter.reset()
        client = app.test_client()
        payload = {"username": "not-a-user", "password": "not-a-password"}
        with patch(
            "routes.auth.get_db_connection",
            side_effect=lambda: UnknownUserConnection(),
        ):
            responses = [
                client.post(
                    "/api/auth/login",
                    json=payload,
                    environ_base={"REMOTE_ADDR": "192.0.2.40"},
                )
                for _ in range(11)
            ]
        self.assertTrue(all(response.status_code == 401 for response in responses[:10]))
        self.assertEqual(429, responses[-1].status_code)
        self.assertEqual("LOGIN_RATE_LIMITED", responses[-1].get_json()["error_code"])

    def test_sessions_are_permanent_with_absolute_expiration(self):
        self.assertFalse(app.config["SESSION_REFRESH_EACH_REQUEST"])
        with app.test_request_context("/"):
            from flask import session

            start_session({
                "user_id": 1,
                "username": "deployment-test",
                "full_name": "Deployment Test",
                "role": "VIEWER",
            })
            self.assertTrue(session.permanent)


@unittest.skipUnless(RUN_DATABASE_TESTS, "set AQUAFLEET_RUN_DB_TESTS=1")
class DeploymentDatabaseTests(unittest.TestCase):
    DB_NAME = "aquafleet_deployment_test"

    @classmethod
    def setUpClass(cls):
        params = Config.db_params()
        params.pop("database", None)
        cls.server_connection = mysql.connector.connect(**params)
        cursor = cls.server_connection.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
        cursor.execute(
            f"CREATE DATABASE `{cls.DB_NAME}` CHARACTER SET utf8mb4 "
            "COLLATE utf8mb4_unicode_ci"
        )
        cursor.close()
        database_params = Config.db_params()
        database_params["database"] = cls.DB_NAME
        cls.connection = mysql.connector.connect(**database_params)
        try:
            initialize(cls.connection)
            cls.empty_counts = cls.table_counts_for_connection(cls.connection)
        except Exception:
            cls.connection.close()
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
            cls.server_connection.close()
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            if cls.connection.is_connected():
                cls.connection.close()
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
        finally:
            cls.server_connection.close()

    @staticmethod
    def table_counts_for_connection(connection):
        cursor = connection.cursor()
        try:
            counts = {}
            for name in table_names(connection):
                if name == "schema_migration":
                    continue
                cursor.execute(f"SELECT COUNT(*) FROM `{name}`")
                counts[name] = cursor.fetchone()[0]
            return counts
        finally:
            cursor.close()

    def table_counts(self):
        return self.table_counts_for_connection(self.connection)

    def test_initialize_creates_complete_empty_versioned_schema(self):
        names = table_names(self.connection)
        self.assertTrue(REQUIRED_TABLES.issubset(names))
        self.assertIn("schema_migration", names)
        self.assertTrue(all(count == 0 for count in self.empty_counts.values()))
        self.assertEqual(
            {version for version, _ in MIGRATIONS},
            set(applied_migrations(self.connection)),
        )

    def test_initialize_refuses_a_nonempty_database(self):
        with self.assertRaisesRegex(RuntimeError, "not empty"):
            initialize(self.connection)

    def test_migrations_are_ordered_and_repeatable(self):
        before = self.table_counts()
        migrate(self.connection)
        migrate(self.connection)
        self.assertEqual(before, self.table_counts())

    def test_demo_reset_is_repeatable_and_keeps_accounts_separate(self):
        load_demo_data(self.connection)
        first = self.table_counts()
        load_demo_data(self.connection)
        second = self.table_counts()
        self.assertEqual(first, second)
        self.assertGreater(first["research_vessel"], 0)
        self.assertGreater(first["notification"], 0)
        self.assertEqual(0, first["app_user"])


if __name__ == "__main__":
    unittest.main()
