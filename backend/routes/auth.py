"""
routes/auth.py
--------------
Session authentication for the AquaFleet web application.

    POST /api/auth/login    exchange credentials for a session cookie
    GET  /api/auth/me       who is logged in right now
    POST /api/auth/logout   drop the session

Conventions match the resource modules: parameterized SQL, dictionary cursors
for reads, cleanup in finally blocks, full error logging server-side and a
generic message to the client.

THREE RULES SPECIFIC TO THIS MODULE
-----------------------------------
1. A wrong username and a wrong password produce the SAME 401 and the same
   message. Distinguishing them would turn the login form into a tool for
   discovering which accounts exist.

2. password_hash leaves the database only to be handed to
   check_password_hash. It is never placed in a response, never logged and
   never stored in the session.

3. Nothing about identity is taken from the request. The body carries a
   username and a password and nothing else - user_id and role are read from
   the stored row, so a client cannot promote itself by sending
   {"role": "ADMIN"}. Unknown fields are rejected outright.
"""

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError
from werkzeug.security import check_password_hash

from authentication import (
    close_resources,
    current_user,
    end_session,
    inactive_account_response,
    public_user,
    start_session,
)
from database import get_db_connection

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# ============================================================================
# Validation rules
# ============================================================================

# The only two fields a login request may carry.
ALLOWED_LOGIN_FIELDS = {"username", "password"}

# Matches app_user.username. Anything longer cannot be a real account, so it
# is rejected before it reaches the database.
USERNAME_MAX_LENGTH = 50

# An upper bound on the password, so an enormous string cannot be used to
# make the server spend time hashing. Well above any realistic passphrase.
PASSWORD_MAX_LENGTH = 200

# One message for every credential failure - see rule 1 above.
INVALID_CREDENTIALS_MESSAGE = "Invalid username or password"

DB_ERROR_MESSAGE = "A database error occurred"


def validation_response(errors):
    """The standard HTTP 400 body, matching every other module."""
    return jsonify({
        "success": False,
        "message": "Validation failed",
        "errors": errors
    }), 400


def invalid_credentials_response():
    """HTTP 401 used for an unknown username AND for a wrong password."""
    return jsonify({
        "success": False,
        "message": INVALID_CREDENTIALS_MESSAGE
    }), 401


def db_failure(err, action):
    """Log a driver error in full and return the safe 500 response."""
    current_app.logger.error("Auth %s failed: %s", action, err, exc_info=True)
    return jsonify({"success": False, "message": DB_ERROR_MESSAGE}), 500


def validate_login_payload(payload):
    """Check a login body and return (credentials, errors).

    The username is trimmed because a trailing space is a typing slip rather
    than part of an identifier. The password is NOT trimmed or normalized in
    any way - leading and trailing spaces are legitimate password characters,
    and silently removing them would reject a correct password.
    """
    errors = {}
    credentials = {}

    if not isinstance(payload, dict):
        return {}, {"body": "Request body must be a JSON object"}

    for key in payload:
        if key not in ALLOWED_LOGIN_FIELDS:
            errors[key] = f"{key} is not a recognised field"

    username = payload.get("username")
    if username is None:
        errors["username"] = "username is required"
    elif not isinstance(username, str):
        errors["username"] = "username must be a string"
    else:
        trimmed = username.strip()
        if not trimmed:
            errors["username"] = "username must not be empty"
        elif len(trimmed) > USERNAME_MAX_LENGTH:
            errors["username"] = (
                f"username must be at most {USERNAME_MAX_LENGTH} characters"
            )
        else:
            credentials["username"] = trimmed

    password = payload.get("password")
    if password is None:
        errors["password"] = "password is required"
    elif not isinstance(password, str):
        errors["password"] = "password must be a string"
    elif not password:
        errors["password"] = "password must not be empty"
    elif len(password) > PASSWORD_MAX_LENGTH:
        errors["password"] = (
            f"password must be at most {PASSWORD_MAX_LENGTH} characters"
        )
    else:
        # Stored exactly as sent.
        credentials["password"] = password

    return credentials, errors


# ============================================================================
# POST /api/auth/login
# ============================================================================

@auth_bp.route("/login", methods=["POST"])
def login():
    """Verify credentials and establish a session."""
    # silent=True turns malformed JSON into None instead of Flask's own HTML
    # error page, so the client always receives our JSON shape.
    payload = request.get_json(silent=True)

    if payload is None:
        return validation_response({"body": "Request body must be a JSON object"})

    credentials, errors = validate_login_payload(payload)
    if errors:
        return validation_response(errors)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # password_hash is selected here and nowhere else in the application.
        cursor.execute(
            """
            SELECT user_id, username, password_hash, full_name, role, is_active
              FROM app_user
             WHERE username = %s
            """,
            (credentials["username"],)
        )
        row = cursor.fetchone()

        # Unknown username: same response as a wrong password.
        if row is None:
            current_app.logger.info("Login rejected: unknown username")
            return invalid_credentials_response()

        if not check_password_hash(row["password_hash"], credentials["password"]):
            # The username is logged, the password never is.
            current_app.logger.info(
                "Login rejected: bad password for %s", row["username"]
            )
            return invalid_credentials_response()

        # Credentials are correct from here on, so a deactivated account gets
        # the more useful 403 rather than a misleading 401.
        if not row["is_active"]:
            current_app.logger.info(
                "Login rejected: inactive account %s", row["username"]
            )
            return inactive_account_response()

        # Clears any previous session and reissues the signed cookie.
        start_session(row)
        current_app.logger.info("Login succeeded for %s", row["username"])

        return jsonify({
            "success": True,
            "message": "Login successful",
            "data": public_user(row)
        }), 200

    except MySQLError as err:
        return db_failure(err, "login")

    finally:
        close_resources(cursor, connection)


# ============================================================================
# GET /api/auth/me
# ============================================================================

@auth_bp.route("/me", methods=["GET"])
def me():
    """Return the logged-in profile.

    /api/auth/me is a protected route, so the central guard in app.py has
    already verified the session against app_user before this function runs
    and answered 401 / 403 / 500 itself if anything was wrong. The verified
    row is waiting on flask.g, so there is nothing left to look up here - the
    database is queried once per request, not twice.
    """
    user = current_user()

    if user is None:
        # Only reachable if this route is ever called outside the guard.
        return jsonify({
            "success": False,
            "message": "Authentication required"
        }), 401

    return jsonify({
        "success": True,
        "message": "Authenticated",
        "data": public_user(user)
    }), 200


# ============================================================================
# POST /api/auth/logout
# ============================================================================

@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Drop the session.

    Idempotent by design: logging out twice, or logging out without ever
    having logged in, is a 200 either way. There is nothing useful to report
    in the difference, and a client tidying up its state should not have to
    handle an error.
    """
    end_session()
    return jsonify({
        "success": True,
        "message": "Logout successful"
    }), 200
