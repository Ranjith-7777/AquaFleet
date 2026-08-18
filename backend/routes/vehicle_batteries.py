"""
routes/vehicle_batteries.py
---------------------------
CRUD REST API for the `vehicle_battery` junction table (M:N POWERED_BY).

    GET    /api/vehicle-batteries
    GET    /api/vehicle-batteries/<vehicle_id>/<battery_id>?start_cycle=...
    POST   /api/vehicle-batteries
    PUT    /api/vehicle-batteries/<vehicle_id>/<battery_id>?start_cycle=...
    DELETE /api/vehicle-batteries/<vehicle_id>/<battery_id>?start_cycle=...

Conventions match the other route modules.

THREE-COLUMN COMPOSITE KEY
--------------------------
The primary key is (vehicle_id, battery_id, start_cycle) - the only
three-column key in the schema, and the reason the same pack can be refitted
to the same vehicle in a later period instead of overwriting the earlier one.

A DATETIME does not sit comfortably in a URL path segment, so the two integer
components are path parameters while start_cycle is a MANDATORY query
parameter on GET-one, PUT and DELETE. It is parsed with the same strict format
as everywhere else; missing or malformed values give a field-level 400 rather
than silently acting on the wrong period.

All three key columns are IMMUTABLE. PUT edits only end_cycle - the single
non-key column - and rejects a body containing any key component. Moving a
start_cycle is a delete plus a create.

OVERLAP RULE
------------
A physical battery pack cannot power two things at once, so its assignment
periods may never overlap - not on the same vehicle, and not across different
vehicles. Different packs on one vehicle are unconstrained.

SERIALIZING WRITES PER BATTERY
------------------------------
Counting overlaps and then inserting is a read-then-write, so two requests for
the same pack could each see a clear interval and both commit. To close that,
every write first takes an exclusive row lock on the pack itself:

    SELECT battery_id FROM battery_pack WHERE battery_id = %s FOR UPDATE

Because all writes for a given battery contend for that one row, they queue
behind each other and the overlap check always runs against a settled picture.
The lock is per battery, so work on other packs is unaffected, and it is
acquired before the duplicate check, the overlap check and the write - all on
the same connection inside the same transaction, so it is held until commit or
rollback. POST and PUT take the locks in the same order (battery_pack, then
vehicle_battery) so they cannot deadlock against each other.

LEAF TABLE
----------
Nothing references vehicle_battery, so DELETE needs no dependency guard and
never returns 409.
"""

from datetime import datetime
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError
from mysql.connector import errorcode

from database import get_db_connection

vehicle_batteries_bp = Blueprint(
    "vehicle_batteries", __name__, url_prefix="/api/vehicle-batteries"
)


# ============================================================================
# Validation rules
# ============================================================================

DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
DATETIME_FORMAT_MESSAGE = "must be a valid datetime in YYYY-MM-DD HH:MM:SS format"

# Stands in for "no end yet" when comparing intervals in SQL. DATETIME's own
# maximum, so nothing real can ever sort after it.
OPEN_ENDED_SENTINEL = "9999-12-31 23:59:59"

# Fields accepted on POST, where all three key components must be supplied.
POST_FIELDS = {"vehicle_id", "battery_id", "start_cycle", "end_cycle"}

# Fields accepted on PUT: end_cycle is the only non-key column.
PUT_FIELDS = {"end_cycle"}

ASSIGNMENT_SELECT = """
    SELECT vb.vehicle_id,
           v.vehicle_name,
           vb.battery_id,
           b.chemistry,
           b.capacity_wh,
           vb.start_cycle,
           vb.end_cycle
      FROM vehicle_battery vb
      JOIN auv_rov      v ON v.vehicle_id = vb.vehicle_id
      JOIN battery_pack b ON b.battery_id = vb.battery_id
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
        "Vehicle-battery %s failed: %s", action, err, exc_info=True
    )
    return jsonify({"success": False, "message": DB_ERROR_MESSAGE}), 500


def decimal_to_number(value):
    """Turn a Decimal into a plain JSON number."""
    if isinstance(value, Decimal):
        return float(value)
    return value


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
        "vehicle_id": row["vehicle_id"],
        "vehicle_name": row["vehicle_name"],
        "battery_id": row["battery_id"],
        "chemistry": row["chemistry"],
        "capacity_wh": decimal_to_number(row["capacity_wh"]),
        "start_cycle": datetime_to_text(row["start_cycle"]),
        "end_cycle": datetime_to_text(row["end_cycle"]),
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
    """Validate a DATETIME strictly and return a datetime, or None."""
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


def parse_start_cycle_parameter():
    """Read and validate the mandatory ?start_cycle= query parameter.

    Returns (start_cycle, error_response). Exactly one is None. A missing or
    malformed value is a 400 rather than a silent match against the wrong
    period, since a two-column lookup would be ambiguous whenever a pack has
    been refitted to the same vehicle.
    """
    raw = request.args.get("start_cycle")
    message = (
        "start_cycle query parameter must be a valid datetime in "
        "YYYY-MM-DD HH:MM:SS format"
    )

    if raw is None or not raw.strip():
        return None, validation_response({"start_cycle": message})

    trimmed = raw.strip()
    try:
        parsed = datetime.strptime(trimmed, DATETIME_FORMAT)
    except ValueError:
        return None, validation_response({"start_cycle": message})

    if parsed.strftime(DATETIME_FORMAT) != trimmed:
        return None, validation_response({"start_cycle": message})

    return parsed, None


def validate_payload(payload, allowed_fields, include_keys, known_start_cycle=None):
    """Check a POST/PUT body and return (cleaned_values, errors).

    On PUT the start cycle is not in the body - it comes from the query
    parameter - so it is passed in as `known_start_cycle` purely so the
    end_cycle ordering rule can still be applied.
    """
    errors = {}
    cleaned = {}

    if not isinstance(payload, dict):
        return {}, {"body": "Request body must be a JSON object"}

    # Unknown keys are rejected. On PUT this is what refuses an attempt to
    # change vehicle_id, battery_id or start_cycle: none is an accepted field.
    for key in payload:
        if key not in allowed_fields:
            errors[key] = f"{key} is not a recognised field"

    start_cycle = known_start_cycle

    if include_keys:
        vehicle_id = parse_positive_integer(
            "vehicle_id", payload.get("vehicle_id"), errors
        )
        if vehicle_id is not None:
            cleaned["vehicle_id"] = vehicle_id

        battery_id = parse_positive_integer(
            "battery_id", payload.get("battery_id"), errors
        )
        if battery_id is not None:
            cleaned["battery_id"] = battery_id

        if "start_cycle" not in payload or payload.get("start_cycle") is None:
            errors["start_cycle"] = "start_cycle is required"
        else:
            start_cycle = parse_datetime("start_cycle", payload["start_cycle"], errors)
            if start_cycle is not None:
                cleaned["start_cycle"] = start_cycle

    # The end_cycle KEY is required, but null is a valid value meaning the pack
    # is still fitted. Absence and null cannot be told apart with .get(), hence
    # the membership test.
    if "end_cycle" not in payload:
        errors["end_cycle"] = "end_cycle is required and may be null"
    elif payload["end_cycle"] is None:
        cleaned["end_cycle"] = None
    else:
        end_cycle = parse_datetime("end_cycle", payload["end_cycle"], errors)
        if end_cycle is not None:
            # chk_vb_cycle_order is strictly greater, so equality is invalid.
            if start_cycle is not None and end_cycle <= start_cycle:
                errors["end_cycle"] = "end_cycle must be later than start_cycle"
            else:
                cleaned["end_cycle"] = end_cycle

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
    """Build the standard HTTP 404 body for a missing assignment period."""
    return jsonify({
        "success": False,
        "message": "Vehicle-battery assignment period not found"
    }), 404


def duplicate_response():
    """Build the standard HTTP 409 body for a duplicate three-column key."""
    return jsonify({
        "success": False,
        "message": "This battery assignment period already exists"
    }), 409


def overlap_response():
    """Build the HTTP 409 body for a battery already busy in that interval."""
    return jsonify({
        "success": False,
        "message": "Battery assignment period overlaps an existing assignment "
                   "for this battery"
    }), 409


def load_parents(cursor, vehicle_id, battery_id):
    """Fetch both parents and return (vehicle_row, battery_row, errors)."""
    errors = {}

    cursor.execute(
        "SELECT vehicle_id, vehicle_name FROM auv_rov WHERE vehicle_id = %s",
        (vehicle_id,)
    )
    vehicle_row = cursor.fetchone()
    if vehicle_row is None:
        errors["vehicle_id"] = "vehicle_id does not reference an existing vehicle"

    cursor.execute(
        "SELECT battery_id, chemistry, capacity_wh FROM battery_pack WHERE battery_id = %s",
        (battery_id,)
    )
    battery_row = cursor.fetchone()
    if battery_row is None:
        errors["battery_id"] = "battery_id does not reference an existing battery pack"

    return vehicle_row, battery_row, errors


def lock_battery(cursor, battery_id):
    """Take an exclusive row lock on one battery pack. Returns False if absent.

    This is what serializes writes for a single pack: every POST and PUT must
    hold this lock before it may check for duplicates, count overlaps or write,
    so concurrent requests for the same battery queue instead of racing. Other
    batteries are untouched - the lock is one row, not the table.

    The lock lives for the rest of the transaction, so it must be taken on the
    same connection that performs the checks and the write.
    """
    cursor.execute(
        "SELECT battery_id FROM battery_pack WHERE battery_id = %s FOR UPDATE",
        (battery_id,)
    )
    return cursor.fetchone() is not None


def battery_missing_response():
    """The field-specific 400 for a battery that does not exist."""
    return validation_response({
        "battery_id": "battery_id does not reference an existing battery pack"
    })


def exact_period_exists(cursor, vehicle_id, battery_id, start_cycle):
    """Return True when this exact three-column key is already stored.

    Checked before the broader overlap scan so an exact duplicate reports as a
    duplicate rather than as an overlap - a duplicate always overlaps itself,
    so without this the more general message would always win.
    """
    cursor.execute(
        """
        SELECT 1 AS present
          FROM vehicle_battery
         WHERE vehicle_id = %s AND battery_id = %s AND start_cycle = %s
        """,
        (vehicle_id, battery_id, start_cycle)
    )
    return cursor.fetchone() is not None


def count_overlapping_periods(cursor, battery_id, start_cycle, end_cycle,
                              exclude_vehicle_id=None, exclude_start_cycle=None):
    """Count existing periods for THIS battery that clash with the proposed one.

    Two half-open intervals [s1, e1) and [s2, e2) overlap when

        s1 < e2  AND  s2 < e1

    A null end means "open ended", represented here by a sentinel datetime far
    beyond any real value. The comparisons are strict, so touching intervals
    are allowed: an existing period ending exactly when the new one starts,
    or vice versa, is not an overlap.

    The scope is the BATTERY, not the vehicle - one physical pack cannot power
    two vehicles at once. Different packs on the same vehicle are unaffected.

    On PUT the row being edited is excluded by its own key, so a period never
    counts as overlapping itself.
    """
    sql = """
        SELECT COUNT(*) AS overlap_count
          FROM vehicle_battery
         WHERE battery_id = %s
           AND start_cycle < COALESCE(%s, %s)
           AND %s < COALESCE(end_cycle, %s)
    """
    params = [
        battery_id,
        end_cycle, OPEN_ENDED_SENTINEL,
        start_cycle, OPEN_ENDED_SENTINEL,
    ]

    if exclude_vehicle_id is not None and exclude_start_cycle is not None:
        sql += " AND NOT (vehicle_id = %s AND start_cycle = %s)"
        params.extend([exclude_vehicle_id, exclude_start_cycle])

    cursor.execute(sql, tuple(params))
    return int(cursor.fetchone()["overlap_count"])


def fetch_assignment(cursor, vehicle_id, battery_id, start_cycle):
    """Return one joined assignment row, or None."""
    cursor.execute(
        ASSIGNMENT_SELECT + """
         WHERE vb.vehicle_id = %s
           AND vb.battery_id = %s
           AND vb.start_cycle = %s
        """,
        (vehicle_id, battery_id, start_cycle)
    )
    return cursor.fetchone()


def build_payload(vehicle_id, battery_id, start_cycle, end_cycle,
                  vehicle_row, battery_row):
    """Build the response body for a created or updated assignment period."""
    return {
        "vehicle_id": vehicle_id,
        "vehicle_name": vehicle_row["vehicle_name"],
        "battery_id": battery_id,
        "chemistry": battery_row["chemistry"],
        "capacity_wh": decimal_to_number(battery_row["capacity_wh"]),
        "start_cycle": start_cycle.strftime(DATETIME_FORMAT),
        "end_cycle": None if end_cycle is None else end_cycle.strftime(DATETIME_FORMAT),
    }


# ============================================================================
# ENDPOINT 1 - list all assignment periods
# ============================================================================

@vehicle_batteries_bp.route("", methods=["GET"])
def list_assignments():
    """GET /api/vehicle-batteries - every period, joined, by full key."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            ASSIGNMENT_SELECT
            + " ORDER BY vb.vehicle_id, vb.battery_id, vb.start_cycle"
        )
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
# ENDPOINT 2 - fetch one assignment period
# ============================================================================

@vehicle_batteries_bp.route("/<int:vehicle_id>/<int:battery_id>", methods=["GET"])
def get_assignment(vehicle_id, battery_id):
    """GET /api/vehicle-batteries/<vehicle_id>/<battery_id>?start_cycle=..."""
    start_cycle, error_response = parse_start_cycle_parameter()
    if error_response is not None:
        return error_response

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        row = fetch_assignment(cursor, vehicle_id, battery_id, start_cycle)

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
# ENDPOINT 3 - create an assignment period
# ============================================================================

@vehicle_batteries_bp.route("", methods=["POST"])
def create_assignment():
    """POST /api/vehicle-batteries - validate, check parents and overlap, insert."""
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

        vehicle_row, battery_row, parent_errors = load_parents(
            cursor, cleaned["vehicle_id"], cleaned["battery_id"]
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        # Serialize every write for this pack before looking at any period.
        # Held until commit or rollback, so the two checks below and the INSERT
        # all see a settled picture.
        if not lock_battery(cursor, cleaned["battery_id"]):
            connection.rollback()
            return battery_missing_response()

        # An exact key match is reported as a duplicate. It has to be tested
        # first: a duplicate also overlaps itself, so the broader scan below
        # would otherwise report the less specific message.
        if exact_period_exists(cursor, cleaned["vehicle_id"],
                               cleaned["battery_id"], cleaned["start_cycle"]):
            connection.rollback()
            return duplicate_response()

        overlaps = count_overlapping_periods(
            cursor, cleaned["battery_id"],
            cleaned["start_cycle"], cleaned["end_cycle"]
        )
        if overlaps > 0:
            connection.rollback()
            return overlap_response()

        cursor.execute(
            """
            INSERT INTO vehicle_battery
                (vehicle_id, battery_id, start_cycle, end_cycle)
            VALUES (%s, %s, %s, %s)
            """,
            (
                cleaned["vehicle_id"],
                cleaned["battery_id"],
                cleaned["start_cycle"],
                cleaned["end_cycle"],
            )
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Vehicle-battery assignment period created successfully",
            "data": build_payload(
                cleaned["vehicle_id"], cleaned["battery_id"],
                cleaned["start_cycle"], cleaned["end_cycle"],
                vehicle_row, battery_row
            )
        }), 201

    except MySQLError as err:
        safe_rollback(connection)

        # Race fallback. The explicit check above catches duplicates in the
        # normal case; this covers a competing insert that commits between the
        # check and this INSERT despite the battery lock - for instance a row
        # written outside this API.
        if err.errno == errorcode.ER_DUP_ENTRY:
            return duplicate_response()
        if err.errno == errorcode.ER_NO_REFERENCED_ROW_2:
            return parent_reference_response()

        return db_failure(err, "create")

    finally:
        close_resources(cursor, connection)


# ============================================================================
# ENDPOINT 4 - update an assignment period
# ============================================================================

@vehicle_batteries_bp.route("/<int:vehicle_id>/<int:battery_id>", methods=["PUT"])
def update_assignment(vehicle_id, battery_id):
    """PUT /api/vehicle-batteries/<vehicle_id>/<battery_id>?start_cycle=...

    end_cycle is the only editable column - every other column is part of the
    primary key. The proposed interval therefore keeps the original
    start_cycle, and the overlap check excludes this row from its own scan.
    """
    start_cycle, error_response = parse_start_cycle_parameter()
    if error_response is not None:
        return error_response

    payload = request.get_json(silent=True)

    if payload is None:
        return validation_response({"body": "Request body must be a JSON object"})

    cleaned, errors = validate_payload(
        payload, PUT_FIELDS, include_keys=False, known_start_cycle=start_cycle
    )
    if errors:
        return validation_response(errors)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        vehicle_row, battery_row, parent_errors = load_parents(
            cursor, vehicle_id, battery_id
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        # Same lock, taken in the same order as POST (battery_pack first, then
        # vehicle_battery) so the two endpoints cannot deadlock against each
        # other while working on the same pack.
        if not lock_battery(cursor, battery_id):
            connection.rollback()
            return battery_missing_response()

        cursor.execute(
            """
            SELECT vehicle_id FROM vehicle_battery
             WHERE vehicle_id = %s AND battery_id = %s AND start_cycle = %s
             FOR UPDATE
            """,
            (vehicle_id, battery_id, start_cycle)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        # No exact-duplicate check here: the row being edited IS that key, and
        # start_cycle is immutable, so the only thing to test is whether the
        # new end_cycle runs into a DIFFERENT period. The row excludes itself.
        overlaps = count_overlapping_periods(
            cursor, battery_id, start_cycle, cleaned["end_cycle"],
            exclude_vehicle_id=vehicle_id, exclude_start_cycle=start_cycle
        )
        if overlaps > 0:
            connection.rollback()
            return overlap_response()

        cursor.execute(
            """
            UPDATE vehicle_battery
               SET end_cycle = %s
             WHERE vehicle_id = %s AND battery_id = %s AND start_cycle = %s
            """,
            (cleaned["end_cycle"], vehicle_id, battery_id, start_cycle)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Vehicle-battery assignment period updated successfully",
            "data": build_payload(
                vehicle_id, battery_id, start_cycle, cleaned["end_cycle"],
                vehicle_row, battery_row
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
# ENDPOINT 5 - delete an assignment period
# ============================================================================

@vehicle_batteries_bp.route("/<int:vehicle_id>/<int:battery_id>", methods=["DELETE"])
def delete_assignment(vehicle_id, battery_id):
    """DELETE /api/vehicle-batteries/<vehicle_id>/<battery_id>?start_cycle=...

    vehicle_battery is a leaf, so there is no dependency guard and no
    protected-delete 409. Exactly one period is removed - the one named by all
    three key components - and neither parent is touched.
    """
    start_cycle, error_response = parse_start_cycle_parameter()
    if error_response is not None:
        return error_response

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        cursor.execute(
            """
            SELECT vehicle_id FROM vehicle_battery
             WHERE vehicle_id = %s AND battery_id = %s AND start_cycle = %s
             FOR UPDATE
            """,
            (vehicle_id, battery_id, start_cycle)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        cursor.execute(
            """
            DELETE FROM vehicle_battery
             WHERE vehicle_id = %s AND battery_id = %s AND start_cycle = %s
            """,
            (vehicle_id, battery_id, start_cycle)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Vehicle-battery assignment period deleted successfully"
        }), 200

    except MySQLError as err:
        safe_rollback(connection)
        return db_failure(err, "delete")

    finally:
        close_resources(cursor, connection)
