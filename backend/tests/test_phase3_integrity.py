"""Adversarial integrity and transaction atomicity tests for AquaFleet."""

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
class Phase3IntegrityTests(unittest.TestCase):
    DB_NAME = "aquafleet_phase3_integrity_test"

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

    def count(self, cursor, table):
        cursor.execute("SELECT COUNT(*) FROM `{}`".format(table))
        return cursor.fetchone()[0]

    def assert_rejected_without_change(
        self, cursor, connection, table, sql, params, errno
    ):
        before = self.count(cursor, table)
        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(sql, params)
        self.assertEqual(errno, failure.exception.errno)
        connection.rollback()
        self.assertEqual(before, self.count(cursor, table))

    def test_mission_depth_trigger_rejects_without_partial_row(self):
        connection = self.connect()
        cursor = connection.cursor()
        self.assert_rejected_without_change(
            cursor, connection, "mission",
            "INSERT INTO mission(expedition_id,zone_id,mission_type,start_time,"
            "end_time,depth_target,status) "
            "VALUES(4,2,'P3 invalid depth','2026-09-20 08:00:00',NULL,999,'Planned')",
            (), 1644,
        )
        cursor.close()
        connection.close()

    def test_mission_date_trigger_rejects_without_partial_row(self):
        connection = self.connect()
        cursor = connection.cursor()
        self.assert_rejected_without_change(
            cursor, connection, "mission",
            "INSERT INTO mission(expedition_id,zone_id,mission_type,start_time,"
            "end_time,depth_target,status) "
            "VALUES(4,2,'P3 invalid date','2030-01-01 08:00:00',NULL,100,'Planned')",
            (), 1644,
        )
        cursor.close()
        connection.close()

    def test_retired_vehicle_trigger_rejects_assignment(self):
        connection = self.connect()
        cursor = connection.cursor()
        self.assert_rejected_without_change(
            cursor, connection, "mission_vehicle",
            "INSERT INTO mission_vehicle(mission_id,vehicle_id,launch_time,"
            "recovery_time) VALUES(7,5,'2026-09-18 07:10:00',NULL)",
            (), 1644,
        )
        cursor.close()
        connection.close()

    def test_check_constraint_rejects_invalid_value(self):
        connection = self.connect()
        cursor = connection.cursor()
        self.assert_rejected_without_change(
            cursor, connection, "research_vessel",
            "INSERT INTO research_vessel(vessel_name,vessel_type,capacity,home_port) "
            "VALUES('P3 invalid capacity','Research',0,'Kochi')",
            (), 3819,
        )
        cursor.close()
        connection.close()

    def test_unique_constraint_rejects_duplicate(self):
        connection = self.connect()
        cursor = connection.cursor()
        cursor.execute("SELECT vessel_name FROM research_vessel WHERE vessel_id=1")
        name = cursor.fetchone()[0]
        self.assert_rejected_without_change(
            cursor, connection, "research_vessel",
            "INSERT INTO research_vessel(vessel_name,vessel_type,capacity,home_port) "
            "VALUES(%s,'Research',10,'Kochi')",
            (name,), 1062,
        )
        cursor.execute("SELECT vessel_name FROM research_vessel WHERE vessel_id=1")
        self.assertEqual(name, cursor.fetchone()[0])
        cursor.close()
        connection.close()

    def test_foreign_key_violation_rejects_orphan(self):
        connection = self.connect()
        cursor = connection.cursor()
        self.assert_rejected_without_change(
            cursor, connection, "mission_operator",
            "INSERT INTO mission_operator(mission_id,operator_id,duty_role,shift) "
            "VALUES(2147483647,1,'Invalid','Day')",
            (), 1452,
        )
        cursor.close()
        connection.close()

    def test_restricted_delete_preserves_parent_and_children(self):
        connection = self.connect()
        cursor = connection.cursor()
        vessel_before = self.count(cursor, "research_vessel")
        expedition_before = self.count(cursor, "expedition")
        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute("DELETE FROM research_vessel WHERE vessel_id=1")
        self.assertEqual(1451, failure.exception.errno)
        connection.rollback()
        self.assertEqual(vessel_before, self.count(cursor, "research_vessel"))
        self.assertEqual(expedition_before, self.count(cursor, "expedition"))
        cursor.close()
        connection.close()

    def test_junction_primary_key_rejects_duplicate(self):
        connection = self.connect()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT mission_id,operator_id FROM mission_operator LIMIT 1"
        )
        mission_id, operator_id = cursor.fetchone()
        self.assert_rejected_without_change(
            cursor, connection, "mission_operator",
            "INSERT INTO mission_operator(mission_id,operator_id,duty_role,shift) "
            "VALUES(%s,%s,'Duplicate','Day')",
            (mission_id, operator_id), 1062,
        )
        cursor.close()
        connection.close()

    def test_mission_end_before_start_check_rejects_row(self):
        connection = self.connect()
        cursor = connection.cursor()
        self.assert_rejected_without_change(
            cursor, connection, "mission",
            "INSERT INTO mission(expedition_id,zone_id,mission_type,start_time,"
            "end_time,depth_target,status) VALUES(4,2,'P3 invalid ordering',"
            "'2026-09-20 10:00:00','2026-09-20 09:00:00',100,'Completed')",
            (), 3819,
        )
        cursor.close()
        connection.close()

    def test_mission_resource_failure_rolls_back_every_row_then_commit_works(self):
        connection = self.connect()
        cursor = connection.cursor()
        mission_type = "P3 ATOMIC MISSION"
        connection.start_transaction()
        cursor.execute(
            "INSERT INTO mission(expedition_id,zone_id,mission_type,start_time,"
            "end_time,depth_target,status) "
            "VALUES(4,2,%s,'2026-09-20 08:00:00',NULL,100,'Planned')",
            (mission_type,),
        )
        failed_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO mission_vehicle(mission_id,vehicle_id,launch_time,"
            "recovery_time) VALUES(%s,1,'2026-09-20 08:10:00',NULL)",
            (failed_id,),
        )
        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(
                "INSERT INTO mission_operator"
                "(mission_id,operator_id,duty_role,shift) "
                "VALUES(%s,2147483647,'Pilot','Day')",
                (failed_id,),
            )
        self.assertEqual(1452, failure.exception.errno)
        connection.rollback()
        cursor.execute("SELECT COUNT(*) FROM mission WHERE mission_type=%s", (mission_type,))
        self.assertEqual(0, cursor.fetchone()[0])
        cursor.execute("SELECT COUNT(*) FROM mission_vehicle WHERE mission_id=%s", (failed_id,))
        self.assertEqual(0, cursor.fetchone()[0])
        connection.commit()

        connection.start_transaction()
        cursor.execute(
            "INSERT INTO mission(expedition_id,zone_id,mission_type,start_time,"
            "end_time,depth_target,status) "
            "VALUES(4,2,%s,'2026-09-20 08:00:00',NULL,100,'Planned')",
            (mission_type,),
        )
        mission_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO mission_vehicle(mission_id,vehicle_id,launch_time,"
            "recovery_time) VALUES(%s,1,'2026-09-20 08:10:00',NULL)",
            (mission_id,),
        )
        cursor.execute(
            "INSERT INTO mission_operator(mission_id,operator_id,duty_role,shift) "
            "VALUES(%s,1,'Pilot','Day')", (mission_id,),
        )
        connection.commit()
        cursor.execute("SELECT COUNT(*) FROM mission WHERE mission_id=%s", (mission_id,))
        self.assertEqual(1, cursor.fetchone()[0])
        cursor.execute("SELECT COUNT(*) FROM mission_vehicle WHERE mission_id=%s", (mission_id,))
        self.assertEqual(1, cursor.fetchone()[0])
        cursor.execute("SELECT COUNT(*) FROM mission_operator WHERE mission_id=%s", (mission_id,))
        self.assertEqual(1, cursor.fetchone()[0])
        cursor.execute("DELETE FROM mission WHERE mission_id=%s", (mission_id,))
        connection.commit()
        cursor.close()
        connection.close()

    def test_sample_savepoint_recovers_from_invalid_aliquot(self):
        connection = self.connect()
        cursor = connection.cursor()
        connection.start_transaction()
        cursor.execute(
            "INSERT INTO sample(mission_id,sample_type,collected_at,"
            "preservation_method,chain_of_custody_status) "
            "VALUES(5,'P3 SAVEPOINT SAMPLE','2026-08-03 06:00:00',"
            "'Chilled','Collected')"
        )
        sample_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO sample_aliquot(sample_id,aliquot_no,volume_ml,storage_temp) "
            "VALUES(%s,1,50,4)", (sample_id,),
        )
        cursor.execute("SAVEPOINT keep_valid_aliquot")
        with self.assertRaises(mysql.connector.Error) as failure:
            cursor.execute(
                "INSERT INTO sample_aliquot"
                "(sample_id,aliquot_no,volume_ml,storage_temp) "
                "VALUES(%s,2,0,4)", (sample_id,),
            )
        self.assertEqual(3819, failure.exception.errno)
        cursor.execute("ROLLBACK TO SAVEPOINT keep_valid_aliquot")
        cursor.execute(
            "INSERT INTO sample_aliquot(sample_id,aliquot_no,volume_ml,storage_temp) "
            "VALUES(%s,2,25,4)", (sample_id,),
        )
        connection.commit()
        cursor.execute("SELECT COUNT(*) FROM sample WHERE sample_id=%s", (sample_id,))
        self.assertEqual(1, cursor.fetchone()[0])
        cursor.execute("SELECT COUNT(*) FROM sample_aliquot WHERE sample_id=%s", (sample_id,))
        self.assertEqual(2, cursor.fetchone()[0])
        cursor.execute(
            "SELECT aliquot_no,volume_ml FROM sample_aliquot "
            "WHERE sample_id=%s ORDER BY aliquot_no", (sample_id,),
        )
        self.assertEqual([(1, 50), (2, 25)], [
            (number, int(volume)) for number, volume in cursor.fetchall()
        ])
        cursor.execute("DELETE FROM sample WHERE sample_id=%s", (sample_id,))
        connection.commit()
        cursor.close()
        connection.close()


if __name__ == "__main__":
    unittest.main()
