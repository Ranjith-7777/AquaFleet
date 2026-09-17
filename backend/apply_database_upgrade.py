"""Apply AquaFleet's non-destructive existing-database upgrade.

Create and verify a backup before running this utility. Credentials are loaded
through Config and are never printed. The process exits nonzero if table row
counts, user records, or expected Phase 2 objects do not verify afterward.
"""

import sys
from pathlib import Path

import mysql.connector
from mysql.connector import Error as MySQLError

from config import Config


PROJECT_DIR = Path(__file__).resolve().parent.parent
MIGRATION_PATH = (
    PROJECT_DIR / "database" / "migrations" /
    "phase3_upgrade_existing_database.sql"
)


def execute_sql_script(connection, script):
    """Execute a mysql-client script, including DELIMITER directives."""
    delimiter = ";"
    lines = []
    cursor = connection.cursor()
    try:
        for line in script.splitlines():
            stripped = line.strip()
            if stripped.upper().startswith("DELIMITER "):
                delimiter = stripped.split(maxsplit=1)[1]
                continue
            lines.append(line)
            if not stripped.endswith(delimiter):
                continue
            lines[-1] = line[:line.rfind(delimiter)]
            statement = "\n".join(lines).strip()
            lines = []
            if not statement:
                continue
            cursor.execute(statement)
            if cursor.with_rows:
                cursor.fetchall()
            while cursor.nextset():
                if cursor.with_rows:
                    cursor.fetchall()
        remaining = [
            line for line in lines
            if line.strip() and not line.lstrip().startswith("--")
        ]
        if remaining:
            raise ValueError("Migration ended with an unterminated statement")
    finally:
        cursor.close()


def table_counts(cursor):
    cursor.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema=DATABASE() AND table_type='BASE TABLE'"
    )
    names = [row[0] for row in cursor.fetchall()]
    counts = {}
    for name in names:
        cursor.execute("SELECT COUNT(*) FROM `{}`".format(name))
        counts[name] = cursor.fetchone()[0]
    return counts


def users(cursor):
    cursor.execute(
        "SELECT user_id,username,password_hash,full_name,role,is_active,created_at "
        "FROM app_user ORDER BY user_id"
    )
    return cursor.fetchall()


def object_count(cursor, sql):
    cursor.execute(sql)
    return cursor.fetchone()[0]


def main():
    if Config.DB_NAME != "aquafleet_db":
        print("Refusing upgrade: DB_NAME must be aquafleet_db.")
        return 1

    connection = cursor = None
    try:
        connection = mysql.connector.connect(**Config.db_params())
        cursor = connection.cursor()
        before_counts = table_counts(cursor)
        before_users = users(cursor)

        execute_sql_script(
            connection, MIGRATION_PATH.read_text(encoding="utf-8")
        )
        connection.commit()

        after_counts = table_counts(cursor)
        after_users = users(cursor)
        views = object_count(
            cursor,
            "SELECT COUNT(*) FROM information_schema.views "
            "WHERE table_schema=DATABASE() AND table_name LIKE 'vw\\_%'",
        )
        triggers = object_count(
            cursor,
            "SELECT COUNT(*) FROM information_schema.triggers "
            "WHERE trigger_schema=DATABASE() AND trigger_name LIKE 'trg\\_%'",
        )
        procedures = object_count(
            cursor,
            "SELECT COUNT(*) FROM information_schema.routines "
            "WHERE routine_schema=DATABASE() AND routine_type='PROCEDURE' "
            "AND routine_name LIKE 'sp\\_get\\_%'",
        )
        indexes = object_count(
            cursor,
            "SELECT COUNT(DISTINCT index_name) "
            "FROM information_schema.statistics WHERE table_schema=DATABASE() "
            "AND index_name IN ('idx_expedition_status','idx_mission_status',"
            "'idx_incident_severity_time')",
        )
        valid = (
            before_counts == after_counts
            and before_users == after_users
            and views == 5
            and triggers == 4
            and procedures == 4
            and indexes == 3
        )
        print(f"Table counts preserved: {before_counts == after_counts}")
        print(f"User records preserved: {before_users == after_users}")
        print(f"Tables: {len(after_counts)}")
        print(f"Views: {views}")
        print(f"Triggers: {triggers}")
        print(f"Procedures: {procedures}")
        print(f"Reporting indexes: {indexes}")
        return 0 if valid else 1
    except (MySQLError, OSError, ValueError) as error:
        print(f"Database upgrade failed: {error}")
        return 1
    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


if __name__ == "__main__":
    sys.exit(main())
