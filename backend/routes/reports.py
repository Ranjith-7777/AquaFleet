"""Read-only reporting endpoints backed by AquaFleet SQL views."""

from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError

from database import get_db_connection

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

EXPEDITION_STATUSES = {"Planned", "Active", "Completed", "Cancelled"}
MISSION_STATUSES = {"Planned", "In Progress", "Completed", "Aborted"}
VEHICLE_STATUSES = {"Available", "Deployed", "Maintenance", "Retired"}
INCIDENT_SEVERITIES = {"Low", "Moderate", "High", "Critical"}

EXPEDITION_COLUMNS = (
    "expedition_id, title, vessel_id, vessel_name, home_port, start_date, "
    "end_date, status, budget, mission_count"
)
MISSION_COLUMNS = (
    "mission_id, expedition_id, expedition_title, zone_id, zone_name, region, "
    "mission_type, start_time, end_time, duration_minutes, depth_target, "
    "status, vehicle_count, operator_count"
)
VEHICLE_COLUMNS = (
    "vehicle_id, vehicle_name, vehicle_type, model, max_depth, status, "
    "sensor_count, open_battery_assignment_count, last_maintenance_date, "
    "next_maintenance_due"
)
SAMPLE_COLUMNS = (
    "expedition_id, expedition_title, mission_id, mission_type, sample_id, "
    "sample_type, collected_at, preservation_method, chain_of_custody_status, "
    "aliquot_no, volume_ml, storage_temp"
)
INCIDENT_COLUMNS = (
    "incident_id, mission_id, mission_type, mission_status, expedition_id, "
    "expedition_title, zone_id, zone_name, incident_type, severity, "
    "time_reported, description"
)


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


def validation_response(errors):
    return jsonify({
        "success": False,
        "message": "Validation failed",
        "errors": errors,
    }), 400


def parse_filters(allowed, enum_fields=None, integer_fields=None):
    enum_fields = enum_fields or {}
    integer_fields = integer_fields or set()
    errors = {
        key: f"{key} is not a recognised filter"
        for key in request.args if key not in allowed
    }
    values = {}
    for key, choices in enum_fields.items():
        raw = request.args.get(key)
        if raw in (None, ""):
            continue
        if raw not in choices:
            errors[key] = f"{key} must be one of: {', '.join(sorted(choices))}"
        else:
            values[key] = raw
    for key in integer_fields:
        raw = request.args.get(key)
        if raw in (None, ""):
            continue
        try:
            value = int(raw)
        except (TypeError, ValueError):
            errors[key] = f"{key} must be a positive integer"
            continue
        if value < 1 or str(value) != raw:
            errors[key] = f"{key} must be a positive integer"
        else:
            values[key] = value
    return values, errors


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    return value


def run_report(sql, params, report_name):
    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, tuple(params))
        rows = [
            {key: serialize_value(value) for key, value in row.items()}
            for row in cursor.fetchall()
        ]
        return jsonify({
            "success": True,
            "report": report_name,
            "count": len(rows),
            "data": rows,
        }), 200
    except MySQLError as error:
        current_app.logger.error(
            "Report %s failed: %s", report_name, error, exc_info=True
        )
        return jsonify({
            "success": False,
            "message": "A database error occurred",
        }), 500
    finally:
        close_resources(cursor, connection)


@reports_bp.route("/expeditions", methods=["GET"])
def expedition_summary():
    values, errors = parse_filters(
        {"status"}, enum_fields={"status": EXPEDITION_STATUSES}
    )
    if errors:
        return validation_response(errors)
    sql = f"SELECT {EXPEDITION_COLUMNS} FROM vw_expedition_summary"
    params = []
    if "status" in values:
        sql += " WHERE status = %s"
        params.append(values["status"])
    sql += " ORDER BY start_date DESC, expedition_id DESC"
    return run_report(sql, params, "expedition_summary")


@reports_bp.route("/missions", methods=["GET"])
def mission_operations():
    values, errors = parse_filters(
        {"status", "zone_id"},
        enum_fields={"status": MISSION_STATUSES},
        integer_fields={"zone_id"},
    )
    if errors:
        return validation_response(errors)
    clauses, params = [], []
    if "status" in values:
        clauses.append("status = %s")
        params.append(values["status"])
    if "zone_id" in values:
        clauses.append("zone_id = %s")
        params.append(values["zone_id"])
    sql = f"SELECT {MISSION_COLUMNS} FROM vw_mission_operations"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY start_time DESC, mission_id DESC"
    return run_report(sql, params, "mission_operations")


@reports_bp.route("/vehicle-readiness", methods=["GET"])
def vehicle_readiness():
    values, errors = parse_filters(
        {"status"}, enum_fields={"status": VEHICLE_STATUSES}
    )
    if errors:
        return validation_response(errors)
    sql = f"SELECT {VEHICLE_COLUMNS} FROM vw_vehicle_readiness"
    params = []
    if "status" in values:
        sql += " WHERE status = %s"
        params.append(values["status"])
    sql += " ORDER BY vehicle_name"
    return run_report(sql, params, "vehicle_readiness")


@reports_bp.route("/sample-lineage", methods=["GET"])
def sample_lineage():
    values, errors = parse_filters(
        {"expedition_id", "mission_id"},
        integer_fields={"expedition_id", "mission_id"},
    )
    if errors:
        return validation_response(errors)
    clauses, params = [], []
    for key in ("expedition_id", "mission_id"):
        if key in values:
            clauses.append(f"{key} = %s")
            params.append(values[key])
    sql = f"SELECT {SAMPLE_COLUMNS} FROM vw_sample_lineage"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY collected_at DESC, sample_id, aliquot_no"
    return run_report(sql, params, "sample_lineage")


@reports_bp.route("/incidents", methods=["GET"])
def incident_overview():
    values, errors = parse_filters(
        {"severity", "expedition_id"},
        enum_fields={"severity": INCIDENT_SEVERITIES},
        integer_fields={"expedition_id"},
    )
    if errors:
        return validation_response(errors)
    clauses, params = [], []
    if "severity" in values:
        clauses.append("severity = %s")
        params.append(values["severity"])
    if "expedition_id" in values:
        clauses.append("expedition_id = %s")
        params.append(values["expedition_id"])
    sql = f"SELECT {INCIDENT_COLUMNS} FROM vw_incident_overview"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY time_reported DESC, incident_id DESC"
    return run_report(sql, params, "incident_overview")
