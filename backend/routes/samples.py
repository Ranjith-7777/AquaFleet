"""CRUD API for marine samples, including protected deletion."""
from datetime import datetime
from flask import Blueprint,current_app,jsonify,request
from mysql.connector import Error as MySQLError,errorcode
from database import get_db_connection

samples_bp=Blueprint("samples",__name__,url_prefix="/api/samples")
POST_FIELDS={"mission_id","sample_type","collected_at","preservation_method","chain_of_custody_status"}
PUT_FIELDS={"sample_type","collected_at","preservation_method","chain_of_custody_status"}
STATUSES={"Collected","Sealed","In Transit","Received","Stored","Released","Disposed"}
SELECT_SQL="""SELECT s.sample_id,s.mission_id,s.sample_type,s.collected_at,s.preservation_method,s.chain_of_custody_status,
 m.mission_type,m.status AS mission_status,m.start_time,m.end_time,COUNT(sa.aliquot_no) AS aliquot_count
 FROM sample s JOIN mission m ON m.mission_id=s.mission_id LEFT JOIN sample_aliquot sa ON sa.sample_id=s.sample_id"""
GROUP=" GROUP BY s.sample_id,s.mission_id,s.sample_type,s.collected_at,s.preservation_method,s.chain_of_custody_status,m.mission_type,m.status,m.start_time,m.end_time"
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
def parent_fallback():return validation({"parent_reference":"One or more referenced parent records no longer exist"})
def not_found():return jsonify({"success":False,"message":"Sample not found"}),404
def db_error(e,a):current_app.logger.error("Sample %s failed: %s",a,e,exc_info=True);return jsonify({"success":False,"message":"A database error occurred"}),500
def posint(n,v,e):
    if v is None:e[n]=f"{n} is required"
    elif isinstance(v,bool) or not isinstance(v,int) or not 1<=v<=2147483647:e[n]=f"{n} must be an integer between 1 and 2147483647"
    else:return v
def text(n,v,e,maxlen):
    if v is None:e[n]=f"{n} is required"
    elif not isinstance(v,str):e[n]=f"{n} must be a string"
    else:
        v=v.strip()
        if not v:e[n]=f"{n} must not be empty"
        elif len(v)>maxlen:e[n]=f"{n} must be at most {maxlen} characters"
        else:return v
def dt(v,e):
    n="collected_at"
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
    for n,m in (("sample_type",80),("preservation_method",120)):
        x=text(n,body.get(n),e,m)
        if x is not None:o[n]=x
    x=dt(body.get("collected_at"),e)
    if x is not None:o["collected_at"]=x
    status=body.get("chain_of_custody_status")
    if status is None:e["chain_of_custody_status"]="chain_of_custody_status is required"
    elif not isinstance(status,str) or status not in STATUSES:e["chain_of_custody_status"]="chain_of_custody_status must be one of: Collected, Sealed, In Transit, Received, Stored, Released, Disposed"
    else:o["chain_of_custody_status"]=status
    return o,e
def mission(cur,mid):cur.execute("SELECT mission_id,status,start_time,end_time FROM mission WHERE mission_id=%s",(mid,));return cur.fetchone()
def temporal(m,x):
    if m["status"]=="Planned":return {"collected_at":"Planned missions cannot receive samples"}
    if x<m["start_time"]:return {"collected_at":"collected_at must be on or after the mission start_time"}
    if m["end_time"] is not None and x>m["end_time"]:return {"collected_at":"collected_at must be on or before the mission end_time"}
    return {}
def fetch(cur,sid):cur.execute(SELECT_SQL+" WHERE s.sample_id=%s"+GROUP,(sid,));return cur.fetchone()
def serial(r):
    if not r:return None
    r=dict(r);r["aliquot_count"]=int(r["aliquot_count"])
    for k in ("collected_at","start_time","end_time"):
        if r[k] is not None:r[k]=r[k].strftime("%Y-%m-%d %H:%M:%S")
    return r
@samples_bp.route("",methods=["GET"])
def list_samples():
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);cur.execute(SELECT_SQL+GROUP+" ORDER BY s.sample_id");d=[serial(x) for x in cur.fetchall()];return jsonify({"success":True,"count":len(d),"data":d}),200
    except MySQLError as e:return db_error(e,"list")
    finally:close(cur,c)
@samples_bp.route("/<int:sample_id>",methods=["GET"])
def get_sample(sample_id):
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);r=fetch(cur,sample_id);return (jsonify({"success":True,"data":serial(r)}),200) if r else not_found()
    except MySQLError as e:return db_error(e,"fetch")
    finally:close(cur,c)
@samples_bp.route("",methods=["POST"])
def create_sample():
    v,e=payload(request.get_json(silent=True),POST_FIELDS,True)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();m=mission(cur,v["mission_id"])
        if not m:rollback(c);return validation({"mission_id":"mission_id does not reference an existing mission"})
        e=temporal(m,v["collected_at"])
        if e:rollback(c);return validation(e)
        cur.execute("INSERT INTO sample(mission_id,sample_type,collected_at,preservation_method,chain_of_custody_status) VALUES(%s,%s,%s,%s,%s)",(v["mission_id"],v["sample_type"],v["collected_at"],v["preservation_method"],v["chain_of_custody_status"]));sid=cur.lastrowid;c.commit();r=fetch(cur,sid);return jsonify({"success":True,"message":"Sample created successfully","data":serial(r)}),201
    except MySQLError as e:
        rollback(c)
        if e.errno==errorcode.ER_NO_REFERENCED_ROW_2:return parent_fallback()
        return db_error(e,"create")
    finally:close(cur,c)
@samples_bp.route("/<int:sample_id>",methods=["PUT"])
def update_sample(sample_id):
    v,e=payload(request.get_json(silent=True),PUT_FIELDS,False)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT mission_id FROM sample WHERE sample_id=%s FOR UPDATE",(sample_id,));row=cur.fetchone()
        if not row:rollback(c);return not_found()
        m=mission(cur,row["mission_id"]);e=temporal(m,v["collected_at"])
        if e:rollback(c);return validation(e)
        cur.execute("UPDATE sample SET sample_type=%s,collected_at=%s,preservation_method=%s,chain_of_custody_status=%s WHERE sample_id=%s",(v["sample_type"],v["collected_at"],v["preservation_method"],v["chain_of_custody_status"],sample_id));c.commit();r=fetch(cur,sample_id);return jsonify({"success":True,"message":"Sample updated successfully","data":serial(r)}),200
    except MySQLError as e:rollback(c);return db_error(e,"update")
    finally:close(cur,c)
@samples_bp.route("/<int:sample_id>",methods=["DELETE"])
def delete_sample(sample_id):
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT sample_id FROM sample WHERE sample_id=%s FOR UPDATE",(sample_id,))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("SELECT COUNT(*) AS count FROM sample_aliquot WHERE sample_id=%s",(sample_id,));count=cur.fetchone()["count"]
        if count:rollback(c);return jsonify({"success":False,"message":"Sample cannot be deleted because it contains one or more aliquots","dependencies":{"aliquots":count}}),409
        cur.execute("DELETE FROM sample WHERE sample_id=%s",(sample_id,));c.commit();return jsonify({"success":True,"message":"Sample deleted successfully"}),200
    except MySQLError as e:rollback(c);return db_error(e,"delete")
    finally:close(cur,c)
