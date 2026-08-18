"""CRUD API for maintenance_record."""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError, errorcode

from database import get_db_connection

maintenance_records_bp = Blueprint("maintenance_records", __name__, url_prefix="/api/maintenance-records")
POST_FIELDS = {"vehicle_id", "maint_date", "action_taken", "cost", "next_due_date"}
PUT_FIELDS = {"maint_date", "action_taken", "cost", "next_due_date"}
SELECT_SQL = """SELECT mr.maintenance_id,mr.vehicle_id,v.vehicle_name,v.vehicle_type,
 v.status AS vehicle_status,mr.maint_date,mr.action_taken,mr.cost,mr.next_due_date
 FROM maintenance_record mr JOIN auv_rov v ON v.vehicle_id=mr.vehicle_id"""

def close(cursor, connection):
    try:
        if cursor: cursor.close()
    except MySQLError: pass
    try:
        if connection and connection.is_connected(): connection.close()
    except MySQLError: pass

def rollback(connection):
    try:
        if connection: connection.rollback()
    except MySQLError: pass

def validation(errors):
    return jsonify({"success": False, "message": "Validation failed", "errors": errors}), 400

def db_error(err, action):
    current_app.logger.error("Maintenance-record %s failed: %s", action, err, exc_info=True)
    return jsonify({"success": False, "message": "A database error occurred"}), 500

def not_found():
    return jsonify({"success": False, "message": "Maintenance record not found"}), 404

def parent_fallback():
    return validation({"parent_reference": "One or more referenced parent records no longer exist"})

def positive_int(name, value, errors):
    if value is None: errors[name] = f"{name} is required"
    elif isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 2147483647:
        errors[name] = f"{name} must be an integer between 1 and 2147483647"
    else: return value

def strict_date(name, value, errors, nullable=False):
    if value is None:
        if nullable: return None
        errors[name] = f"{name} is required"; return None
    if not isinstance(value, str): errors[name] = f"{name} must be a string"; return None
    try: parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError: errors[name] = f"{name} must be a valid date in YYYY-MM-DD format"; return None
    if parsed.strftime("%Y-%m-%d") != value:
        errors[name] = f"{name} must be a valid date in YYYY-MM-DD format"; return None
    return parsed

def decimal_value(name, value, errors, low, high, scale):
    if value is None: errors[name] = f"{name} is required"; return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors[name] = f"{name} must be a valid decimal number"; return None
    try: number = Decimal(str(value))
    except (InvalidOperation, ValueError): errors[name] = f"{name} must be a valid decimal number"; return None
    if not number.is_finite() or number < low or number > high:
        errors[name] = f"{name} must be between {low} and {high}"; return None
    if number.as_tuple().exponent < -scale:
        errors[name] = f"{name} must have at most {scale} decimal places"; return None
    return number

def text_value(value, errors):
    if value is None: errors["action_taken"] = "action_taken is required"
    elif not isinstance(value, str): errors["action_taken"] = "action_taken must be a string"
    else:
        value = value.strip()
        if not value: errors["action_taken"] = "action_taken must not be empty"
        elif len(value.encode("utf-8")) > 65535: errors["action_taken"] = "action_taken must not exceed 65535 UTF-8 bytes"
        else: return value

def validate_payload(payload, fields, include_parent):
    if not isinstance(payload, dict): return {}, {"body": "Request body must be a JSON object"}
    errors = {k: f"{k} is not a recognised field" for k in payload if k not in fields}; out = {}
    if include_parent:
        value = positive_int("vehicle_id", payload.get("vehicle_id"), errors)
        if value is not None: out["vehicle_id"] = value
    maint = strict_date("maint_date", payload.get("maint_date"), errors)
    if maint is not None:
        out["maint_date"] = maint
        if maint > date.today(): errors["maint_date"] = "maint_date cannot be in the future"
    action = text_value(payload.get("action_taken"), errors)
    if action is not None: out["action_taken"] = action
    cost = decimal_value("cost", payload.get("cost"), errors, Decimal("0"), Decimal("9999999999.99"), 2)
    if cost is not None: out["cost"] = cost
    if "next_due_date" not in payload: errors["next_due_date"] = "next_due_date is required"
    else:
        due = strict_date("next_due_date", payload.get("next_due_date"), errors, nullable=True)
        if payload.get("next_due_date") is None or due is not None: out["next_due_date"] = due
        if due is not None and maint is not None and due < maint: errors["next_due_date"] = "next_due_date must be on or after maint_date"
    return out, errors

def serialize(row):
    if not row: return None
    row = dict(row)
    for key in ("maint_date", "next_due_date"):
        if row[key] is not None: row[key] = row[key].isoformat()
    row["cost"] = float(row["cost"])
    return row

def fetch(cursor, record_id):
    cursor.execute(SELECT_SQL + " WHERE mr.maintenance_id=%s", (record_id,)); return cursor.fetchone()

@maintenance_records_bp.route("", methods=["GET"])
def list_records():
    c = cur = None
    try:
        c=get_db_connection(); cur=c.cursor(dictionary=True); cur.execute(SELECT_SQL+" ORDER BY mr.maintenance_id")
        data=[serialize(r) for r in cur.fetchall()]; return jsonify({"success":True,"count":len(data),"data":data}),200
    except MySQLError as err: return db_error(err,"list")
    finally: close(cur,c)

@maintenance_records_bp.route("/<int:maintenance_id>", methods=["GET"])
def get_record(maintenance_id):
    c=cur=None
    try:
        c=get_db_connection(); cur=c.cursor(dictionary=True); row=fetch(cur,maintenance_id)
        return (jsonify({"success":True,"data":serialize(row)}),200) if row else not_found()
    except MySQLError as err: return db_error(err,"fetch")
    finally: close(cur,c)

@maintenance_records_bp.route("", methods=["POST"])
def create_record():
    values,errors=validate_payload(request.get_json(silent=True),POST_FIELDS,True)
    if errors:return validation(errors)
    c=cur=None
    try:
        c=get_db_connection(); c.autocommit=False; cur=c.cursor(dictionary=True); c.start_transaction()
        cur.execute("SELECT vehicle_id FROM auv_rov WHERE vehicle_id=%s",(values["vehicle_id"],))
        if not cur.fetchone(): rollback(c); return validation({"vehicle_id":"vehicle_id does not reference an existing vehicle"})
        cur.execute("INSERT INTO maintenance_record(vehicle_id,maint_date,action_taken,cost,next_due_date) VALUES(%s,%s,%s,%s,%s)",(values["vehicle_id"],values["maint_date"],values["action_taken"],values["cost"],values["next_due_date"]))
        record_id=cur.lastrowid; c.commit(); row=fetch(cur,record_id)
        return jsonify({"success":True,"message":"Maintenance record created successfully","data":serialize(row)}),201
    except MySQLError as err:
        rollback(c)
        if err.errno==errorcode.ER_NO_REFERENCED_ROW_2:return parent_fallback()
        return db_error(err,"create")
    finally:close(cur,c)

@maintenance_records_bp.route("/<int:maintenance_id>", methods=["PUT"])
def update_record(maintenance_id):
    values,errors=validate_payload(request.get_json(silent=True),PUT_FIELDS,False)
    if errors:return validation(errors)
    c=cur=None
    try:
        c=get_db_connection(); c.autocommit=False; cur=c.cursor(dictionary=True); c.start_transaction()
        cur.execute("SELECT maintenance_id FROM maintenance_record WHERE maintenance_id=%s FOR UPDATE",(maintenance_id,))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("UPDATE maintenance_record SET maint_date=%s,action_taken=%s,cost=%s,next_due_date=%s WHERE maintenance_id=%s",(values["maint_date"],values["action_taken"],values["cost"],values["next_due_date"],maintenance_id));c.commit();row=fetch(cur,maintenance_id)
        return jsonify({"success":True,"message":"Maintenance record updated successfully","data":serialize(row)}),200
    except MySQLError as err:rollback(c);return db_error(err,"update")
    finally:close(cur,c)

@maintenance_records_bp.route("/<int:maintenance_id>", methods=["DELETE"])
def delete_record(maintenance_id):
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT maintenance_id FROM maintenance_record WHERE maintenance_id=%s FOR UPDATE",(maintenance_id,))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("DELETE FROM maintenance_record WHERE maintenance_id=%s",(maintenance_id,));c.commit();return jsonify({"success":True,"message":"Maintenance record deleted successfully"}),200
    except MySQLError as err:rollback(c);return db_error(err,"delete")
    finally:close(cur,c)
