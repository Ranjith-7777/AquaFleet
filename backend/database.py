"""
database.py
-----------
One reusable helper for talking to MySQL.

Every route that needs the database should call get_db_connection(),
use the connection, and then close it again.

Example
-------
    from database import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM vessel")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
"""

import mysql.connector
from mysql.connector import Error

from config import Config


def get_db_connection():
    """Open and return a new MySQL connection.

    Returns:
        A mysql.connector connection object.

    Raises:
        mysql.connector.Error: if the connection could not be established
        (wrong password, MySQL not running, database missing, and so on).
    """
    # Config.db_params() gives host / port / user / password / database.
    connection = mysql.connector.connect(**Config.db_params())
    return connection


def test_connection():
    """Check whether the database is reachable.

    Returns:
        (True, message)  if the connection worked
        (False, message) if it failed

    We return a tuple instead of raising, so the /api/health route can
    report the status without crashing the server.
    """
    try:
        connection = get_db_connection()
        if connection.is_connected():
            connection.close()
            return True, "MySQL connection successful"
        return False, "MySQL connection could not be established"
    except Error as err:
        return False, f"MySQL connection failed: {err}"
