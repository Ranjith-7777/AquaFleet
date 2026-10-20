"""Guarded AquaFleet database initialization and ordered migrations.

Nothing in this module runs when Flask or Gunicorn starts. Every operation is
an explicit command. Initialization refuses a database containing any table,
and demo data requires a separate destructive confirmation flag.
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

import mysql.connector
from mysql.connector import Error as MySQLError

from config import Config


PROJECT_DIR = Path(__file__).resolve().parent.parent
SCHEMA_PATH = PROJECT_DIR / "database" / "schema.sql"
SAMPLE_DATA_PATH = PROJECT_DIR / "database" / "sample_data.sql"
MIGRATIONS = (
    (
        "001_phase3_existing_database_upgrade",
        PROJECT_DIR / "database" / "migrations" /
        "phase3_upgrade_existing_database.sql",
    ),
    (
        "002_phase4_notifications_and_integrity",
        PROJECT_DIR / "database" / "migrations" /
        "phase4_notifications_and_integrity.sql",
    ),
)
MIGRATION_TABLE = "schema_migration"
INITIAL_SCHEMA_MARKER = "CREATE TABLE research_vessel"
FORBIDDEN_INITIAL_SCHEMA_SQL = re.compile(
    r"\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|CREATE\s+DATABASE|USE\s+)\b",
    re.IGNORECASE,
)
REQUIRED_TABLES = {
    "research_vessel", "marine_zone", "auv_rov", "operator", "sensor",
    "battery_pack", "offshore_asset", "expedition", "mission",
    "operator_contact", "mission_vehicle", "mission_operator",
    "vehicle_sensor", "vehicle_battery", "maintenance_record",
    "telemetry_point", "sample", "sample_aliquot", "incident",
    "inspection_task", "app_user", "notification",
}


def execute_sql_script(connection, script):
    """Execute a MySQL client-style script, including DELIMITER directives."""
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
            raise ValueError("SQL script ended with an unterminated statement")
    finally:
        cursor.close()


def without_database_selection(script):
    """Remove the legacy hard-coded USE statement from a script."""
    return re.sub(
        r"(?im)^\s*USE\s+aquafleet_db\s*;\s*$",
        "",
        script,
    )


def initialization_script():
    """Return only schema creation SQL, never the development drop section."""
    source = SCHEMA_PATH.read_text(encoding="utf-8")
    marker_at = source.find(INITIAL_SCHEMA_MARKER)
    if marker_at < 0:
        raise ValueError("Could not locate the non-destructive schema section")
    script = source[marker_at:]
    forbidden = FORBIDDEN_INITIAL_SCHEMA_SQL.search(script)
    if forbidden:
        raise ValueError(
            "Refusing initialization because destructive SQL was found in "
            f"the extracted schema: {forbidden.group(0)}"
        )
    return script


def script_checksum(script):
    return hashlib.sha256(script.encode("utf-8")).hexdigest()


def table_names(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=DATABASE() AND table_type='BASE TABLE'"
        )
        return {row[0] for row in cursor.fetchall()}
    finally:
        cursor.close()


def ensure_migration_table(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS schema_migration ("
            "version VARCHAR(100) NOT NULL PRIMARY KEY,"
            "checksum CHAR(64) NOT NULL,"
            "applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 "
            "COLLATE=utf8mb4_unicode_ci"
        )
    finally:
        cursor.close()


def applied_migrations(connection):
    if MIGRATION_TABLE not in table_names(connection):
        return {}
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT version, checksum FROM schema_migration ORDER BY version"
        )
        return dict(cursor.fetchall())
    finally:
        cursor.close()


def record_migration(connection, version, checksum):
    cursor = connection.cursor()
    try:
        cursor.execute(
            "INSERT INTO schema_migration(version, checksum) VALUES(%s, %s)",
            (version, checksum),
        )
        connection.commit()
    finally:
        cursor.close()


def migration_source(path):
    return without_database_selection(path.read_text(encoding="utf-8"))


def validate_required_tables(connection):
    missing = REQUIRED_TABLES - table_names(connection)
    if missing:
        raise RuntimeError(
            "Database schema is incomplete; missing table(s): "
            + ", ".join(sorted(missing))
        )


def acquire_lock(connection):
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT GET_LOCK(%s, 10)", ("aquafleet_schema_change",))
        if cursor.fetchone()[0] != 1:
            raise RuntimeError("Could not acquire the database migration lock")
    finally:
        cursor.close()


def release_lock(connection):
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT RELEASE_LOCK(%s)", ("aquafleet_schema_change",))
        cursor.fetchone()
    finally:
        cursor.close()


def initialize(connection):
    acquire_lock(connection)
    try:
        # Check after taking the lock so two simultaneous initialization
        # commands cannot both observe an empty database and start creating.
        existing = table_names(connection)
        if existing:
            raise RuntimeError(
                "Refusing initialization: the selected database is not empty "
                f"({len(existing)} table(s) found)."
            )
        execute_sql_script(connection, initialization_script())
        validate_required_tables(connection)
        ensure_migration_table(connection)
        for version, path in MIGRATIONS:
            source = migration_source(path)
            record_migration(connection, version, script_checksum(source))
    finally:
        release_lock(connection)


def migrate(connection):
    existing = table_names(connection)
    if not existing:
        raise RuntimeError(
            "The selected database is empty. Run initialize with its explicit "
            "confirmation flag first."
        )
    core_tables = REQUIRED_TABLES - {"notification"}
    missing = core_tables - existing
    if missing:
        raise RuntimeError(
            "Refusing migration because this is not a complete AquaFleet "
            "database; missing table(s): " + ", ".join(sorted(missing))
        )

    acquire_lock(connection)
    try:
        ensure_migration_table(connection)
        applied = applied_migrations(connection)
        for version, path in MIGRATIONS:
            source = migration_source(path)
            checksum = script_checksum(source)
            if version in applied:
                if applied[version] != checksum:
                    raise RuntimeError(
                        f"Migration {version} has changed since it was applied"
                    )
                print(f"  current : {version}")
                continue
            execute_sql_script(connection, source)
            record_migration(connection, version, checksum)
            print(f"  applied : {version}")
        validate_required_tables(connection)
    finally:
        release_lock(connection)


def load_demo_data(connection):
    validate_required_tables(connection)
    acquire_lock(connection)
    try:
        source = without_database_selection(
            SAMPLE_DATA_PATH.read_text(encoding="utf-8")
        )
        execute_sql_script(connection, source)
        connection.commit()
    finally:
        release_lock(connection)


def show_status(connection):
    tables = table_names(connection)
    applied = applied_migrations(connection)
    print(f"Database: {Config.DB_NAME}")
    print(f"Tables: {len(tables)}")
    print(f"Complete schema: {REQUIRED_TABLES.issubset(tables)}")
    if applied:
        for version in sorted(applied):
            print(f"  migration: {version}")
    else:
        print("Migration tracking: not initialized")


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status", help="inspect schema and migration status")
    init_parser = subparsers.add_parser(
        "initialize", help="create the schema only in an empty database"
    )
    init_parser.add_argument(
        "--confirm-empty-database", action="store_true", required=True
    )
    subparsers.add_parser("migrate", help="apply pending ordered migrations")
    demo_parser = subparsers.add_parser(
        "load-demo-data", help="reset and load non-sensitive faculty demo rows"
    )
    demo_parser.add_argument(
        "--confirm-reset-demo-data", action="store_true", required=True
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    connection = None
    try:
        connection = mysql.connector.connect(**Config.db_params())
        if args.command == "status":
            show_status(connection)
        elif args.command == "initialize":
            initialize(connection)
            print("AquaFleet schema initialized; no demo data or users were loaded.")
        elif args.command == "migrate":
            migrate(connection)
            print("AquaFleet migrations are current.")
        elif args.command == "load-demo-data":
            load_demo_data(connection)
            print("Faculty demo domain data loaded. User accounts were not changed.")
        return 0
    except (MySQLError, OSError, RuntimeError, ValueError) as error:
        print(f"Database command failed: {error}", file=sys.stderr)
        return 1
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


if __name__ == "__main__":
    sys.exit(main())
