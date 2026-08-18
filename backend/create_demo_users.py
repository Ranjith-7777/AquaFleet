"""
create_demo_users.py
--------------------
LOCAL ACADEMIC DEMONSTRATION SETUP - run by hand, never by the application.

Creates the two AquaFleet demonstration login accounts in the `app_user`
table. Flask does NOT import or execute this file; it exists so a marker or a
teammate can bring up a working login on a fresh database with one command:

    python create_demo_users.py

The script is idempotent. Running it repeatedly is safe: an account is created
only when its username is not already present, and an existing account is left
exactly as it is - its password is never reset and its is_active flag is never
flipped. Nothing is deleted.

WHY THE PASSWORDS LIVE HERE AND NOWHERE ELSE
--------------------------------------------
These plaintext values are deliberately confined to this one setup file. They
are not in schema.sql, not in sample_data.sql and not in any frontend file, so
neither the database dump nor the shipped browser code ever contains a
password. What reaches the database is a werkzeug hash (scrypt by default),
which is one-way: the stored value cannot be turned back into the password.

These are throwaway credentials for a local coursework deployment. Change them
before running this anywhere that is reachable by anyone else.
"""

import sys

from mysql.connector import Error as MySQLError
from werkzeug.security import generate_password_hash

from database import get_db_connection

# Demonstration accounts. Local coursework use only - see the module docstring.
DEMO_USERS = (
    {
        "username": "admin",
        "password": "AquaAdmin@2026",
        "full_name": "AquaFleet Administrator",
        "role": "ADMIN",
    },
    {
        "username": "researcher",
        "password": "AquaResearch@2026",
        "full_name": "Marine Researcher",
        "role": "RESEARCHER",
    },
)


def username_exists(cursor, username):
    """Return True when an account with this username is already stored."""
    cursor.execute(
        "SELECT 1 AS present FROM app_user WHERE username = %s",
        (username,)
    )
    return cursor.fetchone() is not None


def insert_user(cursor, user):
    """Insert one account, hashing the password on the way in.

    The plaintext password never reaches the database and the resulting hash
    is never printed - only the username and role are echoed.
    """
    cursor.execute(
        """
        INSERT INTO app_user (username, password_hash, full_name, role, is_active)
        VALUES (%s, %s, %s, %s, TRUE)
        """,
        (
            user["username"],
            generate_password_hash(user["password"]),
            user["full_name"],
            user["role"],
        )
    )


def main():
    """Create any missing demonstration account. Returns a process exit code."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        # Fail early and clearly if the schema has not been applied yet.
        cursor.execute(
            """
            SELECT COUNT(*) AS present
              FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user'
            """
        )
        if cursor.fetchone()["present"] == 0:
            connection.rollback()
            print("app_user table not found. Run database/schema.sql first.")
            return 1

        created = 0
        for user in DEMO_USERS:
            if username_exists(cursor, user["username"]):
                print(f"  exists  : {user['username']} ({user['role']}) - left unchanged")
                continue
            insert_user(cursor, user)
            created += 1
            print(f"  created : {user['username']} ({user['role']})")

        # Commit once, after every account has been handled.
        connection.commit()
        print(f"\nDone. {created} account(s) created, "
              f"{len(DEMO_USERS) - created} already present.")
        print("Passwords are stored only as one-way hashes.")
        return 0

    except MySQLError as err:
        # Roll back so a partial run never leaves half the accounts behind.
        if connection is not None:
            try:
                connection.rollback()
            except MySQLError:
                pass
        # Report the driver message but never any credential value.
        print(f"Demo user setup failed: {err}")
        return 1

    finally:
        if cursor is not None:
            try:
                cursor.close()
            except MySQLError:
                pass
        if connection is not None:
            try:
                if connection.is_connected():
                    connection.close()
            except MySQLError:
                pass


if __name__ == "__main__":
    print("AquaFleet demonstration accounts")
    print("--------------------------------")
    sys.exit(main())
