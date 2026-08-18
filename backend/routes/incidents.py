"""CRUD API for mission incidents."""
from datetime import datetime
from flask import Blueprint,current_app,jsonify,request
from mysql.connector import Error as MySQLError,errorcode
from database import get_db_connection
incidents_bp=Blueprint("incidents",__name__,url_prefix="/api/incidents")
POST_FIELDS={"mission_id","incident_type","severity","time_reported","description"};PUT_FIELDS={"incident_type","severity","time_reported","description"};SEVERITIES={"Low","Moderate","High","Critical"}
SELECT_SQL="""SELECT i.incident_id,i.mission_id,i.incident_type,i.severity,i.time_reported,i.description,
 m.mission_type,m.status AS mission_status,m.start_time,m.end_time FROM incident i JOIN mission m ON m.mission_id=i.mission_id"""
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
def not_found():return jsonify({"success":False,"message":"Incident not found"}),404
def fallback():return validation({"parent_reference":"One or more referenced parent records no longer exist"})
def db_error(e,a):current_app.logger.error("Incident %s failed: %s",a,e,exc_info=True);return jsonify({"success":False,"message":"A database error occurred"}),500
def posint(n,v,e):
    if v is None:e[n]=f"{n} is required"
    elif isinstance(v,bool) or not isinstance(v,int) or not 1<=v<=2147483647:e[n]=f"{n} must be an integer between 1 and 2147483647"
    else:return v
def text(n,v,e,maxlen=None,byte_limit=False):
    if v is None:e[n]=f"{n} is required"
    elif not isinstance(v,str):e[n]=f"{n} must be a string"
    else:
        v=v.strip()
        if not v:e[n]=f"{n} must not be empty"
        elif maxlen and len(v)>maxlen:e[n]=f"{n} must be at most {maxlen} characters"
        elif byte_limit and len(v.encode("utf-8"))>65535:e[n]=f"{n} must not exceed 65535 UTF-8 bytes"
        else:return v
def dt(v,e):
    n="time_reported"
    if v is None:e[n]=f"{n} is required";return None
    if not isinstance(v,str):e[n]=f"{n} must be a string";return None
    try:x=datetime.strptime(v,"%Y-%m-%d %H:%M:%S")
    except ValueError:e[n]=f"{n} must be a valid datetime in YYYY-MM-DD HH:MM:SS format";return None
    if x.strftime("%Y-%m-%d %H:%M:%S")!=v:e[n]=f"{n} must be a valid datetime in YYYY-MM-DD HH:MM:SS format";return None
    return x
def payload(body,fields,parent):
    if not isinstance(body,dict):return {},{"body":"Request body must be a JSON object"}
    e={k:f"{k} is not a recognised field" for k in body if k not in fields};o={}
    if parent:
        x=posint("mission_id",body.get("mission_id"),e)
        if x is not None:o["mission_id"]=x
    x=text("incident_type",body.get("incident_type"),e,100)
    if x is not None:o["incident_type"]=x
    x=text("description",body.get("description"),e,byte_limit=True)
    if x is not None:o["description"]=x
    x=dt(body.get("time_reported"),e)
    if x is not None:o["time_reported"]=x
    s=body.get("severity")
    if s is None:e["severity"]="severity is required"
    elif not isinstance(s,str) or s not in SEVERITIES:e["severity"]="severity must be one of: Low, Moderate, High, Critical"
    else:o["severity"]=s
    return o,e
def mission(cur,mid):cur.execute("SELECT mission_id,status,start_time,end_time FROM mission WHERE mission_id=%s",(mid,));return cur.fetchone()
def temporal(m,x):
    if m["status"]=="Planned":return {"time_reported":"Planned missions cannot receive incidents"}
    if x<m["start_time"]:return {"time_reported":"time_reported must be on or after the mission start_time"}
    if m["end_time"] is not None and x>m["end_time"]:return {"time_reported":"time_reported must be on or before the mission end_time"}
    return {}
def fetch(cur,iid):cur.execute(SELECT_SQL+" WHERE i.incident_id=%s",(iid,));return cur.fetchone()
def serial(r):
    if not r:return None
    r=dict(r)
    for k in ("time_reported","start_time","end_time"):
        if r[k] is not None:r[k]=r[k].strftime("%Y-%m-%d %H:%M:%S")
    return r
@incidents_bp.route("",methods=["GET"])
def list_incidents():
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);cur.execute(SELECT_SQL+" ORDER BY i.incident_id");d=[serial(x) for x in cur.fetchall()];return jsonify({"success":True,"count":len(d),"data":d}),200
    except MySQLError as e:return db_error(e,"list")
    finally:close(cur,c)
@incidents_bp.route("/<int:incident_id>",methods=["GET"])
def get_incident(incident_id):
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);r=fetch(cur,incident_id);return (jsonify({"success":True,"data":serial(r)}),200) if r else not_found()
    except MySQLError as e:return db_error(e,"fetch")
    finally:close(cur,c)
@incidents_bp.route("",methods=["POST"])
def create_incident():
    v,e=payload(request.get_json(silent=True),POST_FIELDS,True)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();m=mission(cur,v["mission_id"])
        if not m:rollback(c);return validation({"mission_id":"mission_id does not reference an existing mission"})
        e=temporal(m,v["time_reported"])
        if e:rollback(c);return validation(e)
        cur.execute("INSERT INTO incident(mission_id,incident_type,severity,time_reported,description) VALUES(%s,%s,%s,%s,%s)",(v["mission_id"],v["incident_type"],v["severity"],v["time_reported"],v["description"]));iid=cur.lastrowid;c.commit();r=fetch(cur,iid);return jsonify({"success":True,"message":"Incident created successfully","data":serial(r)}),201
    except MySQLError as e:
        rollback(c)
        if e.errno==errorcode.ER_NO_REFERENCED_ROW_2:return fallback()
        return db_error(e,"create")
    finally:close(cur,c)
@incidents_bp.route("/<int:incident_id>",methods=["PUT"])
def update_incident(incident_id):
    v,e=payload(request.get_json(silent=True),PUT_FIELDS,False)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT mission_id FROM incident WHERE incident_id=%s FOR UPDATE",(incident_id,));row=cur.fetchone()
        if not row:rollback(c);return not_found()
        m=mission(cur,row["mission_id"]);e=temporal(m,v["time_reported"])
        if e:rollback(c);return validation(e)
        cur.execute("UPDATE incident SET incident_type=%s,severity=%s,time_reported=%s,description=%s WHERE incident_id=%s",(v["incident_type"],v["severity"],v["time_reported"],v["description"],incident_id));c.commit();r=fetch(cur,incident_id);return jsonify({"success":True,"message":"Incident updated successfully","data":serial(r)}),200
    except MySQLError as e:rollback(c);return db_error(e,"update")
    finally:close(cur,c)
@incidents_bp.route("/<int:incident_id>",methods=["DELETE"])
def delete_incident(incident_id):
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT incident_id FROM incident WHERE incident_id=%s FOR UPDATE",(incident_id,))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("DELETE FROM incident WHERE incident_id=%s",(incident_id,));c.commit();return jsonify({"success":True,"message":"Incident deleted successfully"}),200
    except MySQLError as e:rollback(c);return db_error(e,"delete")
    finally:close(cur,c)
