"""
routes/vehicle_sensors.py
-------------------------
CRUD REST API for the `vehicle_sensor` junction table (M:N EQUIPPED_WITH).

    GET    /api/vehicle-sensors
    GET    /api/vehicle-sensors/<vehicle_id>/<sensor_id>
    POST   /api/vehicle-sensors
    PUT    /api/vehicle-sensors/<vehicle_id>/<sensor_id>
    DELETE /api/vehicle-sensors/<vehicle_id>/<sensor_id>

Conventions match the other route modules.

COMPOSITE KEY
-------------
The primary key is (vehicle_id, sensor_id), so both components live in the URL
path and are IMMUTABLE: PUT edits only mount_position and install_date, and
rejects a body containing either key component as an unrecognised field.

INSTALL DATE
------------
install_date records a fitting that has already happened, so a future date is
rejected; today is accepted. The boundary is read from date.today() on every
request rather than frozen at import.

It is deliberately NOT compared against sensor.calibration_date. Instruments
are recalibrated on a schedule after being fitted, so seven of the eight
seeded rows have an install_date earlier than their sensor's calibration_date.
Enforcing that ordering would reject perfectly valid data.

LEAF TABLE
----------
Nothing references vehicle_sensor, so DELETE needs no dependency guard and
never returns 409.
"""

from datetime import date, datetime

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError
from mysql.connector import errorcode

from database import get_db_connection

vehicle_sensors_bp = Blueprint(
    "vehicle_sensors", __name__, url_prefix="/api/vehicle-sensors"
)


# ============================================================================
# Validation rules
# ============================================================================

MOUNT_POSITION_MAX_LENGTH = 100

DATE_FORMAT = "%Y-%m-%d"
DATE_FORMAT_MESSAGE = "install_date must be a valid date in YYYY-MM-DD format"

# Fields accepted on POST, where the key components must be supplied.
POST_FIELDS = {"vehicle_id", "sensor_id", "mount_position", "install_date"}

# Fields accepted on PUT. The key components are deliberately absent.
PUT_FIELDS = {"mount_position", "install_date"}

ASSIGNMENT_SELECT = """
    SELECT vs.vehicle_id,
           v.vehicle_name,
           vs.sensor_id,
           s.sensor_type,
           s.manufacturer,
           vs.mount_position,
           vs.install_date
      FROM vehicle_sensor vs
      JOIN auv_rov v ON v.vehicle_id = vs.vehicle_id
      JOIN sensor  s ON s.sensor_id  = vs.sensor_id
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
        "Vehicle-sensor %s failed: %s", action, err, exc_info=True
    )
    return jsonify({"success": False, "message": DB_ERROR_MESSAGE}), 500


def date_to_iso(value):
    """Render a DATE as YYYY-MM-DD.

    The driver returns datetime.date, which Flask would otherwise serialize as
    an RFC 1123 string.
    """
    if isinstance(value, date):
        return value.isoformat()
    return value


def serialize_assignment(row):
    """Convert one joined database row into a JSON-safe dict."""
    if row is None:
        return None
    return {
        "vehicle_id": row["vehicle_id"],
        "vehicle_name": row["vehicle_name"],
        "sensor_id": row["sensor_id"],
        "sensor_type": row["sensor_type"],
        "manufacturer": row["manufacturer"],
        "mount_position": row["mount_position"],
        "install_date": date_to_iso(row["install_date"]),
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


def parse_install_date(value, errors):
    """Validate install_date strictly and return a date, or None.

    Only the exact form YYYY-MM-DD is accepted. The round-trip comparison
    rejects single-digit months and days that strptime would tolerate;
    strptime itself rejects compact forms, timestamps, zero dates and
    impossible calendar dates.
    """
    field = "install_date"

    if value is None:
        errors[field] = f"{field} is required"
        return None
    if not isinstance(value, str):
        errors[field] = f"{field} must be a string"
        return None

    trimmed = value.strip()
    if not trimmed:
        errors[field] = f"{field} must not be empty"
        return None

    try:
        parsed = datetime.strptime(trimmed, DATE_FORMAT).date()
    except ValueError:
        errors[field] = DATE_FORMAT_MESSAGE
        return None

    if parsed.strftime(DATE_FORMAT) != trimmed:
        errors[field] = DATE_FORMAT_MESSAGE
        return None

    # date.today() is read per request, never frozen at import time, so the
    # boundary moves with the server clock. Today itself is allowed.
    if parsed > date.today():
        errors[field] = "install_date cannot be in the future"
        return None

    return parsed


def validate_payload(payload, allowed_fields, include_keys):
    """Check a POST/PUT body and return (cleaned_values, errors)."""
    errors = {}
    cleaned = {}

    if not isinstance(payload, dict):
        return {}, {"body": "Request body must be a JSON object"}

    # Unknown keys are rejected. On PUT this is what refuses an attempt to
    # change vehicle_id or sensor_id, since neither is an accepted field.
    for key in payload:
        if key not in allowed_fields:
            errors[key] = f"{key} is not a recognised field"

    if include_keys:
        vehicle_id = parse_positive_integer(
            "vehicle_id", payload.get("vehicle_id"), errors
        )
        if vehicle_id is not None:
            cleaned["vehicle_id"] = vehicle_id

        sensor_id = parse_positive_integer(
            "sensor_id", payload.get("sensor_id"), errors
        )
        if sensor_id is not None:
            cleaned["sensor_id"] = sensor_id

    mount_position = payload.get("mount_position")
    if mount_position is None:
        errors["mount_position"] = "mount_position is required"
    elif not isinstance(mount_position, str):
        errors["mount_position"] = "mount_position must be a string"
    else:
        trimmed = mount_position.strip()
        if not trimmed:
            errors["mount_position"] = "mount_position must not be empty"
        elif len(trimmed) > MOUNT_POSITION_MAX_LENGTH:
            errors["mount_position"] = (
                f"mount_position must be at most {MOUNT_POSITION_MAX_LENGTH} characters"
            )
        else:
            cleaned["mount_position"] = trimmed

    install_date = parse_install_date(payload.get("install_date"), errors)
    if install_date is not None:
        cleaned["install_date"] = install_date

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
        "message": "Vehicle-sensor assignment not found"
    }), 404


def duplicate_response():
    """Build the standard HTTP 409 body for a duplicate composite key."""
    return jsonify({
        "success": False,
        "message": "This sensor is already assigned to the vehicle"
    }), 409


def load_parents(cursor, vehicle_id, sensor_id):
    """Fetch both parents and return (vehicle_row, sensor_row, errors)."""
    errors = {}

    cursor.execute(
        "SELECT vehicle_id, vehicle_name FROM auv_rov WHERE vehicle_id = %s",
        (vehicle_id,)
    )
    vehicle_row = cursor.fetchone()
    if vehicle_row is None:
        errors["vehicle_id"] = "vehicle_id does not reference an existing vehicle"

    cursor.execute(
        "SELECT sensor_id, sensor_type, manufacturer FROM sensor WHERE sensor_id = %s",
        (sensor_id,)
    )
    sensor_row = cursor.fetchone()
    if sensor_row is None:
        errors["sensor_id"] = "sensor_id does not reference an existing sensor"

    return vehicle_row, sensor_row, errors


def fetch_assignment(cursor, vehicle_id, sensor_id):
    """Return one joined assignment row, or None."""
    cursor.execute(
        ASSIGNMENT_SELECT + " WHERE vs.vehicle_id = %s AND vs.sensor_id = %s",
        (vehicle_id, sensor_id)
    )
    return cursor.fetchone()


def build_payload(vehicle_id, sensor_id, cleaned, vehicle_row, sensor_row):
    """Build the response body for a created or updated assignment."""
    return {
        "vehicle_id": vehicle_id,
        "vehicle_name": vehicle_row["vehicle_name"],
        "sensor_id": sensor_id,
        "sensor_type": sensor_row["sensor_type"],
        "manufacturer": sensor_row["manufacturer"],
        "mount_position": cleaned["mount_position"],
        "install_date": cleaned["install_date"].isoformat(),
    }


# ============================================================================
# ENDPOINT 1 - list all assignments
# ============================================================================

@vehicle_sensors_bp.route("", methods=["GET"])
def list_assignments():
    """GET /api/vehicle-sensors - every assignment, joined, by full key."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(ASSIGNMENT_SELECT + " ORDER BY vs.vehicle_id, vs.sensor_id")
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

@vehicle_sensors_bp.route("/<int:vehicle_id>/<int:sensor_id>", methods=["GET"])
def get_assignment(vehicle_id, sensor_id):
    """GET /api/vehicle-sensors/<vehicle_id>/<sensor_id> - one, or 404."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        row = fetch_assignment(cursor, vehicle_id, sensor_id)

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

@vehicle_sensors_bp.route("", methods=["POST"])
def create_assignment():
    """POST /api/vehicle-sensors - validate, check parents, insert."""
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

        vehicle_row, sensor_row, parent_errors = load_parents(
            cursor, cleaned["vehicle_id"], cleaned["sensor_id"]
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        cursor.execute(
            """
            INSERT INTO vehicle_sensor
                (vehicle_id, sensor_id, mount_position, install_date)
            VALUES (%s, %s, %s, %s)
            """,
            (
                cleaned["vehicle_id"],
                cleaned["sensor_id"],
                cleaned["mount_position"],
                cleaned["install_date"],
            )
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Vehicle-sensor assignment created successfully",
            "data": build_payload(
                cleaned["vehicle_id"], cleaned["sensor_id"],
                cleaned, vehicle_row, sensor_row
            )
        }), 201

    except MySQLError as err:
        safe_rollback(connection)

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

@vehicle_sensors_bp.route("/<int:vehicle_id>/<int:sensor_id>", methods=["PUT"])
def update_assignment(vehicle_id, sensor_id):
    """PUT /api/vehicle-sensors/<vehicle_id>/<sensor_id>.

    Only mount_position and install_date are editable; the key components come
    from the path and supplying either in the body is rejected.
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
            SELECT vehicle_id FROM vehicle_sensor
             WHERE vehicle_id = %s AND sensor_id = %s
             FOR UPDATE
            """,
            (vehicle_id, sensor_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        vehicle_row, sensor_row, parent_errors = load_parents(
            cursor, vehicle_id, sensor_id
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        cursor.execute(
            """
            UPDATE vehicle_sensor
               SET mount_position = %s,
                   install_date   = %s
             WHERE vehicle_id = %s AND sensor_id = %s
            """,
            (
                cleaned["mount_position"],
                cleaned["install_date"],
                vehicle_id,
                sensor_id,
            )
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Vehicle-sensor assignment updated successfully",
            "data": build_payload(
                vehicle_id, sensor_id, cleaned, vehicle_row, sensor_row
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

@vehicle_sensors_bp.route("/<int:vehicle_id>/<int:sensor_id>", methods=["DELETE"])
def delete_assignment(vehicle_id, sensor_id):
    """DELETE /api/vehicle-sensors/<vehicle_id>/<sensor_id>.

    vehicle_sensor is a leaf, so there is no dependency guard and no
    protected-delete 409. Exactly one assignment row is removed; neither the
    vehicle nor the sensor is touched.
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
            SELECT vehicle_id FROM vehicle_sensor
             WHERE vehicle_id = %s AND sensor_id = %s
             FOR UPDATE
            """,
            (vehicle_id, sensor_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        cursor.execute(
            "DELETE FROM vehicle_sensor WHERE vehicle_id = %s AND sensor_id = %s",
            (vehicle_id, sensor_id)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Vehicle-sensor assignment deleted successfully"
        }), 200

    except MySQLError as err:
        safe_rollback(connection)
        return db_failure(err, "delete")

    finally:
        close_resources(cursor, connection)
