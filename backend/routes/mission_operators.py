"""
routes/mission_operators.py
---------------------------
CRUD REST API for the `mission_operator` junction table (M:N ASSIGNED_TO).

    GET    /api/mission-operators
    GET    /api/mission-operators/<mission_id>/<operator_id>
    POST   /api/mission-operators
    PUT    /api/mission-operators/<mission_id>/<operator_id>
    DELETE /api/mission-operators/<mission_id>/<operator_id>

Conventions match the other route modules.

COMPOSITE KEY
-------------
The primary key is (mission_id, operator_id), so both components live in the
URL path and are IMMUTABLE: PUT edits only duty_role and shift, and rejects a
body containing either key component as an unrecognised field.

`operator` is always written with backticks in SQL, since OPERATOR reads as
SQL terminology.

LEAF TABLE
----------
Nothing references mission_operator, so DELETE needs no dependency guard and
never returns 409.

duty_role and shift are free VARCHAR columns with no CHECK constraint, so no
enumeration is invented for them - only length and blankness are enforced.
"""

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError
from mysql.connector import errorcode

from database import get_db_connection

mission_operators_bp = Blueprint(
    "mission_operators", __name__, url_prefix="/api/mission-operators"
)


# ============================================================================
# Validation rules
# ============================================================================

# Free-text columns and the maximum length allowed by the schema.
TEXT_FIELDS = {
    "duty_role": 80,
    "shift": 50,
}

# Fields accepted on POST, where the key components must be supplied.
POST_FIELDS = set(TEXT_FIELDS) | {"mission_id", "operator_id"}

# Fields accepted on PUT. The key components are deliberately absent.
PUT_FIELDS = set(TEXT_FIELDS)

ASSIGNMENT_SELECT = """
    SELECT mo.mission_id,
           m.mission_type,
           mo.operator_id,
           CONCAT(o.first_name, ' ', o.last_name) AS operator_name,
           mo.duty_role,
           mo.shift
      FROM mission_operator mo
      JOIN mission     m ON m.mission_id  = mo.mission_id
      JOIN `operator`  o ON o.operator_id = mo.operator_id
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
        "Mission-operator %s failed: %s", action, err, exc_info=True
    )
    return jsonify({"success": False, "message": DB_ERROR_MESSAGE}), 500


def serialize_assignment(row):
    """Convert one joined database row into a JSON-safe dict."""
    if row is None:
        return None
    return {
        "mission_id": row["mission_id"],
        "mission_type": row["mission_type"],
        "operator_id": row["operator_id"],
        "operator_name": row["operator_name"],
        "duty_role": row["duty_role"],
        "shift": row["shift"],
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


def validate_payload(payload, allowed_fields, include_keys):
    """Check a POST/PUT body and return (cleaned_values, errors)."""
    errors = {}
    cleaned = {}

    if not isinstance(payload, dict):
        return {}, {"body": "Request body must be a JSON object"}

    # Unknown keys are rejected. On PUT this is what refuses an attempt to
    # change mission_id or operator_id, since neither is an accepted field.
    for key in payload:
        if key not in allowed_fields:
            errors[key] = f"{key} is not a recognised field"

    if include_keys:
        mission_id = parse_positive_integer(
            "mission_id", payload.get("mission_id"), errors
        )
        if mission_id is not None:
            cleaned["mission_id"] = mission_id

        operator_id = parse_positive_integer(
            "operator_id", payload.get("operator_id"), errors
        )
        if operator_id is not None:
            cleaned["operator_id"] = operator_id

    # duty_role and shift are free text: required, non-blank, length-limited.
    for field, max_length in TEXT_FIELDS.items():
        value = payload.get(field)

        if value is None:
            errors[field] = f"{field} is required"
            continue
        if not isinstance(value, str):
            errors[field] = f"{field} must be a string"
            continue

        trimmed = value.strip()
        if not trimmed:
            errors[field] = f"{field} must not be empty"
            continue
        if len(trimmed) > max_length:
            errors[field] = f"{field} must be at most {max_length} characters"
            continue

        cleaned[field] = trimmed

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
        "message": "Mission-operator assignment not found"
    }), 404


def duplicate_response():
    """Build the standard HTTP 409 body for a duplicate composite key."""
    return jsonify({
        "success": False,
        "message": "This operator is already assigned to the mission"
    }), 409


def load_parents(cursor, mission_id, operator_id):
    """Fetch both parents and return (mission_row, operator_row, errors)."""
    errors = {}

    cursor.execute(
        "SELECT mission_id, mission_type FROM mission WHERE mission_id = %s",
        (mission_id,)
    )
    mission_row = cursor.fetchone()
    if mission_row is None:
        errors["mission_id"] = "mission_id does not reference an existing mission"

    cursor.execute(
        """
        SELECT operator_id, CONCAT(first_name, ' ', last_name) AS operator_name
          FROM `operator`
         WHERE operator_id = %s
        """,
        (operator_id,)
    )
    operator_row = cursor.fetchone()
    if operator_row is None:
        errors["operator_id"] = "operator_id does not reference an existing operator"

    return mission_row, operator_row, errors


def fetch_assignment(cursor, mission_id, operator_id):
    """Return one joined assignment row, or None."""
    cursor.execute(
        ASSIGNMENT_SELECT + " WHERE mo.mission_id = %s AND mo.operator_id = %s",
        (mission_id, operator_id)
    )
    return cursor.fetchone()


def build_payload(mission_id, operator_id, cleaned, mission_row, operator_row):
    """Build the response body for a created or updated assignment."""
    return {
        "mission_id": mission_id,
        "mission_type": mission_row["mission_type"],
        "operator_id": operator_id,
        "operator_name": operator_row["operator_name"],
        "duty_role": cleaned["duty_role"],
        "shift": cleaned["shift"],
    }


# ============================================================================
# ENDPOINT 1 - list all assignments
# ============================================================================

@mission_operators_bp.route("", methods=["GET"])
def list_assignments():
    """GET /api/mission-operators - every assignment, joined, by full key."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(ASSIGNMENT_SELECT + " ORDER BY mo.mission_id, mo.operator_id")
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

@mission_operators_bp.route("/<int:mission_id>/<int:operator_id>", methods=["GET"])
def get_assignment(mission_id, operator_id):
    """GET /api/mission-operators/<mission_id>/<operator_id> - one, or 404."""
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        row = fetch_assignment(cursor, mission_id, operator_id)

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

@mission_operators_bp.route("", methods=["POST"])
def create_assignment():
    """POST /api/mission-operators - validate, check parents, insert."""
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

        mission_row, operator_row, parent_errors = load_parents(
            cursor, cleaned["mission_id"], cleaned["operator_id"]
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        cursor.execute(
            """
            INSERT INTO mission_operator
                (mission_id, operator_id, duty_role, shift)
            VALUES (%s, %s, %s, %s)
            """,
            (
                cleaned["mission_id"],
                cleaned["operator_id"],
                cleaned["duty_role"],
                cleaned["shift"],
            )
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Mission-operator assignment created successfully",
            "data": build_payload(
                cleaned["mission_id"], cleaned["operator_id"],
                cleaned, mission_row, operator_row
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

@mission_operators_bp.route("/<int:mission_id>/<int:operator_id>", methods=["PUT"])
def update_assignment(mission_id, operator_id):
    """PUT /api/mission-operators/<mission_id>/<operator_id>.

    Only duty_role and shift are editable; the key components come from the
    path and supplying either in the body is rejected.
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
            SELECT mission_id FROM mission_operator
             WHERE mission_id = %s AND operator_id = %s
             FOR UPDATE
            """,
            (mission_id, operator_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        mission_row, operator_row, parent_errors = load_parents(
            cursor, mission_id, operator_id
        )
        if parent_errors:
            connection.rollback()
            return validation_response(parent_errors)

        cursor.execute(
            """
            UPDATE mission_operator
               SET duty_role = %s,
                   shift     = %s
             WHERE mission_id = %s AND operator_id = %s
            """,
            (cleaned["duty_role"], cleaned["shift"], mission_id, operator_id)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Mission-operator assignment updated successfully",
            "data": build_payload(
                mission_id, operator_id, cleaned, mission_row, operator_row
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

@mission_operators_bp.route("/<int:mission_id>/<int:operator_id>", methods=["DELETE"])
def delete_assignment(mission_id, operator_id):
    """DELETE /api/mission-operators/<mission_id>/<operator_id>.

    mission_operator is a leaf, so there is no dependency guard and no
    protected-delete 409. Exactly one assignment row is removed; neither the
    mission nor the operator is touched.
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
            SELECT mission_id FROM mission_operator
             WHERE mission_id = %s AND operator_id = %s
             FOR UPDATE
            """,
            (mission_id, operator_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            return not_found_response()

        cursor.execute(
            "DELETE FROM mission_operator WHERE mission_id = %s AND operator_id = %s",
            (mission_id, operator_id)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Mission-operator assignment deleted successfully"
        }), 200

    except MySQLError as err:
        safe_rollback(connection)
        return db_failure(err, "delete")

    finally:
        close_resources(cursor, connection)
