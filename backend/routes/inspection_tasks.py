"""CRUD API for inspection_task, including its workflow policies."""

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError, errorcode

from database import get_db_connection

inspection_tasks_bp = Blueprint(
    "inspection_tasks", __name__, url_prefix="/api/inspection-tasks"
)

POST_FIELDS = {
    "mission_id", "asset_id", "task_type", "priority", "status",
    "finding_summary"
}
PUT_FIELDS = {"task_type", "priority", "status", "finding_summary"}
PRIORITIES = ("Low", "Medium", "High", "Urgent")
STATUSES = ("Pending", "In Progress", "Completed", "Cancelled")
HISTORICAL_MISSION_STATUSES = {"Completed", "Aborted"}
ALLOWED_TRANSITIONS = {
    "Pending": {"Pending", "In Progress", "Cancelled"},
    "In Progress": {"In Progress", "Completed", "Cancelled"},
    "Completed": {"Completed"},
    "Cancelled": {"Cancelled"},
}

TASK_SELECT = """
    SELECT it.inspection_id,
           it.mission_id,
           m.mission_type,
           m.status AS mission_status,
           m.start_time AS mission_start_time,
           m.end_time AS mission_end_time,
           it.asset_id,
           oa.asset_name,
           oa.asset_type,
           oa.latitude AS asset_latitude,
           oa.longitude AS asset_longitude,
           it.task_type,
           it.priority,
           it.status,
           it.finding_summary
      FROM inspection_task it
      JOIN mission m ON m.mission_id = it.mission_id
      JOIN offshore_asset oa ON oa.asset_id = it.asset_id
"""


def close_resources(cursor, connection):
    """Close database resources without masking an earlier error."""
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


def safe_rollback(connection):
    """Roll back a transaction, ignoring a secondary rollback failure."""
    if connection is not None:
        try:
            connection.rollback()
        except MySQLError:
            pass


def validation_response(errors):
    return jsonify({
        "success": False,
        "message": "Validation failed",
        "errors": errors,
    }), 400


def not_found_response():
    return jsonify({
        "success": False,
        "message": "Inspection task not found",
    }), 404


def parent_reference_response():
    return validation_response({
        "parent_reference":
            "One or more referenced parent records no longer exist"
    })


def database_failure(error, action):
    current_app.logger.error(
        "Inspection-task %s failed: %s", action, error, exc_info=True
    )
    return jsonify({
        "success": False,
        "message": "A database error occurred",
    }), 500


def conflict_response(message, errors=None):
    body = {"success": False, "message": message}
    if errors is not None:
        body["errors"] = errors
    return jsonify(body), 409


def parse_positive_integer(field, value, errors):
    """Accept only genuine positive JSON integers in signed-INT range."""
    if value is None:
        errors[field] = f"{field} is required"
        return None
    if (isinstance(value, bool) or not isinstance(value, int)
            or not 1 <= value <= 2147483647):
        errors[field] = (
            f"{field} must be an integer between 1 and 2147483647"
        )
        return None
    return value


def parse_text(field, value, errors, max_length):
    if value is None:
        errors[field] = f"{field} is required"
        return None
    if not isinstance(value, str):
        errors[field] = f"{field} must be a string"
        return None
    value = value.strip()
    if not value:
        errors[field] = f"{field} must not be empty"
        return None
    if len(value) > max_length:
        errors[field] = f"{field} must be at most {max_length} characters"
        return None
    return value


def parse_choice(field, value, choices, errors):
    if value is None:
        errors[field] = f"{field} is required"
        return None
    if not isinstance(value, str):
        errors[field] = f"{field} must be a string"
        return None
    value = value.strip()
    if value not in choices:
        errors[field] = f"{field} must be one of: {', '.join(choices)}"
        return None
    return value


def parse_finding(payload, errors):
    field = "finding_summary"
    if field not in payload:
        errors[field] = f"{field} is required"
        return None
    value = payload[field]
    if value is None:
        return None
    if not isinstance(value, str):
        errors[field] = f"{field} must be a string or null"
        return None
    value = value.strip()
    if not value:
        errors[field] = f"{field} must not be empty"
        return None
    if len(value.encode("utf-8")) > 65535:
        errors[field] = (
            "finding_summary must not exceed 65535 UTF-8 bytes"
        )
        return None
    return value


def validate_payload(payload, allowed_fields, include_parents):
    """Validate a complete POST or PUT body and collect all local errors."""
    if not isinstance(payload, dict):
        return {}, {"body": "Request body must be a JSON object"}

    errors = {
        key: f"{key} is not a recognised field"
        for key in payload if key not in allowed_fields
    }
    cleaned = {}

    if include_parents:
        for field in ("mission_id", "asset_id"):
            value = parse_positive_integer(field, payload.get(field), errors)
            if value is not None:
                cleaned[field] = value

    task_type = parse_text("task_type", payload.get("task_type"), errors, 100)
    if task_type is not None:
        cleaned["task_type"] = task_type

    priority = parse_choice(
        "priority", payload.get("priority"), PRIORITIES, errors
    )
    if priority is not None:
        cleaned["priority"] = priority

    status = parse_choice("status", payload.get("status"), STATUSES, errors)
    if status is not None:
        cleaned["status"] = status

    finding = parse_finding(payload, errors)
    if "finding_summary" in payload and "finding_summary" not in errors:
        cleaned["finding_summary"] = finding

    if status in {"Completed", "Cancelled"} and finding is None:
        if "finding_summary" not in errors:
            requirement = (
                "Completed tasks require a finding_summary"
                if status == "Completed"
                else "Cancelled tasks require a cancellation explanation "
                     "in finding_summary"
            )
            errors["finding_summary"] = requirement

    return cleaned, errors


def serialize_task(row):
    if row is None:
        return None
    row = dict(row)
    for field in ("mission_start_time", "mission_end_time"):
        if isinstance(row[field], datetime):
            row[field] = row[field].strftime("%Y-%m-%d %H:%M:%S")
    row["asset_latitude"] = float(row["asset_latitude"])
    row["asset_longitude"] = float(row["asset_longitude"])
    return row


def fetch_task(cursor, inspection_id):
    cursor.execute(
        TASK_SELECT + " WHERE it.inspection_id = %s", (inspection_id,)
    )
    return cursor.fetchone()


def load_parents(cursor, mission_id, asset_id):
    """Load both POST parents and report all missing references together."""
    errors = {}
    cursor.execute(
        """SELECT mission_id, mission_type, status, start_time, end_time
             FROM mission WHERE mission_id = %s""",
        (mission_id,)
    )
    mission = cursor.fetchone()
    if mission is None:
        errors["mission_id"] = (
            "mission_id does not reference an existing mission"
        )

    cursor.execute(
        """SELECT asset_id, asset_name, asset_type, latitude, longitude
             FROM offshore_asset WHERE asset_id = %s""",
        (asset_id,)
    )
    asset = cursor.fetchone()
    if asset is None:
        errors["asset_id"] = (
            "asset_id does not reference an existing offshore asset"
        )
    return mission, asset, errors


def validate_creation_policy(mission, status):
    if mission["status"] in HISTORICAL_MISSION_STATUSES:
        return conflict_response(
            "Inspection tasks cannot be created for a completed or aborted mission"
        )
    if mission["status"] == "Planned" and status not in {
            "Pending", "In Progress"}:
        return conflict_response(
            "Planned missions only allow Pending or In Progress inspection tasks",
            {"status": f"{status} is not allowed for a Planned mission"}
        )
    return None


def transition_error(old_status, new_status):
    if new_status not in ALLOWED_TRANSITIONS.get(old_status, set()):
        return conflict_response(
            "Invalid inspection task status transition",
            {"status": (
                f"Transition from {old_status} to {new_status} is not allowed"
            )}
        )
    return None


@inspection_tasks_bp.route("", methods=["GET"])
def list_inspection_tasks():
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(TASK_SELECT + " ORDER BY it.inspection_id")
        tasks = [serialize_task(row) for row in cursor.fetchall()]
        return jsonify({
            "success": True, "count": len(tasks), "data": tasks
        }), 200
    except MySQLError as error:
        return database_failure(error, "list")
    finally:
        close_resources(cursor, connection)


@inspection_tasks_bp.route("/<int:inspection_id>", methods=["GET"])
def get_inspection_task(inspection_id):
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        row = fetch_task(cursor, inspection_id)
        if row is None:
            return not_found_response()
        return jsonify({"success": True, "data": serialize_task(row)}), 200
    except MySQLError as error:
        return database_failure(error, "fetch")
    finally:
        close_resources(cursor, connection)


@inspection_tasks_bp.route("", methods=["POST"])
def create_inspection_task():
    cleaned, errors = validate_payload(
        request.get_json(silent=True), POST_FIELDS, include_parents=True
    )
    if errors:
        return validation_response(errors)

    connection = cursor = None
    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        mission, _, parent_errors = load_parents(
            cursor, cleaned["mission_id"], cleaned["asset_id"]
        )
        if parent_errors:
            safe_rollback(connection)
            return validation_response(parent_errors)

        policy_error = validate_creation_policy(mission, cleaned["status"])
        if policy_error is not None:
            safe_rollback(connection)
            return policy_error

        cursor.execute(
            """INSERT INTO inspection_task
                   (mission_id, asset_id, task_type, priority, status,
                    finding_summary)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                cleaned["mission_id"], cleaned["asset_id"],
                cleaned["task_type"], cleaned["priority"], cleaned["status"],
                cleaned["finding_summary"],
            )
        )
        inspection_id = cursor.lastrowid
        connection.commit()
        row = fetch_task(cursor, inspection_id)
        return jsonify({
            "success": True,
            "message": "Inspection task created successfully",
            "data": serialize_task(row),
        }), 201
    except MySQLError as error:
        safe_rollback(connection)
        if error.errno == errorcode.ER_NO_REFERENCED_ROW_2:
            return parent_reference_response()
        return database_failure(error, "create")
    finally:
        close_resources(cursor, connection)


@inspection_tasks_bp.route("/<int:inspection_id>", methods=["PUT"])
def update_inspection_task(inspection_id):
    cleaned, errors = validate_payload(
        request.get_json(silent=True), PUT_FIELDS, include_parents=False
    )
    if errors:
        return validation_response(errors)

    connection = cursor = None
    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()
        cursor.execute(
            """SELECT it.inspection_id, it.status,
                      m.status AS mission_status
                 FROM inspection_task it
                 JOIN mission m ON m.mission_id = it.mission_id
                WHERE it.inspection_id = %s
                FOR UPDATE""",
            (inspection_id,)
        )
        existing = cursor.fetchone()
        if existing is None:
            safe_rollback(connection)
            return not_found_response()

        if existing["mission_status"] in HISTORICAL_MISSION_STATUSES:
            safe_rollback(connection)
            return conflict_response(
                "Inspection tasks belonging to a completed or aborted mission "
                "cannot be modified"
            )

        invalid_transition = transition_error(
            existing["status"], cleaned["status"]
        )
        if invalid_transition is not None:
            safe_rollback(connection)
            return invalid_transition

        cursor.execute(
            """UPDATE inspection_task
                  SET task_type = %s,
                      priority = %s,
                      status = %s,
                      finding_summary = %s
                WHERE inspection_id = %s""",
            (
                cleaned["task_type"], cleaned["priority"], cleaned["status"],
                cleaned["finding_summary"], inspection_id,
            )
        )
        connection.commit()
        row = fetch_task(cursor, inspection_id)
        return jsonify({
            "success": True,
            "message": "Inspection task updated successfully",
            "data": serialize_task(row),
        }), 200
    except MySQLError as error:
        safe_rollback(connection)
        return database_failure(error, "update")
    finally:
        close_resources(cursor, connection)


@inspection_tasks_bp.route("/<int:inspection_id>", methods=["DELETE"])
def delete_inspection_task(inspection_id):
    connection = cursor = None
    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()
        cursor.execute(
            """SELECT inspection_id, status
                 FROM inspection_task
                WHERE inspection_id = %s
                FOR UPDATE""",
            (inspection_id,)
        )
        existing = cursor.fetchone()
        if existing is None:
            safe_rollback(connection)
            return not_found_response()

        status = existing["status"]
        if status == "In Progress":
            safe_rollback(connection)
            return conflict_response(
                "In-progress inspection tasks cannot be deleted; update the "
                "task status to Cancelled to preserve its history"
            )
        if status == "Completed":
            safe_rollback(connection)
            return conflict_response(
                "Completed inspection tasks cannot be deleted because they "
                "are historical records"
            )
        if status == "Cancelled":
            safe_rollback(connection)
            return conflict_response(
                "Cancelled inspection tasks cannot be deleted because they "
                "are historical records"
            )

        cursor.execute(
            "DELETE FROM inspection_task WHERE inspection_id = %s",
            (inspection_id,)
        )
        connection.commit()
        return jsonify({
            "success": True,
            "message": "Inspection task deleted successfully",
        }), 200
    except MySQLError as error:
        safe_rollback(connection)
        return database_failure(error, "delete")
    finally:
        close_resources(cursor, connection)
