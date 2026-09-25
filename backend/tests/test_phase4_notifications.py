"""Phase 4 tests: notification triggers, parent-side integrity triggers, the
repeatable migration, and the notifications RBAC policy."""

import os
import sys
import unittest
from pathlib import Path

import mysql.connector

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from authentication import is_authorized  # noqa: E402
from config import Config  # noqa: E402
from tests.test_phase2_database import execute_sql_script  # noqa: E402

RUN_DATABASE_TESTS = os.getenv("AQUAFLEET_RUN_DB_TESTS") == "1"
SIGNAL_ERRNO = 1644
NEW_TRIGGERS = {
    "trg_expedition_dates_bu", "trg_zone_depth_bu",
    "trg_incident_notify_ai", "trg_incident_notify_au",
    "trg_battery_notify_ai", "trg_battery_notify_au",
    "trg_maintenance_notify_ai", "trg_maintenance_notify_au",
}

class NotificationPolicyTests(unittest.TestCase):
    def test_everyone_reads_only_field_roles_mark_read(self):
        for role in ("ADMIN", "RESEARCHER", "OPERATOR", "VIEWER"):
            self.assertTrue(is_authorized(role, "notifications", "GET"))
        for role in ("ADMIN", "RESEARCHER", "OPERATOR"):
            self.assertTrue(is_authorized(role, "notifications", "PATCH"))
        self.assertFalse(is_authorized("VIEWER", "notifications", "PATCH"))

    def test_no_role_can_create_or_delete_notifications(self):
        for role in ("ADMIN", "RESEARCHER", "OPERATOR", "VIEWER"):
            self.assertFalse(is_authorized(role, "notifications", "POST"))
            self.assertFalse(is_authorized(role, "notifications", "DELETE"))

@unittest.skipUnless(RUN_DATABASE_TESTS, "set AQUAFLEET_RUN_DB_TESTS=1")
class Phase4TriggerTests(unittest.TestCase):
    DB_NAME = "aquafleet_phase4_notifications_test"

    @classmethod
    def setUpClass(cls):
        params = Config.db_params()
        params.pop("database", None)
        cls.server_connection = mysql.connector.connect(**params)
        cursor = cls.server_connection.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{cls.DB_NAME}`")
        cursor.close()
        read = lambda name: (PROJECT_DIR / "database" / name).read_text(
            encoding="utf-8").replace("aquafleet_db", cls.DB_NAME)
        try:
            execute_sql_script(cls.server_connection, read("schema.sql"))
            execute_sql_script(cls.server_connection, read("sample_data.sql"))
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

    def setUp(self):
        params = Config.db_params()
        params["database"] = self.DB_NAME
        self.connection = mysql.connector.connect(**params)
        self.cursor = self.connection.cursor(dictionary=True)
        self.connection.rollback()
        # Loading sample_data.sql fires the triggers itself, so each test looks
        # only at notifications created after this point.
        self.baseline = self.one("SELECT COALESCE(MAX(notification_id), 0) AS m FROM notification")["m"]

    def tearDown(self):
        self.connection.rollback()
        self.cursor.close()
        self.connection.close()

    # -- helpers ------------------------------------------------------------
    def one(self, sql, params=()):
        self.cursor.execute(sql, params)
        return self.cursor.fetchone()

    def notifications(self):
        self.cursor.execute(
            "SELECT category, severity, title, message, source_table, is_read "
            "FROM notification WHERE notification_id > %s ORDER BY notification_id", (self.baseline,))
        return self.cursor.fetchall()

    def add_incident(self, severity):
        mission = self.one("SELECT mission_id FROM mission LIMIT 1")["mission_id"]
        self.cursor.execute(
            "INSERT INTO incident (mission_id, incident_type, severity, time_reported, description) "
            "VALUES (%s, 'Phase4 test', %s, '2026-01-01 00:00:00', 'x')", (mission, severity))
        return self.cursor.lastrowid

    def add_battery(self, health):
        self.cursor.execute(
            "INSERT INTO battery_pack (chemistry, capacity_wh, health_status, cycle_count) "
            "VALUES ('Phase4', 100, %s, 1)", (health,))
        return self.cursor.lastrowid

    def add_maintenance(self, due_sql):
        vehicle = self.one("SELECT vehicle_id FROM auv_rov LIMIT 1")["vehicle_id"]
        self.cursor.execute(
            "INSERT INTO maintenance_record (vehicle_id, maint_date, action_taken, cost, next_due_date) "
            f"VALUES (%s, '2026-01-01', 't', 1, {due_sql})", (vehicle,))

    # -- schema -------------------------------------------------------------
    def test_all_new_objects_exist(self):
        self.cursor.execute(
            "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema=%s",
            (self.DB_NAME,))
        self.assertTrue(NEW_TRIGGERS.issubset({r["TRIGGER_NAME"] for r in self.cursor}))

    def test_seed_data_conditions_were_notified_on_load(self):
        """Seed rows that already meet a rule were notified by the same triggers."""
        serious = self.one("SELECT COUNT(*) n FROM incident WHERE severity IN ('High', 'Critical')")["n"]
        notified = self.one("SELECT COUNT(*) n FROM notification WHERE source_table='incident'")["n"]
        self.assertGreater(serious, 0)
        self.assertEqual(serious, notified)

    # -- incidents ----------------------------------------------------------
    def test_low_and_moderate_incidents_do_not_notify(self):
        self.add_incident("Low"); self.add_incident("Moderate")
        self.assertEqual([], self.notifications())

    def test_high_is_warning_and_critical_is_critical(self):
        self.add_incident("High"); self.add_incident("Critical")
        rows = self.notifications()
        self.assertEqual(["Warning", "Critical"], [r["severity"] for r in rows])
        self.assertTrue(all(r["category"] == "Incident" and r["is_read"] == 0 for r in rows))

    def test_escalation_notifies_once(self):
        incident = self.add_incident("Low")
        self.cursor.execute("UPDATE incident SET severity='High' WHERE incident_id=%s", (incident,))
        self.assertEqual(1, len(self.notifications()))
        self.cursor.execute("UPDATE incident SET severity='Critical' WHERE incident_id=%s", (incident,))
        self.assertEqual(1, len(self.notifications()))

    # -- batteries ----------------------------------------------------------
    def test_battery_health_transitions(self):
        battery = self.add_battery("Good")
        self.assertEqual([], self.notifications())
        self.cursor.execute("UPDATE battery_pack SET health_status='Poor' WHERE battery_id=%s", (battery,))
        self.cursor.execute("UPDATE battery_pack SET health_status='Replace' WHERE battery_id=%s", (battery,))
        self.cursor.execute("UPDATE battery_pack SET cycle_count=cycle_count+1 WHERE battery_id=%s", (battery,))
        self.assertEqual(["Warning", "Critical"], [r["severity"] for r in self.notifications()])

    def test_new_replace_rated_pack_notifies(self):
        self.add_battery("Replace")
        self.assertEqual(["Critical"], [r["severity"] for r in self.notifications()])

    # -- maintenance --------------------------------------------------------
    def test_maintenance_due_windows(self):
        self.add_maintenance("'2030-01-01'")
        self.add_maintenance("NULL")
        self.assertEqual([], self.notifications())
        self.add_maintenance("DATE_ADD(CURDATE(), INTERVAL 5 DAY)")
        self.add_maintenance("'2026-02-01'")
        rows = self.notifications()
        self.assertEqual(["Maintenance due soon", "Maintenance overdue"], [r["title"] for r in rows])
        self.assertEqual(["Warning", "Critical"], [r["severity"] for r in rows])

    # -- atomicity ----------------------------------------------------------
    def test_rollback_removes_notification_with_its_cause(self):
        self.add_incident("Critical")
        self.assertEqual(1, len(self.notifications()))
        self.connection.rollback()
        self.assertEqual([], self.notifications())
        self.assertEqual(0, self.one("SELECT COUNT(*) n FROM incident WHERE incident_type='Phase4 test'")["n"])

    # -- parent-side integrity ---------------------------------------------
    def test_expedition_dates_cannot_exclude_existing_missions(self):
        row = self.one(
            "SELECT e.expedition_id FROM expedition e WHERE EXISTS ("
            "SELECT 1 FROM mission m WHERE m.expedition_id=e.expedition_id "
            "AND DATE(m.start_time) > e.start_date) LIMIT 1")
        with self.assertRaises(mysql.connector.Error) as failure:
            self.cursor.execute("UPDATE expedition SET end_date=start_date WHERE expedition_id=%s", (row["expedition_id"],))
        self.assertEqual(SIGNAL_ERRNO, failure.exception.errno)
        self.connection.rollback()
        # Widening, or editing an unrelated column, is still allowed.
        self.cursor.execute("UPDATE expedition SET end_date=DATE_ADD(end_date, INTERVAL 30 DAY) WHERE expedition_id=%s", (row["expedition_id"],))
        self.cursor.execute("UPDATE expedition SET title=title WHERE expedition_id=%s", (row["expedition_id"],))

    def test_zone_depth_band_cannot_exclude_existing_missions(self):
        row = self.one(
            "SELECT z.zone_id FROM marine_zone z WHERE EXISTS ("
            "SELECT 1 FROM mission m WHERE m.zone_id=z.zone_id AND m.depth_target > z.min_depth + 1) LIMIT 1")
        with self.assertRaises(mysql.connector.Error) as failure:
            self.cursor.execute("UPDATE marine_zone SET min_depth=max_depth-0.01 WHERE zone_id=%s", (row["zone_id"],))
        self.assertEqual(SIGNAL_ERRNO, failure.exception.errno)
        self.connection.rollback()
        self.cursor.execute("UPDATE marine_zone SET max_depth=max_depth+100 WHERE zone_id=%s", (row["zone_id"],))

    # -- migration ----------------------------------------------------------
    def test_migration_is_repeatable_and_preserves_data(self):
        migration = (PROJECT_DIR / "database" / "migrations" / "phase4_notifications_and_integrity.sql"
                     ).read_text(encoding="utf-8").replace("aquafleet_db", self.DB_NAME)
        tables = ("mission", "incident", "battery_pack", "maintenance_record", "expedition", "marine_zone")
        count = lambda: [self.one(f"SELECT COUNT(*) n FROM `{t}`")["n"] for t in tables]
        before = count()
        for _ in range(2):
            execute_sql_script(self.connection, migration)
            self.connection.commit()
            self.assertEqual(before, count())
        self.cursor.execute(
            "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema=%s",
            (self.DB_NAME,))
        names = {r["TRIGGER_NAME"] for r in self.cursor}
        self.assertTrue(NEW_TRIGGERS.issubset(names))
        self.assertEqual(12, len(names))

if __name__ == "__main__":
    unittest.main()
