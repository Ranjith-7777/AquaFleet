"""
routes/mission_vehicles.py
--------------------------
CRUD REST API for the `mission_vehicle` junction table (M:N EXECUTED_BY).

    GET    /api/mission-vehicles
    GET    /api/mission-vehicles/<mission_id>/<vehicle_id>
    POST   /api/mission-vehicles
    PUT    /api/mission-vehicles/<mission_id>/<vehicle_id>
    DELETE /api/mission-vehicles/<mission_id>/<vehicle_id>

Conventions match the other route modules: parameterized SQL, dictionary
cursors for reads, commit/rollback around writes, cleanup in finally blocks,
full error logging server-side and a generic message to the client.

COMPOSITE KEY
-------------
The primary key is (mission_id, vehicle_id) - there is no surrogate id, so
both components live in the URL path. They are IMMUTABLE: PUT edits only
launch_time and recovery_time, and rejects a body containing either key
component as an unrecognised field. Re-keying an assignment is a delete plus
a create, not an update.

LEAF TABLE
----------
Nothing references mission_vehicle, so DELETE needs no dependency guard and
never returns 409. It removes exactly one assignment row and never touches
either parent.
"""

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError
from mysql.connector import errorcode

from database import get_db_connection

mission_vehicles_bp = Blueprint(
    "mission_vehicles", __name__, url_prefix="/api/mission-vehicles"
)


# ============================================================================
# Validation rules
# ============================================================================

# Fields accepted on POST, where the key components must be supplied.
POST_FIELDS = {"mission_id", "vehicle_id", "launch_time", "recovery_time"}

# Fields accepted on PUT. The key components are deliberately absent.
PUT_FIELDS = {"launch_time", "recovery_time"}

DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
DATETIME_FORMAT_MESSAGE = "must be a valid datetime in YYYY-MM-DD HH:MM:SS format"

ASSIGNMENT_SELECT = """
    SELECT mv.mission_id,
           m.mission_type,
           mv.vehicle_id,
           v.vehicle_name,
           v.vehicle_type,
           mv.launch_time,
           mv.recovery_time
      FROM mission_vehicle mv
      JOIN mission m ON m.mission_id = mv.mission_id
      JOIN auv_rov v ON v.vehicle_id = mv.vehicle_id
"""

DB_ERROR_MESSAGE = "A database error occurred"


# ============================================================================
# Small reusable helpers
# ============================================================================

def close_resources(cursor, connection):
    """Release the cursor and the connection, ignoring anything already closed."""
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
    """Roll back without letting a secondary failure hide the original error."""
    if connection is None:
        return
    try:
        connection.rollback()
    except MySQLError:
        pass


def db_failure(err, action):
    """Log a driver error in full and build the safe 500 response."""
    current_app.logger.error(
        "Mission-vehicle %s failed: %s", action, err, exc_info=True
    )
    return jsonify({"success": False, "message": DB_ERROR_MESSAGE}), 500


def datetime_to_text(value):
    """Render a DATETIME as YYYY-MM-DD HH:MM:SS, or None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime(DATETIME_FORMAT)
    return value


def serialize_assignment(row):
    """Convert one joined database row into a JSON-safe dict."""
    if row is None:
        return None
    return {
        "mission_id": row["mission_id"],
        "mission_type": row["mission_type"],
        "vehicle_id": row["vehicle_id"],
        "vehicle_name": row["vehicle_name"],
        "vehicle_type": row["vehicle_type"],
        "launch_time": datetime_to_text(row["launch_time"]),
        "recovery_time": datetime_to_text(row["recovery_time"]),
    }


def parse_positive_integer(field, value, errors):
    """Validate a key component: a genuine JSON integer greater than zero."""
    message = f"{field} must be an integer greater than 0"

    if value is None:
        errors[field] = f"{field} is required"
        return None
    # bool is a subclass of int in Python, so True would otherwise pass as 1.
    if isinstance(value, bool) or not isinstance(value, int):
        errors[field] = message
        return None
    if value <= 0:
        errors[field] = message
        return None
    return value


def parse_datetime(field, value, errors):
    """Validate a DATETIME strictly and return a datetime, or None.

    Only the exact form YYYY-MM-DD HH:MM:SS is accepted. The round-trip
    comparison rejects single-digit components that strptime would otherwise
    tolerate; strptime itself rejects the ISO "T" separator, timezone
    suffixes, missing seconds and impossible calendar dates.
    """
    if not isinstance(value, str):
        errors[field] = f"{field} must be a string"
        return None

    trimmed = value.strip()
    if not trimmed:
        errors[field] = f"{field} must not be empty"
        return None

    try:
        parsed = datetime.strptime(trimmed, DATETIME_FORMAT)
    except ValueError:
        errors[field] = f"{field} {DATETIME_FORMAT_MESSAGE}"
        return None

    if parsed.strftime(DATETIME_FORMAT) != trimmed:
        errors[field] = f"{field} {DATETIME_FORMAT_MESSAGE}"
        return None

    return parsed


def validate_times(payload, errors, cleaned):
    """Validate launch_time and recovery_time, shared by POST and PUT."""
    launch_time = None

    if "launch_time" not in payload or payload.get("launch_time") is None:
        errors["launch_time"] = "launch_time is required"
    else:
        launch_time = parse_datetime("launch_time", payload["launch_time"], errors)
        if launch_time is not None:
            cleaned["launch_time"] = launch_time

    # The recovery_time KEY is required, but null is a valid value meaning the
    # vehicle is still deployed. Absence and null cannot be told apart with
    # .get(), hence the membership test.
    if "recovery_time" not in payload:
        errors["recovery_time"] = "recovery_time is required and may be null"
    elif payload["recovery_time"] is None:
        cleaned["recovery_time"] = None
    else:
        recovery_time = parse_datetime(
            "recovery_time", payload["recovery_time"], errors
        )
        if recovery_time is not None:
            # chk_mv_recovery_time is strictly greater, so equality is invalid.
            if launch_time is not None and recovery_time <= launch_time:
                errors["recovery_time"] = (
                    "recovery_time must be later than launch_time"
                )
            else:
                cleaned["recovery_time"] = recovery_time


def validate_payload(payload, allowed_fields, include_keys):
    """Check a POST/PUT body and return (cleaned_values, errors)."""
    errors = {}
    cleaned = {}

    if not isinstance(payload, dict):
        return {}, {"body": "Request body must be a JSON object"}

    # Unknown keys are rejected. On PUT this is what refuses an attempt to
    # change mission_id or vehicle_id, since neither is an accepted field.
    for key in payload:
        if key not in allowed_fields:
            errors[key] = f"{key} is not a recognised field"

    if include_keys:
        mission_id = parse_positive_integer(
            "mission_id", payload.get("mission_id"), errors
        )
        if mission_id is not None:
            cleaned["mission_id"] = mission_id

        vehicle_id = parse_positive_integer(
            "vehicle_id", payload.get("vehicle_id"), errors
        )
        if vehicle_id is not None:
            cleaned["vehicle_id"] = vehicle_id

    validate_times(payload, errors, cleaned)

    return cleaned, errors


def validation_response(errors):
    """Build the standard HTTP 400 body for a failed validation."""
    return jsonify({
        "success": False,
        "message": "Validation failed",
        "errors": errors
    }), 400


def parent_reference_response():
    """Build the HTTP 400 body for a MySQL 1452 foreign-key failure."""
    return validation_response({
        "parent_reference": "One or more referenced parent records no longer exist"
    })


def not_found_response():
    """Build the standard HTTP 404 body for a missing assignment."""
    return jsonify({
        "success": False,
        "message": "Mission-vehicle assignment not found"
    }), 404


def duplicate_response():
    """Build the standard HTTP 409 body for a duplicate composite key."""
    return jsonify({
        "success": False,
        "message": "This vehicle is already assigned to the mission"
    }), 409


def load_parents(cursor, mission_id, vehicle_id):
    """Fetch both parents and return (mission_row, vehicle_row, errors)."""
    errors = {}

    cursor.execute(
        "SELECT mission_id, mission_type, start_time, end_time "
        "FROM mission WHERE mission_id = %s",
        (mission_id,)
    )
    mission_row = cursor.fetchone()
    if mission_row is None:
        errors["mission_id"] = "mission_id does not reference an existing mission"

    cursor.execute(
        "SELECT vehicle_id, vehicle_name, vehicle_type FROM auv_rov WHERE vehicle_id = %s",
        (vehicle_id,)
    )
    vehicle_row = cursor.fetchone()
    if vehicle_row is None:
        errors["vehicle_id"] = "vehicle_id does not reference an existing vehicle"

    return mission_row, vehicle_row, errors


def validate_mission_window(cleaned, mission_row):
    """Check the deployment sits inside the mission's own time window.

    When the mission is still running (end_time IS NULL) there is no upper
    bound to test, so only the lower bound applies.
    """
    errors = {}

    mission_start = mission_row["start_time"]
    mission_end = mission_row["end_time"]

    launch_time = cleaned["launch_time"]
    recovery_time = cleaned.get("recovery_time")

    if launch_time < mission_start:
        errors["launch_time"] = (
            "launch_time must not be earlier than the mission start time "
            f"{mission_start.strftime(DATETIME_FORMAT)}"
        )
    elif mission_end is not None and launch_time > mission_end:
        errors["launch_time"] = (
            "launch_time must not be later than the mission end time "
            f"{mission_end.strftime(DATETIME_FORMAT)}"
        )

    if recovery_time is not None and mission_end is not None:
        if recovery_time > mission_end:
            errors["recovery_time"] = (
                "recovery_time must not be later than the mission end time "
                f"{mission_end.strftime(DATETIME_FORMAT)}"
            )

    return errors


def fetch_assignment(cursor, mission_id, vehicle_id):
    """Return one joined assignment row, or None."""
    cursor.execute(
        ASSIGNMENT_SELECT + " WHERE mv.mission_id = %s AND mv.vehicle_id = %s",
        (mission_id, vehicle_id)
    )
    return cursor.fetchone()


def build_payload(mission_id, vehicle_id, cleaned, mission_row, vehicle_row):
    """Build the response body for a created or updated assignment."""
    recovery_time = cleaned.get("recovery_time")
    return {
        "mission_id": mission_id,
        "mission_type": mission_row["mission_type"],
        "vehicle_id": vehicle_id,
        "vehicle_name": vehicle_row["vehicle_name"],
        "vehicle_type": vehicle_row["vehicle_type"],
        "launch_time": cleaned["launch_time"].strftime(DATETIME_FORMAT),
        "recovery_time": (
            None if recovery_time is None else recovery_time.strftime(DATETIME_FORMAT)
        ),
    }


# ============================================================================
# ENDPOINT 1 - list all assignments
# ============================================================================

@mission_vehicles_bp.route("", methods=["GET"])
def list_assignments():
    """GET /api/mission-vehicles - every assignment, joined, by full key."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(ASSIGNMENT_SELECT + " ORDER BY mv.mission_id, mv.vehicle_id")
        rows = cursor.fetchall()

        assignments = [serialize_assignment(row) for row in rows]

        return jsonify({
            "success": True,
            "count": len(assignments),
            "data": assignments
        }), 200

    except MySQLError as err:
        return db_failure(err, "list")

    finally:
        close_resources(cursor, connection)


# ============================================================================
# ENDPOINT 2 - fetch one assignment
# ============================================================================

@mission_vehicles_bp.route("/<int:mission_id>/<int:vehicle_id>", methods=["GET"])
def get_assignment(mission_id, vehicle_id):
    """GET /api/mission-vehicles/<mission_id>/<vehicle_id> - one, or 404."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        row = fetch_assignment(cursor, mission_id, vehicle_id)

        if row is None:
            return not_found_response()

        return jsonify({
            "success": True,
            "data": serialize_assignment(row)
        }), 200

    except MySQLError as err:
        return db_failure(err, "fetch")

    finally:
        close_resources(cursor, connection)


# ============================================================================
# ENDPOINT 3 - create an assignment
# ============================================================================

@mission_vehicles_bp.route("", methods=["POST"])
def create_assignment():
    """POST /api/mission-vehicles - validate, check parents and window, insert."""
    payload = request.get_json(silent=True)

    if payload is None:
        return validation_response({"body": "Request body must be a JSON object"})

    cleaned, errors = validate_payload(payload, POST_FIELDS, include_keys=True)
    if errors:
        return validation_response(errors)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        mission_row, vehicle_row, parent_errors = load_parents(
            cursor, cleaned["mission_id"], cleaned["vehicle_id"]
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        window_errors = validate_mission_window(cleaned, mission_row)
        if window_errors:
            connection.rollback()
            return validation_response(window_errors)

        cursor.execute(
            """
            INSERT INTO mission_vehicle
                (mission_id, vehicle_id, launch_time, recovery_time)
            VALUES (%s, %s, %s, %s)
            """,
            (
                cleaned["mission_id"],
                cleaned["vehicle_id"],
                cleaned["launch_time"],
                cleaned["recovery_time"],
            )
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Mission-vehicle assignment created successfully",
            "data": build_payload(
                cleaned["mission_id"], cleaned["vehicle_id"],
                cleaned, mission_row, vehicle_row
            )
        }), 201

    except MySQLError as err:
        safe_rollback(connection)

        # Letting MySQL detect the duplicate keeps this correct under races.
        if err.errno == errorcode.ER_DUP_ENTRY:
            return duplicate_response()
        if err.errno == errorcode.ER_NO_REFERENCED_ROW_2:
            return parent_reference_response()

        return db_failure(err, "create")

    finally:
        close_resources(cursor, connection)


# ============================================================================
# ENDPOINT 4 - update an assignment
# ============================================================================

@mission_vehicles_bp.route("/<int:mission_id>/<int:vehicle_id>", methods=["PUT"])
def update_assignment(mission_id, vehicle_id):
    """PUT /api/mission-vehicles/<mission_id>/<vehicle_id>.

    Only launch_time and recovery_time are editable. The key components come
    from the path; supplying either in the body is rejected as an unrecognised
    field, so an assignment can never be silently re-keyed.
    """
    payload = request.get_json(silent=True)

    if payload is None:
        return validation_response({"body": "Request body must be a JSON object"})

    cleaned, errors = validate_payload(payload, PUT_FIELDS, include_keys=False)
    if errors:
        return validation_response(errors)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        cursor.execute(
            """
            SELECT mission_id FROM mission_vehicle
             WHERE mission_id = %s AND vehicle_id = %s
             FOR UPDATE
            """,
            (mission_id, vehicle_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        mission_row, vehicle_row, parent_errors = load_parents(
            cursor, mission_id, vehicle_id
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        window_errors = validate_mission_window(cleaned, mission_row)
        if window_errors:
            connection.rollback()
            return validation_response(window_errors)

        cursor.execute(
            """
            UPDATE mission_vehicle
               SET launch_time   = %s,
                   recovery_time = %s
             WHERE mission_id = %s AND vehicle_id = %s
            """,
            (
                cleaned["launch_time"],
                cleaned["recovery_time"],
                mission_id,
                vehicle_id,
            )
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Mission-vehicle assignment updated successfully",
            "data": build_payload(
                mission_id, vehicle_id, cleaned, mission_row, vehicle_row
            )
        }), 200

    except MySQLError as err:
        safe_rollback(connection)

        if err.errno == errorcode.ER_NO_REFERENCED_ROW_2:
            return parent_reference_response()

        return db_failure(err, "update")

    finally:
        close_resources(cursor, connection)


# ============================================================================
# ENDPOINT 5 - delete an assignment
# ============================================================================

@mission_vehicles_bp.route("/<int:mission_id>/<int:vehicle_id>", methods=["DELETE"])
def delete_assignment(mission_id, vehicle_id):
    """DELETE /api/mission-vehicles/<mission_id>/<vehicle_id>.

    mission_vehicle is a leaf - nothing references it - so there is no
    dependency guard and no protected-delete 409. Exactly one assignment row
    is removed; neither the mission nor the vehicle is touched.
    """
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        cursor.execute(
            """
            SELECT mission_id FROM mission_vehicle
             WHERE mission_id = %s AND vehicle_id = %s
             FOR UPDATE
            """,
            (mission_id, vehicle_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        cursor.execute(
            "DELETE FROM mission_vehicle WHERE mission_id = %s AND vehicle_id = %s",
            (mission_id, vehicle_id)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Mission-vehicle assignment deleted successfully"
        }), 200

    except MySQLError as err:
        safe_rollback(connection)
        return db_failure(err, "delete")

    finally:
        close_resources(cursor, connection)
