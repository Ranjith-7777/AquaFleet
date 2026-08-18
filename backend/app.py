"""
app.py
------
Entry point of the AquaFleet backend.

This file is deliberately small. It only:
  1. creates the Flask application,
  2. enables CORS so the HTML/JS frontend can call this API,
  3. exposes two health-check endpoints:
       GET /api/health           - is Flask itself running?
       GET /api/health/database  - can Flask reach MySQL?
  4. registers the feature Blueprints that live in the `routes/` package.

The actual CRUD endpoints are NOT written here. Each resource gets its own
module under `routes/` so this file stays readable.

Run with:
    python app.py
"""

from flask import Flask, jsonify
from flask_cors import CORS
from mysql.connector import Error as MySQLError

from config import Config
from database import get_db_connection
from routes.battery_packs import battery_packs_bp
from routes.expeditions import expeditions_bp
from routes.incidents import incidents_bp
from routes.inspection_tasks import inspection_tasks_bp
from routes.maintenance_records import maintenance_records_bp
from routes.marine_zones import marine_zones_bp
from routes.mission_operators import mission_operators_bp
from routes.mission_vehicles import mission_vehicles_bp
from routes.missions import missions_bp
from routes.offshore_assets import offshore_assets_bp
from routes.operators import operators_bp
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

# Enable Cross-Origin Resource Sharing.
# The frontend is opened as a file / on a different port, so the browser
# treats it as a different origin. CORS(app) allows those requests.
CORS(app)

# Register the feature Blueprints. Each one already carries its own
# url_prefix, so no prefix is needed here.
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
            "error": str(err.msg) if getattr(err, "msg", None) else "Unable to reach MySQL"
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
