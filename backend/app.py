"""
app.py
------
Entry point of the AquaFleet backend.

This file is deliberately small. It only:
  1. creates the Flask application and configures the session cookie,
  2. enables credentialed CORS for the known frontend origin,
  3. exposes two health-check endpoints:
       GET /api/health           - is Flask itself running?
       GET /api/health/database  - can Flask reach MySQL?
  4. registers the feature Blueprints that live in the `routes/` package,
  5. enforces authentication for every API route in ONE place.

The actual CRUD endpoints are NOT written here. Each resource gets its own
module under `routes/` so this file stays readable.

Run with:
    python app.py
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from mysql.connector import Error as MySQLError

from authentication import guard_authorization, guard_request
from config import Config
from database import get_db_connection
from routes.auth import auth_bp
from routes.battery_packs import battery_packs_bp
from routes.expeditions import expeditions_bp
from routes.incidents import incidents_bp
from routes.inspection_tasks import inspection_tasks_bp
from routes.maintenance_records import maintenance_records_bp
from routes.marine_zones import marine_zones_bp
from routes.mission_operators import mission_operators_bp
from routes.mission_vehicles import mission_vehicles_bp
from routes.missions import missions_bp
from routes.notifications import notifications_bp
from routes.offshore_assets import offshore_assets_bp
from routes.operators import operators_bp
from routes.reports import reports_bp
from routes.sensors import sensors_bp
from routes.sample_aliquots import sample_aliquots_bp
from routes.samples import samples_bp
from routes.telemetry_points import telemetry_points_bp
from routes.vehicle_batteries import vehicle_batteries_bp
from routes.vehicle_sensors import vehicle_sensors_bp
from routes.vehicles import vehicles_bp
from routes.vessels import vessels_bp

# Create the Flask application object.
app = Flask(__name__)

# ---------------------------------------------------------------------------
# Session configuration
# ---------------------------------------------------------------------------
# SECRET_KEY signs the session cookie. Without it Flask cannot keep anyone
# logged in; with a guessable one, anybody could forge a session, which is why
# the built-in development fallback is refused outside DEBUG.
app.config["SECRET_KEY"] = Config.SECRET_KEY
app.config["SESSION_COOKIE_HTTPONLY"] = Config.SESSION_COOKIE_HTTPONLY
app.config["SESSION_COOKIE_SAMESITE"] = Config.SESSION_COOKIE_SAMESITE
app.config["SESSION_COOKIE_SECURE"] = Config.SESSION_COOKIE_SECURE

_secret_warning = Config.check_secret_key()
if _secret_warning:
    if Config.DEBUG:
        app.logger.warning("%s", _secret_warning)
    else:
        raise RuntimeError(_secret_warning)

# ---------------------------------------------------------------------------
# Cross-Origin Resource Sharing
# ---------------------------------------------------------------------------
# The frontend is served from another port, so the browser treats it as a
# different origin. Session cookies only travel cross-origin when the server
# names the exact origin and opts in to credentials - the "*" wildcard is
# forbidden by the browser once credentials are enabled, and would be unsafe
# anyway, since any site could then call this API with the user's cookie.
CORS(
    app,
    resources={r"/api/*": {"origins": Config.CORS_ORIGINS}},
    supports_credentials=True,
)

# Register the feature Blueprints. Each one already carries its own
# url_prefix, so no prefix is needed here.
app.register_blueprint(auth_bp)
app.register_blueprint(vessels_bp)
app.register_blueprint(marine_zones_bp)
app.register_blueprint(vehicles_bp)
app.register_blueprint(operators_bp)
app.register_blueprint(sensors_bp)
app.register_blueprint(battery_packs_bp)
app.register_blueprint(offshore_assets_bp)
app.register_blueprint(expeditions_bp)
app.register_blueprint(missions_bp)
app.register_blueprint(mission_vehicles_bp)
app.register_blueprint(mission_operators_bp)
app.register_blueprint(vehicle_sensors_bp)
app.register_blueprint(vehicle_batteries_bp)
app.register_blueprint(maintenance_records_bp)
app.register_blueprint(telemetry_points_bp)
app.register_blueprint(samples_bp)
app.register_blueprint(sample_aliquots_bp)
app.register_blueprint(incidents_bp)
app.register_blueprint(inspection_tasks_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(reports_bp)


# ---------------------------------------------------------------------------
# Central authentication guard
# ---------------------------------------------------------------------------
# Every API route is protected here rather than by decorating 19 blueprints
# individually. One hook means a new resource module is protected the moment
# it is registered - there is no per-route step to forget - and the complete
# list of things that stay public is visible in one place.
PUBLIC_ENDPOINTS = frozenset({
    "/api/health",           # is Flask up? used before login by the frontend
    "/api/health/database",  # is MySQL reachable?
    "/api/auth/login",       # you cannot be logged in to log in
    "/api/auth/logout",      # idempotent, and safe to call when logged out
})


@app.before_request
def require_authentication():
    """Reject invalid API calls before any route function runs.

    Three categories pass through without a check:

      * OPTIONS - the browser sends CORS preflights without cookies, so
        answering them with 401 would break every cross-origin request
        before the real call was ever made.
      * the public endpoints listed above.
      * anything outside /api/, such as the root page.

    GET /api/auth/me is intentionally NOT public: it is the endpoint the
    frontend asks "am I logged in?", and a 401 is the correct answer when the
    reply is no.

    Everything else is verified against app_user, not merely against the
    cookie. A signed session proves who logged in; it does not prove the
    account is still usable. Checking only the session would let an account
    deactivated a moment ago keep full access until its cookie expired.
    guard_request() performs one indexed lookup, caches the row on flask.g
    for the rest of the request, and clears the session on any terminal
    problem so a stale cookie is rejected exactly once.
    """
    if request.method == "OPTIONS":
        return None
    if not request.path.startswith("/api/"):
        return None
    if request.path in PUBLIC_ENDPOINTS:
        return None
    blocked = guard_request()
    if blocked is not None:
        return blocked
    return guard_authorization()


@app.route("/api/health", methods=["GET"])
def health():
    """Health check used by the frontend to confirm the API is reachable."""
    return jsonify({
        "success": True,
        "message": "AquaFleet API is running"
    })


@app.route("/api/health/database", methods=["GET"])
def database_health():
    """Check that the API can actually reach the MySQL server.

    Opens a connection, asks MySQL which database it is using and which
    version it is, then closes everything again in a finally block so no
    connection is left open even when the query fails.

    Returns 200 when connected, 500 when the connection or query fails.
    The error text is kept short and never includes the password, because
    only the driver's message is returned and credentials are read from
    the environment, not embedded in the query.
    """
    connection = None
    cursor = None

    try:
        connection = get_db_connection()

        # dictionary=True makes fetchone() return {"database_name": ...}
        # instead of a plain tuple, which is easier to read.
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT DATABASE() AS database_name, VERSION() AS mysql_version")
        row = cursor.fetchone()

        return jsonify({
            "success": True,
            "message": "AquaFleet database is connected",
            "database": row["database_name"],
            "mysql_version": row["mysql_version"]
        }), 200

    except MySQLError as err:
        # Log the full driver error to the server console for debugging,
        # but send only a short message back to the browser.
        app.logger.error("Database health check failed: %s", err)
        return jsonify({
            "success": False,
            "message": "Database connection failed",
            "error": "Unable to reach MySQL"
        }), 500

    finally:
        # Runs whether the query succeeded or raised.
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.route("/", methods=["GET"])
def index():
    """Friendly message for anyone opening the backend root URL directly."""
    return jsonify({
        "success": True,
        "message": "AquaFleet backend. Try GET /api/health, "
                   "GET /api/health/database or GET /api/vessels"
    })


@app.errorhandler(404)
def not_found(error):
    """Return JSON (not HTML) for unknown URLs, since this is a REST API."""
    return jsonify({
        "success": False,
        "message": "Endpoint not found"
    }), 404


if __name__ == "__main__":
    # Host, port and debug flag all come from config.py / .env
    app.run(host=Config.FLASK_HOST, port=Config.FLASK_PORT, debug=Config.DEBUG)
