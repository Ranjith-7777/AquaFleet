"""Non-destructive, repeatable migration tests for an existing AquaFleet DB."""

import os
import sys
import unittest
from pathlib import Path

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import Config  # noqa: E402
from tests.test_phase2_database import execute_sql_script  # noqa: E402


RUN_DATABASE_TESTS = os.getenv("AQUAFLEET_RUN_DB_TESTS") == "1"


@unittest.skipUnless(RUN_DATABASE_TESTS, "set AQUAFLEET_RUN_DB_TESTS=1")
class Phase3MigrationTests(unittest.TestCase):
    DB_NAME = "aquafleet_phase3_migration_test"
    VIEWS = {
        "vw_expedition_summary", "vw_mission_operations",
        "vw_vehicle_readiness", "vw_sample_lineage",
        "vw_incident_overview",
    }
    TRIGGERS = {
        "trg_mission_validate_bi", "trg_mission_validate_bu",
        "trg_mission_vehicle_ready_bi", "trg_mission_vehicle_ready_bu",
    }
    PROCEDURES = {
        "sp_get_expedition_report", "sp_get_vehicle_maintenance_history",
        "sp_get_mission_summary", "sp_get_expedition_metrics",
    }
    INDEXES = {
        "idx_expedition_status", "idx_mission_status",
        "idx_incident_severity_time",
    }

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
            cls._downgrade_to_pre_phase2()
        except Exception:
            cursor = cls.server_connection.cursor()
            cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
            cursor.close()
            cls.server_connection.close()
            raise

    @classmethod
    def _downgrade_to_pre_phase2(cls):
        cursor = cls.server_connection.cursor()
        cursor.execute(f"USE `{cls.DB_NAME}`")
        for name in cls.PROCEDURES:
            cursor.execute(f"DROP PROCEDURE IF EXISTS `{name}`")
        for name in cls.TRIGGERS:
            cursor.execute(f"DROP TRIGGER IF EXISTS `{name}`")
        for name in cls.VIEWS:
            cursor.execute(f"DROP VIEW IF EXISTS `{name}`")
        cursor.execute("ALTER TABLE expedition DROP INDEX idx_expedition_status")
        cursor.execute("ALTER TABLE mission DROP INDEX idx_mission_status")
        cursor.execute(
            "ALTER TABLE incident DROP INDEX idx_incident_severity_time"
        )
        cursor.execute("ALTER TABLE app_user DROP CHECK chk_app_user_role")
        cursor.execute(
            "ALTER TABLE app_user ADD CONSTRAINT chk_app_user_role "
            "CHECK (role IN ('ADMIN','OPERATOR','RESEARCHER'))"
        )
        cursor.executemany(
            "INSERT INTO app_user(username,password_hash,full_name,role,is_active) "
            "VALUES(%s,%s,%s,%s,TRUE)",
            [
                ("migration_admin", "preserved-admin-hash", "Migration Admin", "ADMIN"),
                (
                    "migration_researcher", "preserved-researcher-hash",
                    "Migration Researcher", "RESEARCHER",
                ),
            ],
        )
        cls.server_connection.commit()
        cursor.close()

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

    def object_names(self, connection, object_type):
        cursor = connection.cursor()
        queries = {
            "views": (
                "SELECT table_name FROM information_schema.views "
                "WHERE table_schema=%s"
            ),
            "triggers": (
                "SELECT trigger_name FROM information_schema.triggers "
                "WHERE trigger_schema=%s"
            ),
            "procedures": (
                "SELECT routine_name FROM information_schema.routines "
                "WHERE routine_schema=%s AND routine_type='PROCEDURE'"
            ),
            "indexes": (
                "SELECT DISTINCT index_name FROM information_schema.statistics "
                "WHERE table_schema=%s"
            ),
        }
        cursor.execute(queries[object_type], (self.DB_NAME,))
        names = {row[0] for row in cursor.fetchall()}
        cursor.close()
        return names

    def table_counts(self, connection):
        cursor = connection.cursor()
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=%s AND table_type='BASE TABLE'",
            (self.DB_NAME,),
        )
        names = [row[0] for row in cursor.fetchall()]
        counts = {}
        for name in names:
            cursor.execute(f"SELECT COUNT(*) FROM `{name}`")
            counts[name] = cursor.fetchone()[0]
        cursor.close()
        return counts

    def test_migration_preserves_data_and_is_repeatable(self):
        connection = self.connect()
        before_counts = self.table_counts(connection)
        before_tables = set(before_counts)
        self.assertTrue(self.VIEWS.isdisjoint(self.object_names(connection, "views")))
        self.assertTrue(
            self.TRIGGERS.isdisjoint(self.object_names(connection, "triggers"))
        )
        self.assertTrue(
            self.PROCEDURES.isdisjoint(self.object_names(connection, "procedures"))
        )
        self.assertTrue(
            self.INDEXES.isdisjoint(self.object_names(connection, "indexes"))
        )
        cursor = connection.cursor()
        with self.assertRaises(mysql.connector.Error):
            cursor.execute(
                "INSERT INTO app_user(username,password_hash,full_name,role,is_active) "
                "VALUES('pre_upgrade_viewer','hash','Pre-upgrade Viewer','VIEWER',TRUE)"
            )
        connection.rollback()
        cursor.close()

        migration = (
            PROJECT_DIR / "database" / "migrations" /
            "phase3_upgrade_existing_database.sql"
        ).read_text(encoding="utf-8").replace("aquafleet_db", self.DB_NAME)
        execute_sql_script(connection, migration)
        execute_sql_script(connection, migration)

        after_counts = self.table_counts(connection)
        self.assertEqual(before_tables, set(after_counts))
        for table_name, row_count in before_counts.items():
            self.assertEqual(row_count, after_counts[table_name], table_name)
        self.assertEqual(self.VIEWS, self.object_names(connection, "views"))
        self.assertEqual(self.TRIGGERS, self.object_names(connection, "triggers"))
        self.assertEqual(self.PROCEDURES, self.object_names(connection, "procedures"))
        self.assertTrue(
            self.INDEXES.issubset(self.object_names(connection, "indexes"))
        )

        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT username,password_hash,role FROM app_user "
            "WHERE username IN ('migration_admin','migration_researcher') "
            "ORDER BY username"
        )
        self.assertEqual(
            [
                {
                    "username": "migration_admin",
                    "password_hash": "preserved-admin-hash",
                    "role": "ADMIN",
                },
                {
                    "username": "migration_researcher",
                    "password_hash": "preserved-researcher-hash",
                    "role": "RESEARCHER",
                },
            ],
            cursor.fetchall(),
        )
        cursor.execute(
            "INSERT INTO app_user(username,password_hash,full_name,role,is_active) "
            "VALUES(%s,%s,%s,'VIEWER',TRUE)",
            ("post_upgrade_viewer", "viewer-hash", "Post-upgrade Viewer"),
        )
        connection.commit()
        cursor.execute(
            "SELECT role FROM app_user WHERE username='post_upgrade_viewer'"
        )
        self.assertEqual("VIEWER", cursor.fetchone()["role"])
        cursor.close()
        connection.close()


if __name__ == "__main__":
    unittest.main()
