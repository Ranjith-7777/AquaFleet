"""CRUD API for the sample_aliquot weak entity."""
from decimal import Decimal,InvalidOperation
from flask import Blueprint,current_app,jsonify,request
from mysql.connector import Error as MySQLError,errorcode
from database import get_db_connection
sample_aliquots_bp=Blueprint("sample_aliquots",__name__,url_prefix="/api/sample-aliquots")
POST_FIELDS={"sample_id","aliquot_no","volume_ml","storage_temp"};PUT_FIELDS={"volume_ml","storage_temp"}
SELECT_SQL="""SELECT sa.sample_id,sa.aliquot_no,sa.volume_ml,sa.storage_temp,s.sample_type,s.preservation_method,
 s.chain_of_custody_status,s.mission_id FROM sample_aliquot sa JOIN sample s ON s.sample_id=sa.sample_id"""
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
def not_found():return jsonify({"success":False,"message":"Sample aliquot not found"}),404
def duplicate():return jsonify({"success":False,"message":"This aliquot number already exists for the sample"}),409
def fallback():return validation({"parent_reference":"One or more referenced parent records no longer exist"})
def db_error(e,a):current_app.logger.error("Sample-aliquot %s failed: %s",a,e,exc_info=True);return jsonify({"success":False,"message":"A database error occurred"}),500
def posint(n,v,e):
    if v is None:e[n]=f"{n} is required"
    elif isinstance(v,bool) or not isinstance(v,int) or not 1<=v<=2147483647:e[n]=f"{n} must be an integer between 1 and 2147483647"
    else:return v
def dec(n,v,e,lo,hi):
    if v is None:e[n]=f"{n} is required";return None
    if isinstance(v,bool) or not isinstance(v,(int,float)):e[n]=f"{n} must be a valid decimal number";return None
    try:x=Decimal(str(v))
    except (InvalidOperation,ValueError):e[n]=f"{n} must be a valid decimal number";return None
    if not x.is_finite() or x<lo or x>hi:e[n]=f"{n} must be between {lo} and {hi}";return None
    if x.as_tuple().exponent < -2:e[n]=f"{n} must have at most 2 decimal places";return None
    return x
def payload(body,fields,keys):
    if not isinstance(body,dict):return {},{"body":"Request body must be a JSON object"}
    e={k:f"{k} is not a recognised field" for k in body if k not in fields};o={}
    if keys:
        for n in ("sample_id","aliquot_no"):
            x=posint(n,body.get(n),e)
            if x is not None:o[n]=x
    x=dec("volume_ml",body.get("volume_ml"),e,Decimal("0.01"),Decimal("99999999.99"))
    if x is not None:o["volume_ml"]=x
    x=dec("storage_temp",body.get("storage_temp"),e,Decimal("-9999.99"),Decimal("9999.99"))
    if x is not None:o["storage_temp"]=x
    return o,e
def fetch(cur,sid,no):cur.execute(SELECT_SQL+" WHERE sa.sample_id=%s AND sa.aliquot_no=%s",(sid,no));return cur.fetchone()
def serial(r):
    if not r:return None
    r=dict(r);r["volume_ml"]=float(r["volume_ml"]);r["storage_temp"]=float(r["storage_temp"]);return r
@sample_aliquots_bp.route("",methods=["GET"])
def list_aliquots():
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);cur.execute(SELECT_SQL+" ORDER BY sa.sample_id,sa.aliquot_no");d=[serial(x) for x in cur.fetchall()];return jsonify({"success":True,"count":len(d),"data":d}),200
    except MySQLError as e:return db_error(e,"list")
    finally:close(cur,c)
@sample_aliquots_bp.route("/<int:sample_id>/<int:aliquot_no>",methods=["GET"])
def get_aliquot(sample_id,aliquot_no):
    c=cur=None
    try:c=get_db_connection();cur=c.cursor(dictionary=True);r=fetch(cur,sample_id,aliquot_no);return (jsonify({"success":True,"data":serial(r)}),200) if r else not_found()
    except MySQLError as e:return db_error(e,"fetch")
    finally:close(cur,c)
@sample_aliquots_bp.route("",methods=["POST"])
def create_aliquot():
    v,e=payload(request.get_json(silent=True),POST_FIELDS,True)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT sample_id FROM sample WHERE sample_id=%s",(v["sample_id"],))
        if not cur.fetchone():rollback(c);return validation({"sample_id":"sample_id does not reference an existing sample"})
        cur.execute("INSERT INTO sample_aliquot(sample_id,aliquot_no,volume_ml,storage_temp) VALUES(%s,%s,%s,%s)",(v["sample_id"],v["aliquot_no"],v["volume_ml"],v["storage_temp"]));c.commit();r=fetch(cur,v["sample_id"],v["aliquot_no"]);return jsonify({"success":True,"message":"Sample aliquot created successfully","data":serial(r)}),201
    except MySQLError as e:
        rollback(c)
        if e.errno==errorcode.ER_DUP_ENTRY:return duplicate()
        if e.errno==errorcode.ER_NO_REFERENCED_ROW_2:return fallback()
        return db_error(e,"create")
    finally:close(cur,c)
@sample_aliquots_bp.route("/<int:sample_id>/<int:aliquot_no>",methods=["PUT"])
def update_aliquot(sample_id,aliquot_no):
    v,e=payload(request.get_json(silent=True),PUT_FIELDS,False)
    if e:return validation(e)
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT sample_id FROM sample_aliquot WHERE sample_id=%s AND aliquot_no=%s FOR UPDATE",(sample_id,aliquot_no))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("UPDATE sample_aliquot SET volume_ml=%s,storage_temp=%s WHERE sample_id=%s AND aliquot_no=%s",(v["volume_ml"],v["storage_temp"],sample_id,aliquot_no));c.commit();r=fetch(cur,sample_id,aliquot_no);return jsonify({"success":True,"message":"Sample aliquot updated successfully","data":serial(r)}),200
    except MySQLError as e:rollback(c);return db_error(e,"update")
    finally:close(cur,c)
@sample_aliquots_bp.route("/<int:sample_id>/<int:aliquot_no>",methods=["DELETE"])
def delete_aliquot(sample_id,aliquot_no):
    c=cur=None
    try:
        c=get_db_connection();c.autocommit=False;cur=c.cursor(dictionary=True);c.start_transaction();cur.execute("SELECT sample_id FROM sample_aliquot WHERE sample_id=%s AND aliquot_no=%s FOR UPDATE",(sample_id,aliquot_no))
        if not cur.fetchone():rollback(c);return not_found()
        cur.execute("DELETE FROM sample_aliquot WHERE sample_id=%s AND aliquot_no=%s",(sample_id,aliquot_no));c.commit();return jsonify({"success":True,"message":"Sample aliquot deleted successfully"}),200
    except MySQLError as e:rollback(c);return db_error(e,"delete")
    finally:close(cur,c)
