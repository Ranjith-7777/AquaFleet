"""
routes/notifications.py
-----------------------
Read API for the `notification` table.

Rows are never created here.  They are written by AFTER triggers in the same
transaction as the change that caused them (high/critical incident, poor or
replace-rated battery pack, maintenance due within 14 days or overdue), so a
notification exists if and only if that change was committed.

    GET   /api/notifications              newest first; ?unread=1 filters
    PATCH /api/notifications/<id>/read    mark one notification read
    PATCH /api/notifications/read-all     mark every unread notification read

Everyone signed in may read.  Marking read is granted in authentication.py.
"""

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError

from database import get_db_connection

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

COLUMNS = ("notification_id, category, severity, title, message, "
           "source_table, source_id, created_at, is_read, read_at")
MAX_ROWS = 100


def close_resources(cursor, connection):
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


def db_failure(err, action):
    current_app.logger.error("Notification %s failed: %s", action, err, exc_info=True)
    return jsonify({"success": False, "message": "A database error occurred"}), 500


def serialize(row):
    return {
        "notification_id": row["notification_id"],
        "category": row["category"],
        "severity": row["severity"],
        "title": row["title"],
        "message": row["message"],
        "source_table": row["source_table"],
        "source_id": row["source_id"],
        "created_at": row["created_at"].strftime("%Y-%m-%d %H:%M:%S") if row["created_at"] else None,
        "is_read": bool(row["is_read"]),
        "read_at": row["read_at"].strftime("%Y-%m-%d %H:%M:%S") if row["read_at"] else None,
    }


@notifications_bp.route("", methods=["GET"])
def list_notifications():
    """GET /api/notifications - newest first, at most MAX_ROWS rows."""
    unread_only = request.args.get("unread") == "1"
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        where = "WHERE is_read = 0" if unread_only else ""
        cursor.execute(
            f"SELECT {COLUMNS} FROM notification {where} "
            f"ORDER BY created_at DESC, notification_id DESC LIMIT {MAX_ROWS}"
        )
        rows = [serialize(row) for row in cursor.fetchall()]
        # The badge count must not be capped by the list limit.
        cursor.execute("SELECT COUNT(*) AS unread FROM notification WHERE is_read = 0")
        unread = int(cursor.fetchone()["unread"])
        return jsonify({"success": True, "count": len(rows), "unread_count": unread, "data": rows}), 200
    except MySQLError as err:
        return db_failure(err, "list")
    finally:
        close_resources(cursor, connection)


@notifications_bp.route("/<int:notification_id>/read", methods=["PATCH"])
def mark_read(notification_id):
    """PATCH /api/notifications/<id>/read - idempotent."""
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT notification_id FROM notification WHERE notification_id = %s",
                       (notification_id,))
        if cursor.fetchone() is None:
            return jsonify({"success": False, "message": "Notification not found"}), 404
        cursor.execute(
            "UPDATE notification SET is_read = 1, read_at = COALESCE(read_at, NOW()) "
            "WHERE notification_id = %s", (notification_id,))
        connection.commit()
        return jsonify({"success": True, "message": "Notification marked as read"}), 200
    except MySQLError as err:
        if connection is not None:
            connection.rollback()
        return db_failure(err, "mark read")
    finally:
        close_resources(cursor, connection)


@notifications_bp.route("/read-all", methods=["PATCH"])
def mark_all_read():
    """PATCH /api/notifications/read-all"""
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("UPDATE notification SET is_read = 1, read_at = NOW() WHERE is_read = 0")
        changed = cursor.rowcount
        connection.commit()
        return jsonify({"success": True, "message": "Notifications marked as read", "updated": changed}), 200
    except MySQLError as err:
        if connection is not None:
            connection.rollback()
        return db_failure(err, "mark all read")
    finally:
        close_resources(cursor, connection)
