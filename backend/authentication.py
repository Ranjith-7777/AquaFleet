"""
authentication.py
-----------------
Session helpers shared by the authentication blueprint and the central route
guard in app.py.

Deliberately generic: this module knows what a logged-in session looks like
and how to say "no", and nothing at all about vessels, missions or any other
resource. Adding a new resource never requires touching this file.

WHAT COUNTS AS LOGGED IN
------------------------
Flask's session is a cookie signed with SECRET_KEY. The browser can read it
but cannot alter it without invalidating the signature, so the identity in it
is trustworthy - which is why the server reads user_id, username and role from
the session and never from the request body. A client claiming to be an ADMIN
is ignored.

The session is still only a claim about who logged in, not proof the account
is still valid. A cookie issued this morning says nothing about whether the
account was deactivated or deleted this afternoon, so `verify_request_user`
re-reads the row from MySQL on EVERY protected request. That costs one
indexed primary-key lookup per call, which is the right trade: without it a
deactivated account keeps full access until its cookie happens to expire.

The verified row is cached on `flask.g` for the life of the request, so the
lookup happens once no matter how many helpers ask for the current user.
"""

from functools import wraps

from flask import current_app, g, jsonify, session
from mysql.connector import Error as MySQLError

from database import get_db_connection

# Session keys. Kept in one place so the blueprint and the guard cannot drift.
SESSION_USER_ID = "user_id"
SESSION_USERNAME = "username"
SESSION_FULL_NAME = "full_name"
SESSION_ROLE = "role"

# Columns safe to send to a client. password_hash is absent by construction:
# no query in the application ever selects it except the login check itself.
PUBLIC_USER_COLUMNS = "user_id, username, full_name, role, is_active"


def close_resources(cursor, connection):
    """Release the cursor and the connection, ignoring anything already closed.

    Called from finally blocks, so it must never raise and mask the original
    error. Matches the helper used by every route module.
    """
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


def start_session(user):
    """Establish a fresh logged-in session for `user`.

    session.clear() first is not cosmetic: it drops anything left from a
    previous login so a stale key can never survive into the new session, and
    Flask reissues the signed cookie, so the pre-login cookie value stops
    being usable.

    Only server-derived values are stored. Nothing from the request body
    reaches the session.
    """
    session.clear()
    session[SESSION_USER_ID] = user["user_id"]
    session[SESSION_USERNAME] = user["username"]
    session[SESSION_FULL_NAME] = user["full_name"]
    session[SESSION_ROLE] = user["role"]


def end_session():
    """Drop every session key. Safe to call when nobody is logged in."""
    session.clear()


def is_authenticated():
    """True when the signed cookie carries a user id.

    A cheap check with no database round trip - suitable for the request
    guard, which runs on every call. Use `load_current_user` when the account
    must be confirmed to still exist and be active.
    """
    return session.get(SESSION_USER_ID) is not None


def session_user():
    """Return the identity held in the session, or None."""
    if not is_authenticated():
        return None
    return {
        "user_id": session.get(SESSION_USER_ID),
        "username": session.get(SESSION_USERNAME),
        "full_name": session.get(SESSION_FULL_NAME),
        "role": session.get(SESSION_ROLE),
    }


def verify_request_user():
    """Validate the signed session against app_user. ONE parameterized SELECT.

    This is what makes a deactivation take effect immediately instead of at
    cookie expiry. It runs on every protected request.

    Returns (user, problem) where exactly one is None:

        (row,  None)              - account exists, is active, identity matches
        (None, "unauthenticated") - no session at all
        (None, "missing")         - session points at a deleted account
        (None, "inactive")        - account exists but has been deactivated
        (None, "mismatch")        - the session names a different username
                                    than the row now holds, so the identity
                                    the cookie asserts is no longer true
        (None, "error")           - the lookup itself failed

    password_hash is never selected. The result is cached on flask.g, so a
    later caller in the same request - /api/auth/me, for instance - reuses it
    rather than querying again.
    """
    if not is_authenticated():
        return None, "unauthenticated"

    # Already verified earlier in this same request.
    cached = getattr(g, "current_user", None)
    if cached is not None:
        return cached, None

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT {PUBLIC_USER_COLUMNS} FROM app_user WHERE user_id = %s",
            (session.get(SESSION_USER_ID),)
        )
        row = cursor.fetchone()

        if row is None:
            return None, "missing"
        if not row["is_active"]:
            return None, "inactive"

        # The cookie asserts a username as well as an id. If the stored row
        # no longer agrees, the assertion is stale and the session should not
        # be honoured - the id may since have been reused by another person.
        if row["username"] != session.get(SESSION_USERNAME):
            return None, "mismatch"

        # The database row - not the cookie - is the source of truth for
        # full_name and role, so a change made by an administrator takes
        # effect without the person having to log in again.
        g.current_user = row
        return row, None

    except MySQLError as err:
        current_app.logger.error(
            "Verifying the current user failed: %s", err, exc_info=True
        )
        return None, "error"

    finally:
        close_resources(cursor, connection)


def current_user():
    """The row verified for this request, or None outside a verified request."""
    return getattr(g, "current_user", None)


def public_user(row):
    """Shape a database row into the profile the API returns.

    is_active is dropped as well as password_hash: a client only ever sees
    active accounts, so the flag carries no information for it.
    """
    return {
        "user_id": row["user_id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"],
    }


def authentication_required_response():
    """The single 401 body used for every unauthenticated API request."""
    return jsonify({
        "success": False,
        "message": "Authentication required"
    }), 401


def inactive_account_response():
    """HTTP 403 for a session whose account has been deactivated.

    Distinct from 401: the session was genuine, so "authenticate again" is
    the wrong instruction - signing in will not help until an administrator
    reactivates the account.

    error_code lets the frontend tell this apart from any FUTURE 403 that
    means "you are logged in but not allowed to do this". Only this specific
    code ends the session on the client; an ordinary authorization refusal
    must not log anybody out. Matching on the message text would be fragile,
    so the machine-readable code is what clients branch on.
    """
    return jsonify({
        "success": False,
        "message": "This account is inactive. Contact an administrator.",
        "error_code": "ACCOUNT_INACTIVE"
    }), 403


def database_error_response():
    """HTTP 500 when the verification lookup itself fails."""
    return jsonify({
        "success": False,
        "message": "A database error occurred"
    }), 500


def guard_request():
    """Verify the session and return an error response, or None to proceed.

    Shared by the central before_request hook and by `login_required`, so
    both produce identical outcomes. The session is cleared for every
    terminal problem, so a browser holding a stale cookie stops presenting
    it after one rejected call.
    """
    user, problem = verify_request_user()

    if problem is None:
        return None
    if problem == "unauthenticated":
        return authentication_required_response()
    if problem == "error":
        return database_error_response()

    # "missing", "inactive" and "mismatch" all mean the cookie is no longer
    # backed by a usable account, so it is discarded here.
    end_session()

    if problem == "inactive":
        return inactive_account_response()
    return authentication_required_response()


def login_required(view):
    """Decorator form of the guard, for routes outside the central check.

    app.py protects the resource blueprints with one before_request hook, so
    this is not needed there. It exists for anything registered later that
    should be protected on its own terms, and it performs the same full
    database verification rather than a cheaper session-only check.
    """
    @wraps(view)
    def wrapper(*args, **kwargs):
        blocked = guard_request()
        if blocked is not None:
            return blocked
        return view(*args, **kwargs)
    return wrapper
