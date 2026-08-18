"""CRUD API for the telemetry_point weak entity."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from flask import Blueprint, current_app, jsonify, request
from mysql.connector import Error as MySQLError, errorcode
from database import get_db_connection

telemetry_points_bp=Blueprint("telemetry_points",__name__,url_prefix="/api/telemetry-points")
POST_FIELDS={"mission_id","log_no","timestamp","latitude","longitude","depth","battery_level","temperature"}
PUT_FIELDS={"timestamp","latitude","longitude","depth","battery_level","temperature"}
SELECT_SQL="""SELECT tp.mission_id,tp.log_no,tp.timestamp,tp.latitude,tp.longitude,tp.depth,tp.battery_level,tp.temperature,
 m.mission_type,m.status AS mission_status,m.start_time,m.end_time,m.depth_target
 FROM telemetry_point tp JOIN mission m ON m.mission_id=tp.mission_id"""

def close(cur,c):
    try:
        if cur:cur.close()
    except MySQLError:pass
    try:
        if c and c.is_connected():c.close()
    except MySQLError:pass
def rollback(c):
    try:
        if c:c.rollback()
    except MySQLError:pass
def validation(e):return jsonify({"success":False,"message":"Validation failed","errors":e}),400
def not_found():return jsonify({"success":False,"message":"Telemetry point not found"}),404
def duplicate():return jsonify({"success":False,"message":"Telemetry point with this mission and log number already exists"}),409
def parent_fallback():return validation({"parent_reference":"One or more referenced parent records no longer exist"})
def db_error(e,a):current_app.logger.error("Telemetry-point %s failed: %s",a,e,exc_info=True);return jsonify({"success":False,"message":"A database error occurred"}),500
def posint(n,v,e):
    if v is None:e[n]=f"{n} is required"
    elif isinstance(v,bool) or not isinstance(v,int) or not 1<=v<=2147483647:e[n]=f"{n} must be an integer between 1 and 2147483647"
    else:return v
def dt(n,v,e):
    if v is None:e[n]=f"{n} is required";return None
    if not isinstance(v,str):e[n]=f"{n} must be a string";return None
    try:x=datetime.strptime(v,"%Y-%m-%d %H:%M:%S")
    except ValueError:e[n]=f"{n} must be a valid datetime in YYYY-MM-DD HH:MM:SS format";return None
    if x.strftime("%Y-%m-%d %H:%M:%S")!=v:e[n]=f"{n} must be a valid datetime in YYYY-MM-DD HH:MM:SS format";return None
    return x
def dec(n,v,e,lo,hi,scale):
    if v is None:e[n]=f"{n} is required";return None
    if isinstance(v,bool) or not isinstance(v,(int,float)):e[n]=f"{n} must be a valid decimal number";return None
    try:x=Decimal(str(v))
    except (InvalidOperation,ValueError):e[n]=f"{n} must be a valid decimal number";return None
    if not x.is_finite() or x<lo or x>hi:e[n]=f"{n} must be between {lo} and {hi}";return None
    if x.as_tuple().exponent < -scale:e[n]=f"{n} must have at most {scale} decimal places";return None
    return x
def payload(body,fields,keys):
    if not isinstance(body,dict):return {},{"body":"Request body must be a JSON object"}
    e={k:f"{k} is not a recognised field" for k in body if k not in fields};o={}
    if keys:
        for n in ("mission_id","log_no"):
            x=posint(n,body.get(n),e)
            if x is not None:o[n]=x
    x=dt("timestamp",body.get("timestamp"),e)
    if x is not None:o["timestamp"]=x
    specs=(("latitude",-90,90,6),("longitude",-180,180,6),("depth",0,Decimal("999999.99"),2),("battery_level",0,100,2),("temperature",Decimal("-9999.99"),Decimal("9999.99"),2))
    for n,lo,hi,s in specs:
        x=dec(n,body.get(n),e,Decimal(str(lo)),Decimal(str(hi)),s)
        if x is not None:o[n]=x
    return o,e
def mission(cursor,mission_id):cursor.execute("SELECT mission_id,mission_type,status,start_time,end_time,depth_target FROM mission WHERE mission_id=%s",(mission_id,));return cursor.fetchone()
def temporal(m,x,field="timestamp"):
    e={}
    if m["status"]=="Planned":e[field]="Planned missions cannot receive telemetry points"
    elif x<m["start_time"]:e[field]="timestamp must be on or after the mission start_time"
    elif m["end_time"] is not None and x>m["end_time"]:e[field]="timestamp must be on or before the mission end_time"
    return e
def fetch(cur,mid,log):cur.execute(SELECT_SQL+" WHERE tp.mission_id=%s AND tp.log_no=%s",(mid,log));return cur.fetchone()
def serial(r):
    if not r:return None
    r=dict(r)
    for k in ("timestamp","start_time","end_time"):
        if r[k] is not None:r[k]=r[k].strftime("%Y-%m-%d %H:%M:%S")
    for k in ("latitude","longitude","depth","battery_level","temperature","depth_target"):r[k]=float(r[k])
    return r

@telemetry_points_bp.route("",methods=["GET"])
def list_points():
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);cur.execute(SELECT_SQL+" ORDER BY tp.mission_id,tp.log_no");d=[serial(x) for x in cur.fetchall()];return jsonify({"success":True,"count":len(d),"data":d}),200
    except MySQLError as e:return db_error(e,"list")
    finally:close(cur,c)
@telemetry_points_bp.route("/<int:mission_id>/<int:log_no>",methods=["GET"])
def get_point(mission_id,log_no):
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);r=fetch(cur,mission_id,log_no);return (jsonify({"success":True,"data":serial(r)}),200) if r else not_found()
    except MySQLError as e:return db_error(e,"fetch")
    finally:close(cur,c)
@telemetry_points_bp.route("",methods=["POST"])
def create_point():
    v,e=payload(request.get_json(silent=True),POST_FIELDS,True)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();m=mission(cur,v["mission_id"])
        if not m:rollback(c);return validation({"mission_id":"mission_id does not reference an existing mission"})
        e=temporal(m,v["timestamp"])
        if e:rollback(c);return validation(e)
        cur.execute("INSERT INTO telemetry_point(mission_id,log_no,timestamp,latitude,longitude,depth,battery_level,temperature) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",(v["mission_id"],v["log_no"],v["timestamp"],v["latitude"],v["longitude"],v["depth"],v["battery_level"],v["temperature"]));c.commit();r=fetch(cur,v["mission_id"],v["log_no"]);return jsonify({"success":True,"message":"Telemetry point created successfully","data":serial(r)}),201
    except MySQLError as e:
        rollback(c)
        if e.errno==errorcode.ER_DUP_ENTRY:return duplicate()
        if e.errno==errorcode.ER_NO_REFERENCED_ROW_2:return parent_fallback()
        return db_error(e,"create")
    finally:close(cur,c)
@telemetry_points_bp.route("/<int:mission_id>/<int:log_no>",methods=["PUT"])
def update_point(mission_id,log_no):
    v,e=payload(request.get_json(silent=True),PUT_FIELDS,False)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT mission_id FROM telemetry_point WHERE mission_id=%s AND log_no=%s FOR UPDATE",(mission_id,log_no))
        if not cur.fetchone():rollback(c);return not_found()
        m=mission(cur,mission_id);e=temporal(m,v["timestamp"])
        if e:rollback(c);return validation(e)
        cur.execute("UPDATE telemetry_point SET timestamp=%s,latitude=%s,longitude=%s,depth=%s,battery_level=%s,temperature=%s WHERE mission_id=%s AND log_no=%s",(v["timestamp"],v["latitude"],v["longitude"],v["depth"],v["battery_level"],v["temperature"],mission_id,log_no));c.commit();r=fetch(cur,mission_id,log_no);return jsonify({"success":True,"message":"Telemetry point updated successfully","data":serial(r)}),200
    except MySQLError as e:rollback(c);return db_error(e,"update")
    finally:close(cur,c)
@telemetry_points_bp.route("/<int:mission_id>/<int:log_no>",methods=["DELETE"])
def delete_point(mission_id,log_no):
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT mission_id FROM telemetry_point WHERE mission_id=%s AND log_no=%s FOR UPDATE",(mission_id,log_no))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("DELETE FROM telemetry_point WHERE mission_id=%s AND log_no=%s",(mission_id,log_no));c.commit();return jsonify({"success":True,"message":"Telemetry point deleted successfully"}),200
    except MySQLError as e:rollback(c);return db_error(e,"delete")
    finally:close(cur,c)
