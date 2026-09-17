# AquaFleet

**Integrated Autonomous Underwater Expedition, Research Vessel Coordination, Marine Sample Lineage and Offshore Inspection Database**

A DBMS course project implementing the AquaFleet relational schema, authenticated REST API, role-based access control, dashboard, resource browsing and CRUD workflows.

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, JavaScript, Bootstrap 5 |
| Backend | Python Flask |
| API style | REST APIs using JSON |
| Database | MySQL |
| DB connector | mysql-connector-python |
| Config | python-dotenv |

**Architecture:** Browser frontend → JavaScript `fetch()` → Flask REST API → MySQL

---

## Folder structure

```
AquaFleet/
├── backend/
│   ├── app.py              # Flask app + /api/health endpoint
│   ├── config.py           # Reads settings from environment variables
│   ├── database.py         # get_db_connection() helper
│   ├── authentication.py   # session helpers + login guard
│   ├── create_demo_users.py # LOCAL demo account setup (run by hand)
│   ├── requirements.txt    # Python dependencies
│   ├── .env.example        # Template for your local .env
│   └── routes/
│       ├── __init__.py     # Blueprint package
│       ├── auth.py         # login / me / logout
│       ├── vessels.py      # CRUD for research_vessel
│       ├── marine_zones.py # CRUD for marine_zone
│       ├── vehicles.py     # CRUD for auv_rov
│       ├── operators.py    # CRUD for operator + operator_contact
│       ├── sensors.py      # CRUD for sensor
│       ├── battery_packs.py # CRUD for battery_pack
│       ├── offshore_assets.py # CRUD for offshore_asset
│       ├── expeditions.py  # CRUD for expedition
│       ├── missions.py     # CRUD for mission
│       ├── mission_vehicles.py   # CRUD for mission_vehicle
│       ├── mission_operators.py  # CRUD for mission_operator
│       ├── vehicle_sensors.py    # CRUD for vehicle_sensor
│       └── vehicle_batteries.py  # CRUD for vehicle_battery
├── frontend/
│   ├── index.html          # Bootstrap 5 landing page
│   ├── css/
│   │   └── style.css       # Custom styles
│   └── js/
│       ├── api.js          # HTTP client (credentialed, central 401 hook)
│       ├── ui.js           # safe DOM + formatting helpers
│       ├── resources.js    # resource definitions
│       ├── master-data.js  # CRUD forms
│       ├── auth.js         # login screen, boot gate, logout
│       └── app.js          # SPA coordinator
├── database/
│   ├── schema.sql          # 20 domain tables + app_user, constraints, indexes
│   └── sample_data.sql     # demo rows + validation queries
├── .gitignore
└── README.md
```

---

## Prerequisites

- Python 3.9 or newer
- MySQL Server 8.x (not needed yet for the health check, but needed later)
- A web browser

---

## Setup

### 1. Open the backend folder

```bash
cd AquaFleet/backend
```

### 2. Create and activate a virtual environment

Windows:

```bash
python -m venv venv
```

```bash
venv\Scripts\activate
```

macOS / Linux:

```bash
python3 -m venv venv
```

```bash
source venv/bin/activate
```

### 3. Install the dependencies

```bash
pip install -r requirements.txt
```

### 4. Create your `.env` file

Windows:

```bash
copy .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

Then open `.env` and fill in your own MySQL username and password. Leave `DB_NAME=aquafleet_db` — that is the database created in the next step. The `.env` file is git-ignored and must never be committed.

---

## Database setup

The database is named **`aquafleet_db`**. Both scripts are rerunnable: `schema.sql` drops and recreates every table, and `sample_data.sql` truncates and reloads every table.

### Option A — MySQL command line

From the `AquaFleet` folder, run the schema first, then the data:

```bash
mysql -u root -p < database/schema.sql
```

```bash
mysql -u root -p < database/sample_data.sql
```

If `mysql` is not on your PATH on Windows, use the full path:

```bash
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database/schema.sql
```

### Option B — MySQL Workbench

1. Open MySQL Workbench and connect to your local MySQL 8 instance.
2. **File → Open SQL Script…** and choose `database/schema.sql`.
3. Click the lightning bolt (**Execute All**). The script creates `aquafleet_db` and all 21 tables.
4. **File → Open SQL Script…** and choose `database/sample_data.sql`.
5. Click **Execute All**. The inserts run first, then eight validation `SELECT` queries produce result grids.
6. Right-click **aquafleet_db** in the Navigator and choose **Refresh All** to see the tables.

### Verifying the load

The first validation query returns the row count of every table. Expected values:

| Table | Rows | Table | Rows |
| --- | --- | --- | --- |
| research_vessel | 3 | vehicle_battery | 6 |
| marine_zone | 4 | maintenance_record | 6 |
| auv_rov | 5 | telemetry_point | 15 |
| operator | 6 | sample | 8 |
| sensor | 6 | sample_aliquot | 12 |
| battery_pack | 5 | incident | 6 |
| offshore_asset | 4 | inspection_task | 7 |
| expedition | 4 | operator_contact | 8 |
| mission | 7 | mission_vehicle | 8 |
| mission_operator | 10 | vehicle_sensor | 8 |

Note: `mission_duration` is deliberately **not** stored. Derive it in queries with
`TIMESTAMPDIFF(MINUTE, start_time, end_time)`.

---

## Running the backend

From `AquaFleet/backend` with the virtual environment active:

```bash
python app.py
```

The server starts at `http://localhost:5000`.

Test the health endpoint in a browser or with curl:

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "AquaFleet API is running"
}
```

### Health endpoints

| Endpoint | Checks |
| --- | --- |
| `GET /api/health` | Flask itself is running |
| `GET /api/health/database` | Flask can reach MySQL |

```bash
curl http://127.0.0.1:5000/api/health/database
```

Expected response (HTTP 200):

```json
{
  "success": true,
  "message": "AquaFleet database is connected",
  "database": "aquafleet_db",
  "mysql_version": "8.0.x"
}
```

On failure it returns HTTP 500 with `success: false` and a short error message. Credentials are never included in the response.

---

## Authentication and role-based access control

**Every API below this section requires a logged-in session.** Only the two health endpoints and the login/logout endpoints are public.

### Architecture

User accounts live in MySQL and are verified by Flask. There is no OAuth, no JWT, no third-party identity provider and no token in browser storage — just a database table, a password hash and Flask's signed session cookie.

```
Browser  --POST /api/auth/login (username + password)-->  Flask
                                                            |
                                          SELECT ... FROM app_user WHERE username = %s
                                                            |
                                          check_password_hash(stored_hash, password)
                                                            |
Browser  <--Set-Cookie: session=<signed>  +  200 profile---  Flask
   |
   |  every later request carries the cookie (fetch credentials:"include")
   v
Flask before_request  -->  session has user_id?  --no-->  401 Authentication required
                                  |
                                 yes
                                  v
                       reload active user from MySQL
                                  |
                                  v
                      authorize role + resource + method
                         | allowed          | denied
                         v                  v
                  resource route     403 INSUFFICIENT_PERMISSIONS
```

Three properties worth naming:

- **The cookie is signed, not encrypted.** The browser can read it but cannot alter it without invalidating the `SECRET_KEY` signature, so the server trusts the identity inside it. That is why `user_id` and `role` are read from the session, never from the request body — a client sending `{"role":"ADMIN"}` is rejected as an unknown field.
- **The cookie is `HttpOnly`.** JavaScript cannot read it, so an XSS bug cannot exfiltrate the session.
- **Every protected request re-reads the account from MySQL.** Deactivation and role changes therefore take effect on the next API call without reissuing the cookie.

### The `app_user` table

```sql
CREATE TABLE app_user (
    user_id       INT AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_app_user          PRIMARY KEY (user_id),
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT chk_app_user_role
        CHECK (role IN ('ADMIN', 'OPERATOR', 'RESEARCHER', 'VIEWER'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

It is deliberately isolated: no domain table references `app_user`, and `app_user` references no domain table. The marine-domain model and the login system can be reasoned about independently.

**Why hashes and not passwords.** `password_hash` stores a werkzeug **scrypt** hash (~162 characters), which is one-way — the stored value cannot be turned back into the password. Anyone who obtains a dump of the table still cannot log in. scrypt is also deliberately slow and memory-hard, so guessing at scale is expensive. The column is never selected by any endpoint except the login check itself, and never appears in any response.

### Public vs protected endpoints

| Endpoint | Access |
| --- | --- |
| `GET /api/health` | **public** |
| `GET /api/health/database` | **public** |
| `POST /api/auth/login` | **public** — you cannot be logged in to log in |
| `POST /api/auth/logout` | **public** — idempotent, safe when already logged out |
| `GET /api/auth/me` | returns **401** when not signed in; that is its answer, not an error |
| **Every other `/api/...` route** | **protected** — 401 without a session |
| `OPTIONS` (any path) | **exempt** — CORS preflights carry no cookie |

Protection is enforced by a single `@app.before_request` hook in `app.py`, not by decorating 19 blueprints. A new resource module is protected the moment it is registered, and the complete list of exemptions is visible in one place.

Unauthenticated access returns:

```json
{ "success": false, "message": "Authentication required" }
```

### Local setup

**1. Generate a SECRET_KEY**

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Put it in `backend/.env` (which is git-ignored — never commit it):

```
SECRET_KEY=<paste the generated value here>
CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
SESSION_COOKIE_SECURE=False
```

`SESSION_COOKIE_SECURE=False` is correct for local HTTP only. **Set it to `True` for any HTTPS deployment**, otherwise the session cookie travels in the clear. `app.py` refuses to start with the built-in fallback secret when `FLASK_DEBUG=False`.

**2. Create or update the `app_user` table** — fresh databases receive it from `database/schema.sql`. For a database that already has the pre-RBAC table, run the one-time migration instead of rebuilding the schema:

```bash
mysql -u root -p aquafleet_db < database/migrations/phase1_add_viewer_role.sql
```

**3. Create the demonstration accounts**

```bash
cd AquaFleet\backend
```

```bash
venv\Scripts\python.exe create_demo_users.py
```

The script is idempotent — run it as often as you like. It creates an account only when the username is absent, never resets an existing password, and never prints a hash. Flask does **not** run it at startup.

### Demonstration credentials

| Username | Password | Role | Full name |
| --- | --- | --- | --- |
| `admin` | `AquaAdmin@2026` | ADMIN | AquaFleet Administrator |
| `researcher` | `AquaResearch@2026` | RESEARCHER | Marine Researcher |
| `operator` | `AquaOperator@2026` | OPERATOR | Fleet Operations Officer |
| `viewer` | `AquaViewer@2026` | VIEWER | AquaFleet Viewer |

These are throwaway credentials for a local coursework deployment. They exist in plaintext only inside `create_demo_users.py` — never in `schema.sql`, `sample_data.sql` or any frontend file — and the database stores only their hashes. Change them before running this anywhere reachable by anyone else.

### Verifying with curl (Windows CMD)

Session state lives in a cookie, so every command needs the same cookie jar: `-c` writes it, `-b` sends it.

**Protected endpoint without a session → 401**

```bash
curl.exe -i http://127.0.0.1:5000/api/vessels
```

**Log in — this writes `cookies.txt`**

```bash
curl.exe -i -c cookies.txt -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"AquaAdmin@2026\"}"
```

**Who am I?**

```bash
curl.exe -i -b cookies.txt http://127.0.0.1:5000/api/auth/me
```

**A protected endpoint, now with the session**

```bash
curl.exe -i -b cookies.txt http://127.0.0.1:5000/api/vessels
```

**Log out**

```bash
curl.exe -i -c cookies.txt -b cookies.txt -X POST http://127.0.0.1:5000/api/auth/logout
```

**Confirm the session is gone → 401**

```bash
curl.exe -i -b cookies.txt http://127.0.0.1:5000/api/auth/me
```

### Expected responses

**200 — successful login** (note: no `password_hash`)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user_id": 1,
    "username": "admin",
    "full_name": "AquaFleet Administrator",
    "role": "ADMIN"
  }
}
```

**400 — validation failure**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\"}"
```

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": { "password": "password is required" }
}
```

Unknown fields are rejected the same way, so `{"username":"admin","password":"x","role":"ADMIN"}` is a 400 — the client cannot choose its own role.

**401 — bad credentials**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"wrong\"}"
```

```json
{ "success": false, "message": "Invalid username or password" }
```

A **nonexistent username returns exactly this same body**. The API never reveals which half was wrong, because doing so would turn the login form into a tool for discovering valid usernames.

**403 — correct password, deactivated account**

```json
{ "success": false, "message": "This account is inactive. Contact an administrator.", "error_code": "ACCOUNT_INACTIVE" }
```

Distinct from 401 on purpose: the credentials were right, so the person is better served by being told to contact an administrator.

### Permission matrix

All active roles may read every registered resource. Mutation permissions are enforced by Flask before a route runs; hiding a button in the browser is only a usability feature.

| Resource group | ADMIN | RESEARCHER | OPERATOR | VIEWER |
| --- | --- | --- | --- | --- |
| Master data | create/update/delete | read | read | read |
| Expeditions | create/update/delete | create/update | read | read |
| Missions | create/update/delete | create/update | update | read |
| Mission vehicle/operator assignments | create/update/delete | create/update/delete | create/update/delete | read |
| Vehicle sensor/battery assignments | create/update/delete | read | create/update/delete | read |
| Telemetry, incidents, inspections, maintenance | create/update/delete | read | create/update/delete | read |
| Samples and aliquots | create/update/delete | create/update | read | read |

An authenticated user without a grant receives HTTP 403 and remains logged in:

```json
{
  "success": false,
  "message": "You do not have permission to perform this action",
  "error_code": "INSUFFICIENT_PERMISSIONS"
}
```

To verify a role, log in with its demonstration account, browse any resource, and compare the available controls with this matrix. A direct forbidden POST/PUT/DELETE must still return the 403 above even if a control is hidden.

### Security limitations of this local academic deployment

Honest scope notes, not oversights:

- **No rate limiting or lockout.** Login accepts unlimited attempts, so the password is the only barrier against automated guessing.
- **No CSRF token.** `SameSite=Lax` blocks the straightforward cross-site POST, but a token would be needed for a real deployment.
- **Sessions do not expire** beyond the browser session, and there is no server-side session store, so a session cannot be revoked centrally — deactivating the account is the available lever.
- **HTTP, not HTTPS.** The password is sent in the clear over the loopback interface. On any real network this needs TLS plus `SESSION_COOKIE_SECURE=True`.
- **No password policy, reset flow, or account management UI.** Accounts are created by running the setup script.

---

## REST API — research vessels

Implemented in [backend/routes/vessels.py](AquaFleet/backend/routes/vessels.py) as a Flask Blueprint registered under `/api/vessels`.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/vessels` | List all vessels, ordered by `vessel_id` | 200 | 500 |
| GET | `/api/vessels/<id>` | Fetch one vessel | 200 | 404, 500 |
| POST | `/api/vessels` | Create a vessel | 201 | 400, 409, 500 |
| PUT | `/api/vessels/<id>` | Replace all four editable fields | 200 | 400, 404, 409, 500 |
| DELETE | `/api/vessels/<id>` | Delete a vessel | 200 | 404, 409, 500 |

**Status code meanings**

- `400` — validation failed; the body includes an `errors` object listing every problem at once
- `404` — no vessel with that `vessel_id`
- `409` — duplicate `vessel_name` (MySQL error 1062), or delete blocked because an expedition references the vessel (MySQL error 1451)
- `500` — unexpected database error; the client only sees `"A database error occurred"`, full details go to the server log

**Validation rules for POST and PUT**

| Field | Rules |
| --- | --- |
| `vessel_name` | required, string, non-blank after trimming, max 100 chars, unique |
| `vessel_type` | required, string, non-blank after trimming, max 50 chars |
| `capacity` | required, integer > 0; Booleans are rejected explicitly |
| `home_port` | required, string, non-blank after trimming, max 100 chars |

Unknown JSON fields are rejected so typos surface immediately. Leading and trailing whitespace is trimmed from all text fields before insert.

### curl examples (Windows CMD)

Start the Flask server first, then run these in a second **CMD** window. The `.exe` suffix matters — it bypasses PowerShell's `curl` alias if you happen to be in PowerShell.

**List all vessels**

```bash
curl.exe http://127.0.0.1:5000/api/vessels
```

**Fetch vessel ID 1**

```bash
curl.exe http://127.0.0.1:5000/api/vessels/1
```

**Create a vessel** (returns 201 with the generated `vessel_id`)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vessels -H "Content-Type: application/json" -d "{\"vessel_name\":\"RV Samudra Explorer\",\"vessel_type\":\"Research Vessel\",\"capacity\":45,\"home_port\":\"Kochi\"}"
```

**Update the vessel just created** (replace `4` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/vessels/4 -H "Content-Type: application/json" -d "{\"vessel_name\":\"RV Samudra Explorer II\",\"vessel_type\":\"Deep Sea Research Vessel\",\"capacity\":50,\"home_port\":\"Kochi, Kerala, India\"}"
```

**Delete it**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/vessels/4
```

**Invalid capacity → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vessels -H "Content-Type: application/json" -d "{\"vessel_name\":\"RV Bad Capacity\",\"vessel_type\":\"Research Vessel\",\"capacity\":0,\"home_port\":\"Kochi\"}"
```

**Duplicate vessel name → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vessels -H "Content-Type: application/json" -d "{\"vessel_name\":\"ORV Sagar Nidhi\",\"vessel_type\":\"Research Vessel\",\"capacity\":30,\"home_port\":\"Chennai\"}"
```

**Missing vessel ID → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/vessels/99999
```

**Delete a vessel referenced by an expedition → 409**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/vessels/1
```

---

## REST API — marine zones

Implemented in [backend/routes/marine_zones.py](AquaFleet/backend/routes/marine_zones.py) as a Flask Blueprint registered under `/api/marine-zones`.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/marine-zones` | List all zones, ordered by `zone_id` | 200 | 500 |
| GET | `/api/marine-zones/<id>` | Fetch one zone | 200 | 404, 500 |
| POST | `/api/marine-zones` | Create a zone | 201 | 400, 409, 500 |
| PUT | `/api/marine-zones/<id>` | Replace all five editable fields | 200 | 400, 404, 409, 500 |
| DELETE | `/api/marine-zones/<id>` | Delete a zone | 200 | 404, 409, 500 |

**Status code meanings**

- `400` — validation failed; the body includes an `errors` object listing every problem at once
- `404` — no zone with that `zone_id`
- `409` — duplicate `zone_name` (MySQL error 1062), or delete blocked because a mission references the zone (MySQL error 1451)
- `500` — unexpected database error; the client only sees `"A database error occurred"`

**Validation rules for POST and PUT**

| Field | Rules |
| --- | --- |
| `zone_name` | required, string, non-blank after trimming, max 100 chars, unique |
| `region` | required, string, non-blank after trimming, max 100 chars |
| `min_depth` | required, JSON number, finite, ≥ 0, ≤ 999999.99, at most 2 decimal places |
| `max_depth` | required, JSON number, finite, ≥ `min_depth`, ≤ 999999.99, at most 2 decimal places |
| `risk_level` | required, string, trimmed, exactly one of `Low`, `Moderate`, `High`, `Critical` |

Unknown JSON fields are rejected. Booleans, strings such as `"50"`, `null`, `NaN` and `Infinity` are all rejected as depths. Depth range and decimal-place checks run through `Decimal(str(value))`, never binary float arithmetic. Depths are stored as `Decimal` and returned as plain JSON numbers, so `50.00` in MySQL comes back as `50.0`.

`risk_level` is matched case-sensitively — `"low"` is rejected rather than corrected, so a typo never becomes a silently different value.

### curl examples (Windows CMD)

**Get all zones**

```bash
curl.exe http://127.0.0.1:5000/api/marine-zones
```

**Get zone 1**

```bash
curl.exe http://127.0.0.1:5000/api/marine-zones/1
```

**Create a new unreferenced zone** (returns 201 with the generated `zone_id`)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Lakshadweep Coral Shelf\",\"region\":\"Arabian Sea\",\"min_depth\":15.5,\"max_depth\":180.75,\"risk_level\":\"Moderate\"}"
```

**Update that new zone** (replace `5` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/marine-zones/5 -H "Content-Type: application/json" -d "{\"zone_name\":\"Lakshadweep Coral Shelf North\",\"region\":\"Arabian Sea\",\"min_depth\":20.0,\"max_depth\":210.25,\"risk_level\":\"High\"}"
```

**Delete that new zone**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/marine-zones/5
```

**Missing zone 99999 → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/marine-zones/99999
```

**Duplicate zone_name → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Andaman Deep Reef Shelf\",\"region\":\"Andaman Sea\",\"min_depth\":50,\"max_depth\":600,\"risk_level\":\"Moderate\"}"
```

**Negative min_depth → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Negative Depth Zone\",\"region\":\"Arabian Sea\",\"min_depth\":-5,\"max_depth\":180,\"risk_level\":\"Low\"}"
```

**max_depth below min_depth → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Inverted Depth Zone\",\"region\":\"Arabian Sea\",\"min_depth\":500,\"max_depth\":100,\"risk_level\":\"Low\"}"
```

**Invalid risk_level → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Bad Risk Zone\",\"region\":\"Arabian Sea\",\"min_depth\":10,\"max_depth\":100,\"risk_level\":\"low\"}"
```

**More than two decimal places → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Too Precise Zone\",\"region\":\"Arabian Sea\",\"min_depth\":50.123,\"max_depth\":180,\"risk_level\":\"Low\"}"
```

**Boolean depth → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/marine-zones -H "Content-Type: application/json" -d "{\"zone_name\":\"Boolean Depth Zone\",\"region\":\"Arabian Sea\",\"min_depth\":true,\"max_depth\":180,\"risk_level\":\"Low\"}"
```

**Delete referenced zone 1 → 409**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/marine-zones/1
```

---

## REST API — AUV/ROV vehicles

Implemented in [backend/routes/vehicles.py](AquaFleet/backend/routes/vehicles.py) as a Flask Blueprint registered under `/api/vehicles`.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/vehicles` | List all vehicles, ordered by `vehicle_id` | 200 | 500 |
| GET | `/api/vehicles/<id>` | Fetch one vehicle | 200 | 404, 500 |
| POST | `/api/vehicles` | Create a vehicle | 201 | 400, 409, 500 |
| PUT | `/api/vehicles/<id>` | Replace all five editable fields | 200 | 400, 404, 409, 500 |
| DELETE | `/api/vehicles/<id>` | Delete a vehicle, if nothing references it | 200 | 404, 409, 500 |

### Why DELETE is stricter than the database

The four child tables — `mission_vehicle`, `vehicle_sensor`, `vehicle_battery` and `maintenance_record` — all declare `ON DELETE CASCADE`. If the API simply issued a `DELETE`, MySQL would succeed and silently erase that vehicle's mission assignments, sensor mountings, battery cycles and maintenance history. It would never raise error 1451, so there is nothing to catch.

**The API therefore refuses instead.** Before deleting, it locks the vehicle row `FOR UPDATE` and counts rows in all four child tables inside the same transaction. If any count is above zero it rolls back without sending a `DELETE`, and returns 409 with the exact counts. There is no query parameter to bypass this. Dependent rows are never removed by the API.

Example 409 body for vehicle 1:

```json
{
  "success": false,
  "message": "AUV/ROV vehicle cannot be deleted because it has related operational records",
  "dependencies": {
    "mission_assignments": 2,
    "sensor_assignments": 3,
    "battery_assignments": 2,
    "maintenance_records": 2,
    "total": 9
  }
}
```

`PUT` is unaffected — a referenced vehicle can be updated freely, and no child record is read or changed.

**Validation rules for POST and PUT**

| Field | Rules |
| --- | --- |
| `vehicle_name` | required, string, non-blank after trimming, max 100 chars, unique |
| `vehicle_type` | required, string, trimmed, exactly `AUV` or `ROV` |
| `model` | required, string, non-blank after trimming, max 100 chars |
| `max_depth` | required, JSON number, finite, **strictly > 0**, ≤ 999999.99, at most 2 decimal places |
| `status` | required, string, trimmed, exactly one of `Available`, `Deployed`, `Maintenance`, `Retired` |

Unknown JSON fields are rejected. Booleans, strings such as `"100"`, `null`, arrays, objects, `NaN` and `Infinity` are all rejected as depths. `vehicle_type` and `status` are matched case-sensitively — `"auv"` is rejected rather than corrected. Note that `max_depth` must be strictly greater than 0, unlike `marine_zone.min_depth` which allows 0.

### curl examples (Windows CMD)

**List all vehicles**

```bash
curl.exe http://127.0.0.1:5000/api/vehicles
```

**Get vehicle 1**

```bash
curl.exe http://127.0.0.1:5000/api/vehicles/1
```

**Create a temporary unreferenced vehicle** (returns 201 with the generated `vehicle_id`)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Matsya AUV-4\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 100\",\"max_depth\":100.5,\"status\":\"Available\"}"
```

**Update it** (replace `6` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/vehicles/6 -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Matsya AUV-4 Mk2\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 300\",\"max_depth\":305.25,\"status\":\"Maintenance\"}"
```

**Delete it → 200** (nothing references it)

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/vehicles/6
```

**Missing vehicle 99999 → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/vehicles/99999
```

**Duplicate vehicle_name → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Varuna AUV-1\",\"vehicle_type\":\"AUV\",\"model\":\"Bluefin-21\",\"max_depth\":4500,\"status\":\"Available\"}"
```

**Invalid vehicle_type → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Bad Type Vehicle\",\"vehicle_type\":\"auv\",\"model\":\"REMUS 100\",\"max_depth\":100,\"status\":\"Available\"}"
```

**Invalid status → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Bad Status Vehicle\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 100\",\"max_depth\":100,\"status\":\"Broken\"}"
```

**max_depth equal to zero → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Zero Depth Vehicle\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 100\",\"max_depth\":0,\"status\":\"Available\"}"
```

**Negative max_depth → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Negative Depth Vehicle\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 100\",\"max_depth\":-100,\"status\":\"Available\"}"
```

**max_depth with three decimal places → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Too Precise Vehicle\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 100\",\"max_depth\":100.123,\"status\":\"Available\"}"
```

**Boolean max_depth → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicles -H "Content-Type: application/json" -d "{\"vehicle_name\":\"Boolean Depth Vehicle\",\"vehicle_type\":\"AUV\",\"model\":\"REMUS 100\",\"max_depth\":true,\"status\":\"Available\"}"
```

**Delete referenced vehicle 1 → 409 with dependency counts**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/vehicles/1
```

---

## REST API — operators (with contact numbers)

Implemented in [backend/routes/operators.py](AquaFleet/backend/routes/operators.py) as a Flask Blueprint registered under `/api/operators`.

An operator and their contact numbers are handled as **one combined record**. There are no separate contact endpoints.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/operators` | List all operators with contacts, ordered by `operator_id` | 200 | 500 |
| GET | `/api/operators/<id>` | Fetch one operator with contacts | 200 | 404, 500 |
| POST | `/api/operators` | Create an operator and its contacts | 201 | 400, 409, 500 |
| PUT | `/api/operators/<id>` | Replace details **and the whole contact list** | 200 | 400, 404, 409, 500 |
| DELETE | `/api/operators/<id>` | Delete an operator with no mission history | 200 | 404, 409, 500 |

Every operator is returned in this shape, with `contact_numbers` always an array sorted by `contact_no`:

```json
{
  "operator_id": 1,
  "first_name": "Ananya",
  "last_name": "Iyer",
  "role": "Chief AUV Pilot",
  "certification_level": "Level 4 - Expert",
  "email": "ananya.iyer@aquafleet.in",
  "contact_numbers": ["+91-4428451200", "+91-9840012345"]
}
```

### How writes and deletes behave

- **Operator and contacts are written atomically.** POST and PUT wrap both tables in a single transaction and commit only after every statement succeeds. A failure anywhere rolls the whole thing back — you never end up with saved details and missing phone numbers, or the reverse.
- **PUT replaces the complete contact list.** The existing rows are deleted and the submitted list is inserted in their place. There is no merge and no partial edit: send every number you want to keep. At least one is required.
- **Contacts are owned data and cascade on deletion.** `operator_contact` is the multivalued `contact_no` attribute decomposed for 1NF. It never blocks a delete, and the schema's `ON DELETE CASCADE` removes those rows when the operator goes.
- **Mission assignments are protected history and block deletion.** `mission_operator` records who crewed which mission, with `duty_role` and `shift`. The schema would cascade it away silently, so the API refuses instead, returning 409 with the count. There is no force-delete option, and the API never deletes `mission_operator` rows itself.

Example 409 body for operator 1:

```json
{
  "success": false,
  "message": "Operator cannot be deleted because they are assigned to one or more missions",
  "dependencies": { "mission_assignments": 2 }
}
```

**Validation rules for POST and PUT**

| Field | Rules |
| --- | --- |
| `first_name` | required, string, non-blank after trimming, max 60 chars |
| `last_name` | required, string, non-blank after trimming, max 60 chars |
| `role` | required, string, non-blank after trimming, max 80 chars |
| `certification_level` | required, string, non-blank after trimming, max 50 chars |
| `email` | required, trimmed, max 120 chars, unique; exactly one `@`, non-empty local part, domain containing a dot, no whitespace |
| `contact_numbers` | required non-empty array; each item a string ≤ 20 chars, starting with `+`, then only digits, spaces and hyphens, with 7–15 digits; no duplicates within the request |

Unknown JSON fields are rejected. Per-item contact problems are reported by index, e.g. `"contact_numbers[1]": "duplicate contact number"`.

Email case is preserved as typed, but `uq_operator_email` uses a case-insensitive collation, so `ANANYA.IYER@aquafleet.in` collides with `ananya.iyer@aquafleet.in` and returns 409. Contact numbers are **not** globally unique — two operators may legitimately share a number.

### curl examples (Windows CMD)

**List operators**

```bash
curl.exe http://127.0.0.1:5000/api/operators
```

**Get operator 1**

```bash
curl.exe http://127.0.0.1:5000/api/operators/1
```

**Create a temporary operator with two contacts**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Arjun\",\"last_name\":\"Rao\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 3 - Advanced\",\"email\":\"arjun.rao@aquafleet.in\",\"contact_numbers\":[\"+91-9876543210\",\"+91-4842345678\"]}"
```

**Update it and replace the contact list** (replace `7` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/operators/7 -H "Content-Type: application/json" -d "{\"first_name\":\"Arjun\",\"last_name\":\"Rao Nair\",\"role\":\"Senior AUV Pilot\",\"certification_level\":\"Level 4 - Expert\",\"email\":\"arjun.rao@aquafleet.in\",\"contact_numbers\":[\"+91-9000011111\",\"+91-9000022222\"]}"
```

**Delete the unassigned temporary operator → 200** (its contacts cascade away)

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/operators/7
```

**Missing operator 99999 → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/operators/99999
```

**Duplicate email → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Copy\",\"last_name\":\"Cat\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"ananya.iyer@aquafleet.in\",\"contact_numbers\":[\"+91-9876543210\"]}"
```

**Invalid email → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Bad\",\"last_name\":\"Email\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"not-an-email\",\"contact_numbers\":[\"+91-9876543210\"]}"
```

**Empty contact_numbers → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"No\",\"last_name\":\"Contacts\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"no.contacts@aquafleet.in\",\"contact_numbers\":[]}"
```

**Duplicate contact number → 400** (reported as `contact_numbers[1]`)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Dup\",\"last_name\":\"Contact\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"dup.contact@aquafleet.in\",\"contact_numbers\":[\"+91-9876543210\",\"+91-9876543210\"]}"
```

**Invalid contact symbols → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Bad\",\"last_name\":\"Symbols\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"bad.symbols@aquafleet.in\",\"contact_numbers\":[\"+91-(984)0012345\"]}"
```

**Contact number longer than 20 characters → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Too\",\"last_name\":\"Long\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"too.long@aquafleet.in\",\"contact_numbers\":[\"+91-9840012345-678901\"]}"
```

**Unknown field → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/operators -H "Content-Type: application/json" -d "{\"first_name\":\"Extra\",\"last_name\":\"Field\",\"role\":\"AUV Pilot\",\"certification_level\":\"Level 2 - Intermediate\",\"email\":\"extra.field@aquafleet.in\",\"contact_numbers\":[\"+91-9876543210\"],\"nickname\":\"AJ\"}"
```

**Delete operator 1 → 409, blocked by mission assignments**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/operators/1
```

---

## REST API — sensors

Implemented in [backend/routes/sensors.py](AquaFleet/backend/routes/sensors.py) as a Flask Blueprint registered under `/api/sensors`.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/sensors` | List all sensors, ordered by `sensor_id` | 200 | 500 |
| GET | `/api/sensors/<id>` | Fetch one sensor | 200 | 404, 500 |
| POST | `/api/sensors` | Create a sensor | 201 | 400, 500 |
| PUT | `/api/sensors/<id>` | Replace all four editable fields | 200 | 400, 404, 500 |
| DELETE | `/api/sensors/<id>` | Delete a sensor, if no vehicle carries it | 200 | 404, 409, 500 |

Note that POST and PUT have **no 409**. See below.

Representation:

```json
{
  "sensor_id": 1,
  "sensor_type": "CTD Profiler",
  "manufacturer": "Sea-Bird Scientific",
  "calibration_date": "2026-01-15",
  "accuracy": 0.005
}
```

`calibration_date` is always emitted as `YYYY-MM-DD`, never as an RFC 1123 / GMT string. `accuracy` is always a JSON number.

### Three things to know

- **Identical sensor records are permitted.** The `sensor` table has no UNIQUE constraint — the primary key is its only index — so two rows with the same type, manufacturer, calibration date and accuracy are valid records of two separate physical instruments. There is deliberately no duplicate detection and no 409-on-duplicate response, because MySQL error 1062 can never be raised by this table.
- **`calibration_date` cannot be in the future.** The field records a calibration that has already happened. Today is accepted; tomorrow is rejected. The boundary is evaluated with `date.today()` on every request, so it tracks the server clock.
- **The database cascade is overridden.** `vehicle_sensor` declares `ON DELETE CASCADE`, so MySQL would quietly erase the `mount_position` and `install_date` rows recording where the instrument was fitted, and would never raise error 1451. The API refuses instead, returning 409 with the assignment count. There is no force-delete option, and `vehicle_sensor` rows are never deleted by the API.

Example 409 body for sensor 1:

```json
{
  "success": false,
  "message": "Sensor cannot be deleted because it is assigned to one or more vehicles",
  "dependencies": { "vehicle_assignments": 2 }
}
```

**Validation rules for POST and PUT**

| Field | Rules |
| --- | --- |
| `sensor_type` | required, string, non-blank after trimming, max 80 chars |
| `manufacturer` | required, string, non-blank after trimming, max 100 chars |
| `calibration_date` | required, string, exactly `YYYY-MM-DD`, a real calendar date, not after today |
| `accuracy` | required, JSON number, finite, **strictly > 0**, ≤ 999.999, at most **3** decimal places |

Unknown JSON fields are rejected. Note `accuracy` is `DECIMAL(6,3)`, so its limits differ from the depth columns elsewhere in the API: three decimal places rather than two, and a ceiling of 999.999 rather than 999999.99. Valid: `1`, `0.005`, `999.999`. Invalid: `0`, `-0.001`, `0.0001`, `1000`, `true`, `"0.005"`.

Date parsing is strict: `2026-02-30`, `20260810`, `2026-08-10T12:00:00`, `10/08/2026`, `2026-8-10` and `0000-00-00` are all rejected with `"calibration_date must be a valid date in YYYY-MM-DD format"`. A well-formed but future date gets the distinct message `"calibration_date cannot be in the future"`.

### curl examples (Windows CMD)

**List sensors**

```bash
curl.exe http://127.0.0.1:5000/api/sensors
```

**Get sensor 1**

```bash
curl.exe http://127.0.0.1:5000/api/sensors/1
```

**Create a temporary unassigned sensor**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Turbidity Sensor\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":0.025}"
```

**Update it** (replace `7` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/sensors/7 -H "Content-Type: application/json" -d "{\"sensor_type\":\"Turbidity Sensor Mk2\",\"manufacturer\":\"Ocean Insight Europe\",\"calibration_date\":\"2026-05-01\",\"accuracy\":0.012}"
```

**Delete it → 200** (no vehicle carries it)

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/sensors/7
```

**Missing sensor 99999 → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/sensors/99999
```

**Accuracy zero → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Zero Accuracy\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":0}"
```

**Accuracy negative → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Negative Accuracy\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":-0.001}"
```

**Four decimal places → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Too Precise\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":0.0001}"
```

**Accuracy above 999.999 → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Over Range\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":1000}"
```

**Boolean accuracy → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Boolean Accuracy\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":true}"
```

**Invalid calendar date → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Bad Date\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-02-30\",\"accuracy\":0.025}"
```

**Incorrect date format → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Bad Format\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"10/08/2026\",\"accuracy\":0.025}"
```

**Future calibration date → 400** (use any date after today)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Future Cal\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2099-01-01\",\"accuracy\":0.025}"
```

**Unknown field → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/sensors -H "Content-Type: application/json" -d "{\"sensor_type\":\"Extra Field\",\"manufacturer\":\"Ocean Insight\",\"calibration_date\":\"2026-08-10\",\"accuracy\":0.025,\"serial_no\":\"X1\"}"
```

**Delete assigned sensor 1 → 409 with the assignment count**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/sensors/1
```

---

## REST API — battery packs

Implemented in [backend/routes/battery_packs.py](AquaFleet/backend/routes/battery_packs.py) as a Flask Blueprint registered under `/api/battery-packs`.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/battery-packs` | List all packs, ordered by `battery_id` | 200 | 500 |
| GET | `/api/battery-packs/<id>` | Fetch one pack | 200 | 404, 500 |
| POST | `/api/battery-packs` | Create a pack | 201 | 400, 500 |
| PUT | `/api/battery-packs/<id>` | Replace all four editable fields | 200 | 400, 404, 500 |
| DELETE | `/api/battery-packs/<id>` | Delete a pack with no assignment history | 200 | 404, 409, 500 |

As with sensors, POST and PUT have **no 409** — see below.

Representation:

```json
{
  "battery_id": 1,
  "chemistry": "Lithium-Ion",
  "capacity_wh": 12000.0,
  "health_status": "Excellent",
  "cycle_count": 42
}
```

`capacity_wh` is always a JSON number; `cycle_count` is always a JSON integer.

### Four things to know

- **Identical battery rows are allowed.** `battery_pack` has no UNIQUE constraint, and each row represents a distinct physical pack — the seed data already contains three separate `Lithium-Ion` packs. There is deliberately no duplicate detection and no 409-on-duplicate response, because MySQL error 1062 is unreachable for this table.
- **POST defaults an omitted `cycle_count` to 0**, matching the column `DEFAULT`. The value is written explicitly rather than relying on the default, so the stored row and the response can never drift apart. An `cycle_count` that is *present but invalid* — including an explicit `null` — is a 400, never silently replaced with 0.
- **PUT requires `cycle_count`.** PUT is a full replacement, and a replacement that quietly reset the cycle count to 0 would discard a pack's accumulated wear.
- **The database cascade is overridden.** `vehicle_battery` declares `ON DELETE CASCADE`, so MySQL would silently erase the record of which vehicle carried the pack and over which period — possibly including a cycle that is still open — and would never raise error 1451. The API refuses instead, returning 409 with the count. Both closed and open periods count; there is no `end_cycle IS NULL` filter, no force-delete option, and `vehicle_battery` rows are never deleted by the API.

Example 409 body for battery 1:

```json
{
  "success": false,
  "message": "Battery pack cannot be deleted because it has vehicle assignment history",
  "dependencies": { "vehicle_assignments": 2 }
}
```

**Validation rules**

| Field | POST | PUT | Rules |
| --- | --- | --- | --- |
| `chemistry` | required | required | string, non-blank after trimming, max 50 chars, free text |
| `capacity_wh` | required | required | JSON number, finite, **strictly > 0**, ≤ 99999999.99, at most 2 decimal places |
| `health_status` | required | required | exactly one of `Excellent`, `Good`, `Fair`, `Poor`, `Replace` |
| `cycle_count` | **optional → 0** | **required** | genuine JSON integer, **≥ 0** (zero is valid), ≤ 2147483647 |

Unknown JSON fields are rejected. `capacity_wh` is `DECIMAL(10,2)`, so its ceiling differs from both the depth columns (999999.99) and sensor accuracy (999.999). Valid: `1`, `10500`, `10500.5`, `99999999.99`. Invalid: `0`, `-1`, `1.001`, `100000000`, `true`, `"10500"`.

`cycle_count` is the only numeric field in the API that accepts zero — `chk_battery_cycles` is `>= 0`, since a new pack legitimately has no cycles. Floats are rejected even when integral: `12.0` is a 400. `health_status` is matched case-sensitively, so `"good"` is rejected rather than corrected.

### curl examples (Windows CMD)

**List battery packs**

```bash
curl.exe http://127.0.0.1:5000/api/battery-packs
```

**Get battery 1**

```bash
curl.exe http://127.0.0.1:5000/api/battery-packs/1
```

**Create with an explicit cycle_count**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Lithium Iron Phosphate\",\"capacity_wh\":10500.5,\"health_status\":\"Excellent\",\"cycle_count\":12}"
```

**Create without cycle_count → response contains `"cycle_count": 0`**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Lithium Iron Phosphate\",\"capacity_wh\":10500.5,\"health_status\":\"Excellent\"}"
```

**Update a temporary battery** (replace `6` with the id returned above; all four fields required)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/battery-packs/6 -H "Content-Type: application/json" -d "{\"chemistry\":\"Lithium Iron Phosphate Mk2\",\"capacity_wh\":11000.25,\"health_status\":\"Good\",\"cycle_count\":57}"
```

**Delete an unused temporary battery → 200**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/battery-packs/6
```

**Missing battery 99999 → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/battery-packs/99999
```

**capacity_wh zero → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Zero Capacity\",\"capacity_wh\":0,\"health_status\":\"Good\",\"cycle_count\":1}"
```

**capacity_wh above the DECIMAL limit → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Over Limit\",\"capacity_wh\":100000000,\"health_status\":\"Good\",\"cycle_count\":1}"
```

**More than two decimal places → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Too Precise\",\"capacity_wh\":1.001,\"health_status\":\"Good\",\"cycle_count\":1}"
```

**Invalid health status → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Bad Health\",\"capacity_wh\":10500,\"health_status\":\"good\",\"cycle_count\":1}"
```

**Negative cycle_count → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Negative Cycles\",\"capacity_wh\":10500,\"health_status\":\"Good\",\"cycle_count\":-1}"
```

**Float cycle_count → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Float Cycles\",\"capacity_wh\":10500,\"health_status\":\"Good\",\"cycle_count\":12.0}"
```

**Boolean cycle_count → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Boolean Cycles\",\"capacity_wh\":10500,\"health_status\":\"Good\",\"cycle_count\":true}"
```

**Unknown field → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/battery-packs -H "Content-Type: application/json" -d "{\"chemistry\":\"Extra Field\",\"capacity_wh\":10500,\"health_status\":\"Good\",\"cycle_count\":1,\"voltage\":48}"
```

**Delete battery 1 → 409, blocked by assignment history**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/battery-packs/1
```

---

## REST API — offshore assets

Implemented in [backend/routes/offshore_assets.py](AquaFleet/backend/routes/offshore_assets.py) as a Flask Blueprint registered under `/api/offshore-assets`.

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/offshore-assets` | List all assets, ordered by `asset_id` | 200 | 500 |
| GET | `/api/offshore-assets/<id>` | Fetch one asset | 200 | 404, 500 |
| POST | `/api/offshore-assets` | Create an asset | 201 | 400, 409, 500 |
| PUT | `/api/offshore-assets/<id>` | Replace all four editable fields | 200 | 400, 404, 409, 500 |
| DELETE | `/api/offshore-assets/<id>` | Delete an asset with no inspection tasks | 200 | 404, 409, 500 |

Representation:

```json
{
  "asset_id": 1,
  "asset_name": "Mumbai High North Platform",
  "asset_type": "Production Platform",
  "latitude": 19.4512,
  "longitude": 71.3124
}
```

### Two things to know

- **Deletion is protected by the database itself.** Unlike vehicles, sensors, batteries and operators — whose child tables all `CASCADE` — `fk_inspection_asset` is `ON DELETE RESTRICT`. MySQL refuses the delete with error 1451 on its own. The API adds a pre-count inside a locked transaction so the client learns *how many* tasks are in the way, and keeps a 1451 handler as a genuine safety net. **All inspection tasks count, whatever their status** — a `Cancelled` task still blocks, because `RESTRICT` triggers on row existence and an API rule that ignored cancelled rows would promise a delete MySQL then refuses.
- **`asset_name` is unique and the comparison is case-insensitive.** The `utf8mb4_unicode_ci` collation means `"mumbai high north platform"` collides with the existing row and returns 409.

Example 409 body for asset 1 (whose only task is `Cancelled`):

```json
{
  "success": false,
  "message": "Offshore asset cannot be deleted because it has one or more inspection tasks",
  "dependencies": { "inspection_tasks": 1 }
}
```

**Validation rules for POST and PUT**

| Field | Rules |
| --- | --- |
| `asset_name` | required, string, non-blank after trimming, max 120 chars, unique |
| `asset_type` | required, string, non-blank after trimming, max 80 chars, free text |
| `latitude` | required, JSON number, finite, **−90 to 90 inclusive**, at most **6** decimal places |
| `longitude` | required, JSON number, finite, **−180 to 180 inclusive**, at most 6 decimal places |

Unknown JSON fields are rejected. The coordinates are `DECIMAL(9,6)` — six decimal places, a different precision from every other numeric column in the API — and they are the only fields that accept **negative** values, since southern and western hemisphere assets need them. The bounds are inclusive, so `90`, `-90`, `180`, `-180` and `0` are all valid. Booleans, strings such as `"19.45"`, `null`, arrays, objects, `NaN` and `Infinity` are rejected.

### curl examples (Windows CMD)

**List offshore assets**

```bash
curl.exe http://127.0.0.1:5000/api/offshore-assets
```

**Get asset 1**

```bash
curl.exe http://127.0.0.1:5000/api/offshore-assets/1
```

**Create a temporary unreferenced asset**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Krishna-Godavari Wellhead Platform B\",\"asset_type\":\"Wellhead Platform\",\"latitude\":15.842317,\"longitude\":81.204558}"
```

**Create with negative coordinates** (southern / western hemisphere)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"South Atlantic Test Buoy\",\"asset_type\":\"Monitoring Buoy\",\"latitude\":-33.918861,\"longitude\":-18.4233}"
```

**Update it** (replace `5` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/offshore-assets/5 -H "Content-Type: application/json" -d "{\"asset_name\":\"Krishna-Godavari Wellhead Platform B2\",\"asset_type\":\"Subsea Wellhead\",\"latitude\":15.9,\"longitude\":81.3}"
```

**Delete it → 200** (no inspection task targets it)

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/offshore-assets/5
```

**Missing asset 99999 → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/offshore-assets/99999
```

**Duplicate asset_name → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Mumbai High North Platform\",\"asset_type\":\"Production Platform\",\"latitude\":19.4512,\"longitude\":71.3124}"
```

**Latitude out of range → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Bad Latitude\",\"asset_type\":\"Platform\",\"latitude\":91,\"longitude\":81.2}"
```

**Longitude out of range → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Bad Longitude\",\"asset_type\":\"Platform\",\"latitude\":15.8,\"longitude\":-181}"
```

**Seven decimal places → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Too Precise\",\"asset_type\":\"Platform\",\"latitude\":1.2345678,\"longitude\":81.2}"
```

**Boolean latitude → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Boolean Latitude\",\"asset_type\":\"Platform\",\"latitude\":true,\"longitude\":81.2}"
```

**Unknown field → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/offshore-assets -H "Content-Type: application/json" -d "{\"asset_name\":\"Extra Field\",\"asset_type\":\"Platform\",\"latitude\":15.8,\"longitude\":81.2,\"depth_m\":45}"
```

**Delete asset 1 → 409, blocked by inspection tasks**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/offshore-assets/1
```

---

## REST API — expeditions and missions

Implemented in [backend/routes/expeditions.py](AquaFleet/backend/routes/expeditions.py) and [backend/routes/missions.py](AquaFleet/backend/routes/missions.py).

### Three ideas that shape both resources

- **Deletion guards prevent multi-level cascades.** `expedition → mission` cascades, and `mission` cascades again into six child tables plus `sample_aliquot` transitively. Deleting expedition 1 in raw SQL would destroy roughly 33 rows across 8 tables with no error raised. Both endpoints refuse instead: an expedition with any mission returns 409, and a mission with any operational record returns 409 listing every count. Neither ever deletes child rows on your behalf, and neither has a force-delete option.
- **Mission duration is derived, never stored.** There is no `duration_minutes` column. Reads compute it with `TIMESTAMPDIFF(MINUTE, start_time, end_time)`; it is `null` whenever `end_time` is null.
- **Parent existence and business consistency are validated transactionally.** Parent ids are checked for existence, and the expedition date window and zone depth band are read, inside the same transaction as the write — so they cannot shift between being checked and being relied upon. MySQL error 1452 is caught as a concurrency-safe fallback and reported as a 400, never as a 500.

### Expeditions

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/expeditions` | List all, joined, ordered by `expedition_id` | 200 | 500 |
| GET | `/api/expeditions/<id>` | Fetch one | 200 | 404, 500 |
| POST | `/api/expeditions` | Create | 201 | 400, 500 |
| PUT | `/api/expeditions/<id>` | Replace all seven editable fields | 200 | 400, 404, **409**, 500 |
| DELETE | `/api/expeditions/<id>` | Delete an expedition with no missions | 200 | 404, 409, 500 |

```json
{
  "expedition_id": 1,
  "vessel_id": 1,
  "vessel_name": "ORV Sagar Nidhi",
  "home_port": "Chennai, India",
  "title": "Andaman Deep Reef Biodiversity Survey",
  "start_date": "2025-11-03",
  "end_date": "2025-11-28",
  "objective": "Map mesophotic coral communities …",
  "status": "Completed",
  "budget": 18500000.0,
  "mission_count": 3
}
```

The vessel join and `mission_count` come from one statement, so listing N expeditions never becomes N+1 queries.

**PUT has its own 409.** Narrowing `start_date`/`end_date` so that an existing mission would fall outside the new window is refused — missions are never moved or deleted to make a range fit.

| Field | Rules |
| --- | --- |
| `vessel_id` | genuine integer > 0, must reference an existing `research_vessel` |
| `title` | string, non-blank after trimming, max 150 chars, **not unique** |
| `start_date` / `end_date` | exact `YYYY-MM-DD`, real calendar dates, `end_date >= start_date`; future dates allowed; same-day expeditions valid |
| `objective` | string, non-blank; max **65 535 UTF-8 bytes** (measured encoded, not in characters) |
| `status` | exactly `Planned`, `Active`, `Completed` or `Cancelled` |
| `budget` | number, finite, **≥ 0** (zero valid), ≤ 999999999999.99, at most 2 decimal places |

No duplicate-title detection: `expedition` has no UNIQUE constraint, so MySQL 1062 is unreachable.

### Missions

| Method | Endpoint | Purpose | Success | Error codes |
| --- | --- | --- | --- | --- |
| GET | `/api/missions` | List all, joined, ordered by `mission_id` | 200 | 500 |
| GET | `/api/missions/<id>` | Fetch one | 200 | 404, 500 |
| POST | `/api/missions` | Create | 201 | 400, 500 |
| PUT | `/api/missions/<id>` | Replace all seven editable fields | 200 | 400, 404, 500 |
| DELETE | `/api/missions/<id>` | Delete a mission with no operational records | 200 | 404, 409, 500 |

```json
{
  "mission_id": 1,
  "expedition_id": 1,
  "expedition_title": "Andaman Deep Reef Biodiversity Survey",
  "zone_id": 1,
  "zone_name": "Andaman Deep Reef Shelf",
  "region": "Andaman Sea",
  "mission_type": "Benthic Photographic Transect",
  "start_time": "2025-11-05 09:00:00",
  "end_time": "2025-11-05 15:30:00",
  "duration_minutes": 390,
  "depth_target": 320.0,
  "status": "Completed"
}
```

Example 409 for mission 1:

```json
{
  "success": false,
  "message": "Mission cannot be deleted because it has related operational records",
  "dependencies": {
    "vehicle_assignments": 2, "operator_assignments": 3, "telemetry_points": 4,
    "samples": 0, "incidents": 2, "inspection_tasks": 1, "total": 12
  }
}
```

| Field | Rules |
| --- | --- |
| `expedition_id`, `zone_id` | genuine integers > 0, must reference existing parents |
| `mission_type` | string, non-blank after trimming, max 80 chars |
| `start_time` | required, non-null, exactly `YYYY-MM-DD HH:MM:SS` |
| `end_time` | **key required, value may be `null`**; otherwise strict format and strictly later than `start_time` |
| `depth_target` | number, finite, **≥ 0** (zero valid), ≤ 999999.99, at most 2 decimal places |
| `status` | exactly `Planned`, `In Progress`, `Completed` or `Aborted` |

**Cross-field and cross-table rules:**

- `Completed` and `Aborted` require a non-null `end_time`; `Planned` and `In Progress` require it to be `null`.
- `DATE(start_time)` — and `DATE(end_time)` when set — must fall inside the expedition's date range, inclusive. Any time on a boundary day is fine.
- `depth_target` must lie between the zone's `min_depth` and `max_depth`, inclusive. The error names the allowed range without exposing SQL.

The ISO `T` separator, timezone suffixes, missing seconds and single-digit hours are all rejected. Duplicate missions are permitted — there is no UNIQUE constraint.

### curl examples (Windows CMD)

**List and get**

```bash
curl.exe http://127.0.0.1:5000/api/expeditions
```

```bash
curl.exe http://127.0.0.1:5000/api/expeditions/1
```

```bash
curl.exe http://127.0.0.1:5000/api/missions
```

```bash
curl.exe http://127.0.0.1:5000/api/missions/1
```

**Create a temporary expedition**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/expeditions -H "Content-Type: application/json" -d "{\"vessel_id\":2,\"title\":\"Lakshadweep Pelagic Survey\",\"start_date\":\"2026-11-01\",\"end_date\":\"2026-11-12\",\"objective\":\"Survey pelagic biodiversity and water-column conditions.\",\"status\":\"Planned\",\"budget\":7500000.0}"
```

**Update it** (replace `5` with the id returned above)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/expeditions/5 -H "Content-Type: application/json" -d "{\"vessel_id\":1,\"title\":\"Lakshadweep Pelagic Survey Phase II\",\"start_date\":\"2026-11-01\",\"end_date\":\"2026-11-20\",\"objective\":\"Extended survey window.\",\"status\":\"Active\",\"budget\":8250000.5}"
```

**Delete it → 200** (only once its missions are gone)

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/expeditions/5
```

**Missing vessel_id → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/expeditions -H "Content-Type: application/json" -d "{\"vessel_id\":99999,\"title\":\"Ghost Vessel Survey\",\"start_date\":\"2026-11-01\",\"end_date\":\"2026-11-12\",\"objective\":\"Test.\",\"status\":\"Planned\",\"budget\":100.0}"
```

**end_date before start_date → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/expeditions -H "Content-Type: application/json" -d "{\"vessel_id\":2,\"title\":\"Reversed Dates\",\"start_date\":\"2026-11-12\",\"end_date\":\"2026-11-01\",\"objective\":\"Test.\",\"status\":\"Planned\",\"budget\":100.0}"
```

**Invalid status → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/expeditions -H "Content-Type: application/json" -d "{\"vessel_id\":2,\"title\":\"Bad Status\",\"start_date\":\"2026-11-01\",\"end_date\":\"2026-11-12\",\"objective\":\"Test.\",\"status\":\"planned\",\"budget\":100.0}"
```

**Negative budget → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/expeditions -H "Content-Type: application/json" -d "{\"vessel_id\":2,\"title\":\"Negative Budget\",\"start_date\":\"2026-11-01\",\"end_date\":\"2026-11-12\",\"objective\":\"Test.\",\"status\":\"Planned\",\"budget\":-1}"
```

**Delete expedition 1 → 409, blocked by its 3 missions**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/expeditions/1
```

**Narrow expedition 1's dates around existing missions → 409**

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/expeditions/1 -H "Content-Type: application/json" -d "{\"vessel_id\":1,\"title\":\"Andaman Deep Reef Biodiversity Survey\",\"start_date\":\"2025-11-10\",\"end_date\":\"2025-11-12\",\"objective\":\"Narrowed range.\",\"status\":\"Completed\",\"budget\":18500000.0}"
```

**Create a mission under a temporary expedition** (replace `5` with its id)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":5,\"zone_id\":2,\"mission_type\":\"Pipeline Sonar Survey\",\"start_time\":\"2026-11-05 08:00:00\",\"end_time\":null,\"depth_target\":150.0,\"status\":\"Planned\"}"
```

**Update and delete it** (replace `8` with the mission id)

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/missions/8 -H "Content-Type: application/json" -d "{\"expedition_id\":5,\"zone_id\":2,\"mission_type\":\"Pipeline Sonar Survey Rev B\",\"start_time\":\"2026-11-05 08:00:00\",\"end_time\":\"2026-11-05 14:30:00\",\"depth_target\":120.25,\"status\":\"Completed\"}"
```

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/missions/8
```

**Missing expedition or zone → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":99999,\"zone_id\":99999,\"mission_type\":\"Ghost Dive\",\"start_time\":\"2026-09-20 07:00:00\",\"end_time\":null,\"depth_target\":150.0,\"status\":\"Planned\"}"
```

**Invalid datetime format → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":4,\"zone_id\":2,\"mission_type\":\"Bad Datetime\",\"start_time\":\"2026-09-20T07:00:00\",\"end_time\":null,\"depth_target\":150.0,\"status\":\"Planned\"}"
```

**end_time equal to start_time → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":4,\"zone_id\":2,\"mission_type\":\"Zero Duration\",\"start_time\":\"2026-09-20 07:00:00\",\"end_time\":\"2026-09-20 07:00:00\",\"depth_target\":150.0,\"status\":\"Completed\"}"
```

**Status / end_time mismatch → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":4,\"zone_id\":2,\"mission_type\":\"Completed No End\",\"start_time\":\"2026-09-20 07:00:00\",\"end_time\":null,\"depth_target\":150.0,\"status\":\"Completed\"}"
```

**Mission outside the expedition's dates → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":4,\"zone_id\":2,\"mission_type\":\"Out Of Window\",\"start_time\":\"2026-01-01 07:00:00\",\"end_time\":null,\"depth_target\":150.0,\"status\":\"Planned\"}"
```

**Depth outside the zone's range → 400** (zone 2 allows 20–250)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/missions -H "Content-Type: application/json" -d "{\"expedition_id\":4,\"zone_id\":2,\"mission_type\":\"Too Deep\",\"start_time\":\"2026-09-20 07:00:00\",\"end_time\":null,\"depth_target\":500.0,\"status\":\"Planned\"}"
```

**Delete mission 1 → 409 with exact dependency counts**

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/missions/1
```

---

## REST API — assignments (junction tables)

Four resources covering the M:N relationships, in [mission_vehicles.py](AquaFleet/backend/routes/mission_vehicles.py), [mission_operators.py](AquaFleet/backend/routes/mission_operators.py), [vehicle_sensors.py](AquaFleet/backend/routes/vehicle_sensors.py) and [vehicle_batteries.py](AquaFleet/backend/routes/vehicle_batteries.py).

### Five ideas shared by all four

- **Junction rows use composite keys.** There is no surrogate id, so the key components live in the URL path: `/api/mission-vehicles/<mission_id>/<vehicle_id>`. `vehicle_battery` has a three-column key whose third component is a DATETIME, so it uses a mandatory `?start_cycle=` query parameter instead.
- **PUT never changes key fields.** Only the descriptive columns are editable. Sending a key component in a PUT body is rejected as an unrecognised field — re-keying an assignment is a delete plus a create, never a silent update.
- **These tables are leaves.** Nothing references them, so their DELETE endpoints have **no dependency guard and never return 409**. Exactly one assignment row is removed, and neither parent is touched.
- **Both parents are checked before every write**, inside the transaction, returning field-level 400s (both together when both are missing), with MySQL 1452 caught as a concurrency fallback.
- **Duplicate composite keys return 409** via MySQL 1062, detected by the database rather than a preliminary SELECT.

| Resource | Prefix | Key | Editable by PUT |
| --- | --- | --- | --- |
| Mission–vehicle | `/api/mission-vehicles` | `(mission_id, vehicle_id)` | `launch_time`, `recovery_time` |
| Mission–operator | `/api/mission-operators` | `(mission_id, operator_id)` | `duty_role`, `shift` |
| Vehicle–sensor | `/api/vehicle-sensors` | `(vehicle_id, sensor_id)` | `mount_position`, `install_date` |
| Vehicle–battery | `/api/vehicle-batteries` | `(vehicle_id, battery_id, start_cycle)` | `end_cycle` only |

Each supports `GET` (list), `GET` (one), `POST`, `PUT`, `DELETE` — 20 endpoints in total.

### Resource-specific rules

**Mission–vehicle.** `launch_time` must fall within the mission's own window: not before `mission.start_time`, and not after `mission.end_time` when that is set. A non-null `recovery_time` must be strictly later than `launch_time` and no later than the mission end. When the mission is still running (`end_time IS NULL`) there is no upper bound to test. The `recovery_time` key is required but may be `null`, meaning still deployed.

**Mission–operator.** `duty_role` (≤ 80) and `shift` (≤ 50) are free text — the schema has no CHECK constraint on either, so no enumeration is invented.

**Vehicle–sensor.** `install_date` is strict `YYYY-MM-DD` and cannot be in the future; today is accepted, and the boundary is read from `date.today()` on every request. It is **deliberately not compared against `sensor.calibration_date`** — instruments are recalibrated on a schedule after fitting, and seven of the eight seeded rows have an earlier install date than their sensor's calibration date.

**Vehicle–battery.** The `start_cycle` query parameter is **mandatory** on GET-one, PUT and DELETE; missing or malformed values return 400 rather than silently matching the wrong period. `end_cycle` is required but may be `null` (still fitted).

### Battery overlap rule

**A physical battery pack may never have overlapping assignment periods — not on the same vehicle, and not across different vehicles.** One pack cannot power two things at once. **Different packs on the same vehicle are unconstrained** and may overlap freely.

Two half-open intervals overlap when `existing_start < new_end AND new_start < existing_end`, with a null end treated as open-ended. The comparisons are strict, so **adjacent periods are allowed**: an existing period ending exactly when the new one starts is not an overlap. On PUT the row being edited is excluded from its own scan, and the proposed start is always the original `start_cycle`.

### curl examples (Windows CMD)

**List and get-one**

```bash
curl.exe http://127.0.0.1:5000/api/mission-vehicles
```

```bash
curl.exe http://127.0.0.1:5000/api/mission-vehicles/1/1
```

```bash
curl.exe http://127.0.0.1:5000/api/mission-operators/1/1
```

```bash
curl.exe http://127.0.0.1:5000/api/vehicle-sensors/1/1
```

**Mission–vehicle lifecycle** (mission 7 has no vehicles; vehicle 5 is unassigned)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-vehicles -H "Content-Type: application/json" -d "{\"mission_id\":7,\"vehicle_id\":5,\"launch_time\":\"2026-09-18 08:00:00\",\"recovery_time\":null}"
```

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/mission-vehicles/7/5 -H "Content-Type: application/json" -d "{\"launch_time\":\"2026-09-18 08:30:00\",\"recovery_time\":null}"
```

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/mission-vehicles/7/5
```

**Missing parent → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-vehicles -H "Content-Type: application/json" -d "{\"mission_id\":99999,\"vehicle_id\":99999,\"launch_time\":\"2026-09-18 08:00:00\",\"recovery_time\":null}"
```

**Duplicate composite key → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-operators -H "Content-Type: application/json" -d "{\"mission_id\":1,\"operator_id\":1,\"duty_role\":\"Duplicate\",\"shift\":\"Day\"}"
```

**Invalid datetime format → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-vehicles -H "Content-Type: application/json" -d "{\"mission_id\":7,\"vehicle_id\":5,\"launch_time\":\"2026-09-18T08:00:00\",\"recovery_time\":null}"
```

**Recovery equal to launch → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-vehicles -H "Content-Type: application/json" -d "{\"mission_id\":7,\"vehicle_id\":5,\"launch_time\":\"2026-09-18 08:00:00\",\"recovery_time\":\"2026-09-18 08:00:00\"}"
```

**Launch outside the mission window → 400** (mission 7 starts 2026-09-18 07:00)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-vehicles -H "Content-Type: application/json" -d "{\"mission_id\":7,\"vehicle_id\":5,\"launch_time\":\"2026-09-18 06:00:00\",\"recovery_time\":null}"
```

**Mission–operator lifecycle**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/mission-operators -H "Content-Type: application/json" -d "{\"mission_id\":7,\"operator_id\":3,\"duty_role\":\"Inspection Data Analyst\",\"shift\":\"Day 08:00-16:00\"}"
```

```bash
curl.exe -i -X PUT http://127.0.0.1:5000/api/mission-operators/7/3 -H "Content-Type: application/json" -d "{\"duty_role\":\"Senior Inspection Analyst\",\"shift\":\"Night 20:00-04:00\"}"
```

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/mission-operators/7/3
```

**Vehicle–sensor lifecycle** (replace the date with today's)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicle-sensors -H "Content-Type: application/json" -d "{\"vehicle_id\":5,\"sensor_id\":1,\"mount_position\":\"Forward science bay\",\"install_date\":\"2026-08-12\"}"
```

```bash
curl.exe -i -X DELETE http://127.0.0.1:5000/api/vehicle-sensors/5/1
```

**Future install_date → 400**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicle-sensors -H "Content-Type: application/json" -d "{\"vehicle_id\":5,\"sensor_id\":1,\"mount_position\":\"Bay\",\"install_date\":\"2099-01-01\"}"
```

**Vehicle–battery: the start_cycle query parameter is mandatory**

```bash
curl.exe -i "http://127.0.0.1:5000/api/vehicle-batteries/1/1"
```

```bash
curl.exe -i "http://127.0.0.1:5000/api/vehicle-batteries/1/1?start_cycle=2025-11-01%2006:00:00"
```

**Battery overlap on the same vehicle → 409** (battery 3 already on vehicle 3 for Jan–Feb 2026)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicle-batteries -H "Content-Type: application/json" -d "{\"vehicle_id\":3,\"battery_id\":3,\"start_cycle\":\"2026-01-20 06:00:00\",\"end_cycle\":\"2026-02-01 06:00:00\"}"
```

**Battery overlap across a different vehicle → 409**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicle-batteries -H "Content-Type: application/json" -d "{\"vehicle_id\":5,\"battery_id\":3,\"start_cycle\":\"2026-01-20 06:00:00\",\"end_cycle\":\"2026-02-01 06:00:00\"}"
```

**Adjacent period accepted → 201** (starts exactly when the existing one ends)

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicle-batteries -H "Content-Type: application/json" -d "{\"vehicle_id\":5,\"battery_id\":3,\"start_cycle\":\"2026-02-10 19:00:00\",\"end_cycle\":\"2026-03-01 06:00:00\"}"
```

**Different batteries overlapping on one vehicle accepted → 201**

```bash
curl.exe -i -X POST http://127.0.0.1:5000/api/vehicle-batteries -H "Content-Type: application/json" -d "{\"vehicle_id\":5,\"battery_id\":2,\"start_cycle\":\"2026-02-15 06:00:00\",\"end_cycle\":\"2026-02-20 06:00:00\"}"
```

**Update and delete a battery period**

```bash
curl.exe -i -X PUT "http://127.0.0.1:5000/api/vehicle-batteries/5/3?start_cycle=2026-02-10%2019:00:00" -H "Content-Type: application/json" -d "{\"end_cycle\":\"2026-02-20 06:00:00\"}"
```

```bash
curl.exe -i -X DELETE "http://127.0.0.1:5000/api/vehicle-batteries/5/3?start_cycle=2026-02-10%2019:00:00"
```

**Missing composite-key row → 404**

```bash
curl.exe -i http://127.0.0.1:5000/api/mission-vehicles/7/5
```

---

## Phase 6 — mission-generated records and sample lineage API

Phase 6 adds five flat CRUD resources. Telemetry points and sample aliquots
use both columns of their weak-entity primary keys in item URLs; those keys
are supplied by clients and are never generated or renumbered.

| Resource | Collection | Item key | Joined parent information |
|---|---|---|---|
| Maintenance records | `/api/maintenance-records` | `/<maintenance_id>` | vehicle name, type and status |
| Telemetry points | `/api/telemetry-points` | `/<mission_id>/<log_no>` | mission type/status/window and depth target |
| Samples | `/api/samples` | `/<sample_id>` | mission type/status/window and aliquot count |
| Sample aliquots | `/api/sample-aliquots` | `/<sample_id>/<aliquot_no>` | sample type, preservation, custody and mission |
| Incidents | `/api/incidents` | `/<incident_id>` | mission type/status/window |

Every collection supports GET and POST. Every item supports GET, PUT and
DELETE. PUT is a complete replacement of mutable fields: primary keys and
parent references are immutable and are rejected when present. Dates use
`YYYY-MM-DD`; datetimes use `YYYY-MM-DD HH:MM:SS`.

Telemetry, sample collection and incident times must be inside their mission
window. Planned missions reject all three event types. An In Progress mission
without an end time accepts events at or after its start. A sample with one or
more aliquots returns 409 on DELETE; delete the aliquots first.

### Phase 6 Windows CMD `curl.exe` verification

Start Flask, then run these commands from a separate Windows CMD terminal.
Generated auto-increment IDs below assume the seed database; when they differ,
use the ID returned by POST.

#### Maintenance record lifecycle and validation

```bat
curl.exe http://127.0.0.1:5000/api/maintenance-records
curl.exe http://127.0.0.1:5000/api/maintenance-records/1
curl.exe -i -X POST http://127.0.0.1:5000/api/maintenance-records -H "Content-Type: application/json" -d "{\"vehicle_id\":5,\"maint_date\":\"2026-08-13\",\"action_taken\":\"Temporary Phase 6 verification\",\"cost\":0,\"next_due_date\":null}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/maintenance-records/7 -H "Content-Type: application/json" -d "{\"maint_date\":\"2026-08-13\",\"action_taken\":\"Updated verification\",\"cost\":1.25,\"next_due_date\":\"2026-08-14\"}"
curl.exe -i -X DELETE http://127.0.0.1:5000/api/maintenance-records/7
curl.exe -i -X POST http://127.0.0.1:5000/api/maintenance-records -H "Content-Type: application/json" -d "{\"vehicle_id\":99999,\"maint_date\":\"2026-08-13\",\"action_taken\":\"Missing parent\",\"cost\":0,\"next_due_date\":null}"
curl.exe -i -X POST http://127.0.0.1:5000/api/maintenance-records -H "Content-Type: application/json" -d "{\"vehicle_id\":1,\"maint_date\":\"13/08/2026\",\"action_taken\":\"Bad date\",\"cost\":0,\"next_due_date\":null}"
curl.exe -i -X POST http://127.0.0.1:5000/api/maintenance-records -H "Content-Type: application/json" -d "{\"vehicle_id\":1,\"maint_date\":\"2099-01-01\",\"action_taken\":\"Future date\",\"cost\":0,\"next_due_date\":null}"
curl.exe -i -X POST http://127.0.0.1:5000/api/maintenance-records -H "Content-Type: application/json" -d "{\"vehicle_id\":1,\"maint_date\":\"2026-08-13\",\"action_taken\":\"Bad ordering\",\"cost\":9999999999.99,\"next_due_date\":\"2026-08-12\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/maintenance-records/1 -H "Content-Type: application/json" -d "{\"vehicle_id\":1,\"maint_date\":\"2025-12-05\",\"action_taken\":\"Immutable parent\",\"cost\":1,\"next_due_date\":null}"
```

#### Telemetry composite-key lifecycle and boundaries

```bat
curl.exe http://127.0.0.1:5000/api/telemetry-points
curl.exe http://127.0.0.1:5000/api/telemetry-points/1/1
curl.exe -i -X POST http://127.0.0.1:5000/api/telemetry-points -H "Content-Type: application/json" -d "{\"mission_id\":1,\"log_no\":99,\"timestamp\":\"2025-11-05 10:00:00\",\"latitude\":-90,\"longitude\":180,\"depth\":999999.99,\"battery_level\":0,\"temperature\":-9999.99}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/telemetry-points/1/99 -H "Content-Type: application/json" -d "{\"timestamp\":\"2025-11-05 10:01:00\",\"latitude\":90,\"longitude\":-180,\"depth\":0,\"battery_level\":100,\"temperature\":9999.99}"
curl.exe -i -X DELETE http://127.0.0.1:5000/api/telemetry-points/1/99
curl.exe -i -X POST http://127.0.0.1:5000/api/telemetry-points -H "Content-Type: application/json" -d "{\"mission_id\":1,\"log_no\":1,\"timestamp\":\"2025-11-05 10:00:00\",\"latitude\":0,\"longitude\":0,\"depth\":0,\"battery_level\":100,\"temperature\":0}"
curl.exe -i -X POST http://127.0.0.1:5000/api/telemetry-points -H "Content-Type: application/json" -d "{\"mission_id\":7,\"log_no\":99,\"timestamp\":\"2026-09-18 08:00:00\",\"latitude\":0,\"longitude\":0,\"depth\":0,\"battery_level\":100,\"temperature\":0}"
curl.exe -i -X POST http://127.0.0.1:5000/api/telemetry-points -H "Content-Type: application/json" -d "{\"mission_id\":1,\"log_no\":99,\"timestamp\":\"2025-11-05 08:59:59\",\"latitude\":0,\"longitude\":0,\"depth\":0,\"battery_level\":100,\"temperature\":0}"
curl.exe -i -X POST http://127.0.0.1:5000/api/telemetry-points -H "Content-Type: application/json" -d "{\"mission_id\":1,\"log_no\":99,\"timestamp\":\"2025-11-05T10:00:00\",\"latitude\":0,\"longitude\":0,\"depth\":0,\"battery_level\":100.01,\"temperature\":0}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/telemetry-points/1/1 -H "Content-Type: application/json" -d "{\"mission_id\":1,\"timestamp\":\"2025-11-05 09:30:00\",\"latitude\":0,\"longitude\":0,\"depth\":0,\"battery_level\":100,\"temperature\":0}"
```

#### Sample and aliquot lifecycle, deletion protection and validation

```bat
curl.exe http://127.0.0.1:5000/api/samples
curl.exe http://127.0.0.1:5000/api/samples/1
curl.exe http://127.0.0.1:5000/api/sample-aliquots
curl.exe http://127.0.0.1:5000/api/sample-aliquots/1/1
curl.exe -i -X POST http://127.0.0.1:5000/api/samples -H "Content-Type: application/json" -d "{\"mission_id\":2,\"sample_type\":\"Temporary\",\"collected_at\":\"2025-11-09 10:00:00\",\"preservation_method\":\"Verification\",\"chain_of_custody_status\":\"Released\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/samples/9 -H "Content-Type: application/json" -d "{\"sample_type\":\"Temporary updated\",\"collected_at\":\"2025-11-09 10:01:00\",\"preservation_method\":\"Verification\",\"chain_of_custody_status\":\"Released\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/sample-aliquots -H "Content-Type: application/json" -d "{\"sample_id\":9,\"aliquot_no\":99,\"volume_ml\":99999999.99,\"storage_temp\":-9999.99}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/sample-aliquots/9/99 -H "Content-Type: application/json" -d "{\"volume_ml\":0.01,\"storage_temp\":9999.99}"
curl.exe -i -X DELETE http://127.0.0.1:5000/api/samples/9
curl.exe -i -X DELETE http://127.0.0.1:5000/api/sample-aliquots/9/99
curl.exe -i -X DELETE http://127.0.0.1:5000/api/samples/9
curl.exe -i -X DELETE http://127.0.0.1:5000/api/samples/1
curl.exe -i -X POST http://127.0.0.1:5000/api/sample-aliquots -H "Content-Type: application/json" -d "{\"sample_id\":1,\"aliquot_no\":1,\"volume_ml\":1,\"storage_temp\":4}"
curl.exe -i -X POST http://127.0.0.1:5000/api/sample-aliquots -H "Content-Type: application/json" -d "{\"sample_id\":99999,\"aliquot_no\":1,\"volume_ml\":1,\"storage_temp\":4}"
curl.exe -i -X POST http://127.0.0.1:5000/api/samples -H "Content-Type: application/json" -d "{\"mission_id\":7,\"sample_type\":\"Planned\",\"collected_at\":\"2026-09-18 08:00:00\",\"preservation_method\":\"Test\",\"chain_of_custody_status\":\"Collected\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/samples -H "Content-Type: application/json" -d "{\"mission_id\":2,\"sample_type\":\"Outside\",\"collected_at\":\"2025-11-09 13:10:01\",\"preservation_method\":\"Test\",\"chain_of_custody_status\":\"Collected\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/sample-aliquots -H "Content-Type: application/json" -d "{\"sample_id\":3,\"aliquot_no\":99,\"volume_ml\":0,\"storage_temp\":10000}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/sample-aliquots/1/1 -H "Content-Type: application/json" -d "{\"aliquot_no\":1,\"volume_ml\":1,\"storage_temp\":4}"
```

#### Incident lifecycle and validation

```bat
curl.exe http://127.0.0.1:5000/api/incidents
curl.exe http://127.0.0.1:5000/api/incidents/1
curl.exe -i -X POST http://127.0.0.1:5000/api/incidents -H "Content-Type: application/json" -d "{\"mission_id\":1,\"incident_type\":\"Temporary\",\"severity\":\"Low\",\"time_reported\":\"2025-11-05 10:00:00\",\"description\":\"Temporary verification\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/incidents/7 -H "Content-Type: application/json" -d "{\"incident_type\":\"Temporary updated\",\"severity\":\"Critical\",\"time_reported\":\"2025-11-05 10:01:00\",\"description\":\"Updated\"}"
curl.exe -i -X DELETE http://127.0.0.1:5000/api/incidents/7
curl.exe -i -X POST http://127.0.0.1:5000/api/incidents -H "Content-Type: application/json" -d "{\"mission_id\":7,\"incident_type\":\"Planned\",\"severity\":\"Low\",\"time_reported\":\"2026-09-18 08:00:00\",\"description\":\"Rejected\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/incidents -H "Content-Type: application/json" -d "{\"mission_id\":1,\"incident_type\":\"Outside\",\"severity\":\"Low\",\"time_reported\":\"2025-11-05 15:30:01\",\"description\":\"Rejected\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/incidents -H "Content-Type: application/json" -d "{\"mission_id\":1,\"incident_type\":\"Bad datetime\",\"severity\":\"low\",\"time_reported\":\"2025-11-05T10:00:00\",\"description\":\"Rejected\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/incidents/1 -H "Content-Type: application/json" -d "{\"mission_id\":1,\"incident_type\":\"Immutable parent\",\"severity\":\"Low\",\"time_reported\":\"2025-11-05 11:35:00\",\"description\":\"Rejected\"}"
```

---

## Phase 7 — inspection task API

Phase 7 completes CRUD coverage for the final schema table.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/inspection-tasks` | List joined tasks by `inspection_id` |
| GET | `/api/inspection-tasks/<inspection_id>` | Get one joined task |
| POST | `/api/inspection-tasks` | Create a task |
| PUT | `/api/inspection-tasks/<inspection_id>` | Replace mutable task fields |
| DELETE | `/api/inspection-tasks/<inspection_id>` | Delete a Pending task |

Joined responses contain the task fields plus mission type, status and window,
and offshore-asset name, type and coordinates:

```json
{
  "inspection_id": 5,
  "mission_id": 7,
  "mission_type": "Pipeline Corrosion Inspection",
  "mission_status": "Planned",
  "mission_start_time": "2026-09-18 07:00:00",
  "mission_end_time": null,
  "asset_id": 3,
  "asset_name": "Kochi LNG Terminal Jetty",
  "asset_type": "LNG Terminal Jetty",
  "asset_latitude": 9.9654,
  "asset_longitude": 76.2431,
  "task_type": "LNG Jetty Pile Corrosion Inspection",
  "priority": "Urgent",
  "status": "Pending",
  "finding_summary": null
}
```

`mission_id`, `asset_id`, and `inspection_id` are immutable during PUT.
Planned missions accept Pending and In Progress tasks. In Progress missions
accept every task status, subject to finding rules. Completed and Aborted
missions reject new tasks and lock existing tasks against edits.

Allowed transitions are Pending to In Progress/Cancelled and In Progress to
Completed/Cancelled. Same-state PUT is idempotent. Completed and Cancelled are
terminal. Completed tasks require a finding; Cancelled tasks require a
cancellation explanation. Only Pending tasks may be deleted. In Progress,
Completed, and Cancelled tasks return 409 to preserve history.

### Phase 7 Windows CMD `curl.exe` verification

Run the following in Windows CMD while Flask is running. Set `TASK_ID` to the
ID returned by the corresponding POST; auto-increment counters are intentionally
not reset.

List and fetch:

```bat
curl.exe http://127.0.0.1:5000/api/inspection-tasks
curl.exe http://127.0.0.1:5000/api/inspection-tasks/1
curl.exe -i http://127.0.0.1:5000/api/inspection-tasks/99999
```

Pending creation with a null finding, same-state PUT, and deletion:

```bat
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Temporary structural inspection\",\"priority\":\"Medium\",\"status\":\"Pending\",\"finding_summary\":null}"
set TASK_ID=REPLACE_WITH_RETURNED_ID
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID% -H "Content-Type: application/json" -d "{\"task_type\":\"Temporary structural inspection updated\",\"priority\":\"High\",\"status\":\"Pending\",\"finding_summary\":null}"
curl.exe -i -X DELETE http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID%
```

Planned-mission policy and duplicate allowance:

```bat
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":7,\"asset_id\":3,\"task_type\":\"Planned active preparation\",\"priority\":\"High\",\"status\":\"In Progress\",\"finding_summary\":null}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":7,\"asset_id\":3,\"task_type\":\"Rejected planned completion\",\"priority\":\"High\",\"status\":\"Completed\",\"finding_summary\":\"Finding supplied\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":7,\"asset_id\":3,\"task_type\":\"Rejected planned cancellation\",\"priority\":\"High\",\"status\":\"Cancelled\",\"finding_summary\":\"Cancellation explanation\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Duplicate allowed\",\"priority\":\"Low\",\"status\":\"Pending\",\"finding_summary\":null}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Duplicate allowed\",\"priority\":\"Low\",\"status\":\"Pending\",\"finding_summary\":null}"
```

Completed/Aborted mission policy and parent validation:

```bat
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":1,\"asset_id\":4,\"task_type\":\"Historical rejection\",\"priority\":\"Low\",\"status\":\"Pending\",\"finding_summary\":null}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/1 -H "Content-Type: application/json" -d "{\"task_type\":\"Historical edit rejection\",\"priority\":\"Low\",\"status\":\"Completed\",\"finding_summary\":\"Existing result\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":99999,\"asset_id\":99999,\"task_type\":\"Missing parents\",\"priority\":\"Low\",\"status\":\"Pending\",\"finding_summary\":null}"
```

The seed database has no Aborted mission. Test its POST and PUT locks with a
temporary Aborted mission in an isolated automated test; do not alter a seeded
mission merely to run a manual check.

Finding and body validation:

```bat
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Missing finding key\",\"priority\":\"Low\",\"status\":\"Pending\"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Blank finding\",\"priority\":\"Low\",\"status\":\"Pending\",\"finding_summary\":\"   \"}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Missing completion finding\",\"priority\":\"Low\",\"status\":\"Completed\",\"finding_summary\":null}"
curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" -d "{\"mission_id\":5,\"asset_id\":1,\"task_type\":\"Missing cancellation reason\",\"priority\":\"Low\",\"status\":\"Cancelled\",\"finding_summary\":null}"
python -c "import json;print(json.dumps({'mission_id':5,'asset_id':1,'task_type':'Oversized finding','priority':'Low','status':'Pending','finding_summary':'x'*65536}))" | curl.exe -i -X POST http://127.0.0.1:5000/api/inspection-tasks -H "Content-Type: application/json" --data-binary @-
```

Transition tests use a fresh temporary task for each terminal path:

```bat
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID% -H "Content-Type: application/json" -d "{\"task_type\":\"Active task\",\"priority\":\"High\",\"status\":\"In Progress\",\"finding_summary\":null}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID% -H "Content-Type: application/json" -d "{\"task_type\":\"Completed task\",\"priority\":\"High\",\"status\":\"Completed\",\"finding_summary\":\"Inspection completed successfully\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID% -H "Content-Type: application/json" -d "{\"task_type\":\"Cancelled task\",\"priority\":\"High\",\"status\":\"Cancelled\",\"finding_summary\":\"Cancelled because conditions became unsafe\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID% -H "Content-Type: application/json" -d "{\"task_type\":\"Invalid direct completion\",\"priority\":\"High\",\"status\":\"Completed\",\"finding_summary\":\"Not allowed from Pending\"}"
curl.exe -i -X PUT http://127.0.0.1:5000/api/inspection-tasks/%TASK_ID% -H "Content-Type: application/json" -d "{\"task_type\":\"Immutable parent\",\"priority\":\"High\",\"status\":\"Pending\",\"finding_summary\":null,\"mission_id\":5}"
```

Deletion policy, using seeded rows only for safe 409 checks:

```bat
curl.exe -i -X DELETE http://127.0.0.1:5000/api/inspection-tasks/6
curl.exe -i -X DELETE http://127.0.0.1:5000/api/inspection-tasks/1
curl.exe -i -X DELETE http://127.0.0.1:5000/api/inspection-tasks/7
```

---

## Opening and testing the frontend

Keep the Flask server running in its own terminal, then open the page.

**Option A — open the file directly.** Double-click `AquaFleet/frontend/index.html`, or run:

```bash
start AquaFleet\frontend\index.html
```

**Option B — serve it on a local port (recommended).** In a second terminal, from the `AquaFleet` folder:

```bash
python -m http.server 5500 --directory frontend
```

Then visit `http://localhost:5500` in your browser.

### What you should see

- A login screen followed by the AquaFleet dashboard after authentication
- A connected health indicator and live resource totals
- Searchable tables and record details for all domain resources
- Create/edit/delete controls that match the signed-in role's permission row
- Relationship forms that show readable vessel, expedition, zone, vehicle,
  operator, sensor, battery, sample and asset labels instead of raw IDs

If the indicator is red, confirm Flask and MySQL are running and refresh the dashboard.

---

## Phase 2 — DBMS depth and reporting

Phase 2 keeps the normalized tables as the source of truth and adds reusable
database programming objects for integrity and reporting. Re-run
`database/schema.sql`, then `database/sample_data.sql`, to install them in a
fresh database. The Reports item in the SPA is read-only for every role.

### Views

| View | Tables used | Purpose | Example |
|---|---|---|---|
| `vw_expedition_summary` | `expedition`, `research_vessel`, `mission` | Vessel and campaign details with a derived mission count | `SELECT * FROM vw_expedition_summary WHERE status = 'Active';` |
| `vw_mission_operations` | `mission`, `expedition`, `marine_zone`, both mission junctions | Mission context, `TIMESTAMPDIFF` duration and assignment counts | `SELECT * FROM vw_mission_operations WHERE zone_id = 2;` |
| `vw_vehicle_readiness` | `auv_rov`, `vehicle_sensor`, `vehicle_battery`, `maintenance_record` | Configuration and maintenance overview; an “open battery assignment” means only `end_cycle IS NULL` | `SELECT * FROM vw_vehicle_readiness WHERE status = 'Available';` |
| `vw_sample_lineage` | `expedition`, `mission`, `sample`, `sample_aliquot` | Traceability from campaign to each sample and optional aliquot | `SELECT * FROM vw_sample_lineage WHERE sample_id = 1;` |
| `vw_incident_overview` | `incident`, `mission`, `expedition`, `marine_zone` | Incident severity with operational location and campaign context | `SELECT * FROM vw_incident_overview WHERE severity = 'High';` |

The views name every selected column and derive values rather than duplicating
them in base tables.

### Triggers

| Trigger | Timing/event | Rule protected |
|---|---|---|
| `trg_mission_validate_bi` | Before mission insert | Depth is within the chosen zone and mission dates are within its expedition |
| `trg_mission_validate_bu` | Before mission update | The same cross-table mission rules remain true after edits |
| `trg_mission_vehicle_ready_bi` | Before assignment insert | A retired vehicle cannot be assigned to a mission |
| `trg_mission_vehicle_ready_bu` | Before assignment update | An assignment cannot be changed to a retired vehicle |

Flask performs the same checks early so API clients receive friendly errors.
The rejection triggers use `SIGNAL SQLSTATE '45000'` because integrity must
also hold for direct SQL, imports, and any future application client. They do
not make hidden status changes.

### Stored procedures

| Procedure | Parameters | Result |
|---|---|---|
| `sp_get_expedition_report` | `IN p_expedition_id INT` | Expedition summary plus ordered mission summaries |
| `sp_get_vehicle_maintenance_history` | `IN p_vehicle_id INT` | Vehicle readiness plus its maintenance history and costs |
| `sp_get_mission_summary` | `IN p_mission_id INT` | Mission context, vehicle assignments and operator assignments |
| `sp_get_expedition_metrics` | expedition ID plus three `OUT INT` values | Mission, incident and sample counts without inventing a cost relationship |

Example calls:

```sql
CALL sp_get_expedition_report(1);
CALL sp_get_vehicle_maintenance_history(1);
CALL sp_get_mission_summary(1);
CALL sp_get_expedition_metrics(1, @missions, @incidents, @samples);
SELECT @missions, @incidents, @samples;
```

A nonexistent ID returns empty report result sets (or zero metrics) rather
than modifying data.

### Transaction demonstrations

Run `database/demo_transactions.sql` only after loading the schema and sample
data. It demonstrates two real atomic workflows and removes every committed
demo row before finishing:

1. Mission creation plus vehicle/operator assignment. One path deliberately
   issues `ROLLBACK`; the successful path uses `COMMIT`.
2. Sample creation plus dependent aliquots. A questionable aliquot is undone
   with `ROLLBACK TO SAVEPOINT`, replaced, and then committed.

Atomicity means each multi-table workflow is accepted as a consistent unit or
none of it survives. `COMMIT` makes valid work durable, `ROLLBACK` abandons the
whole transaction, and a `SAVEPOINT` permits a partial correction without
discarding earlier valid statements.

### Reporting API and UI

The `reports` Flask blueprint exposes authenticated, read-only endpoints:

- `GET /api/reports/expeditions?status=Completed`
- `GET /api/reports/missions?status=Completed&zone_id=2`
- `GET /api/reports/vehicle-readiness?status=Available`
- `GET /api/reports/sample-lineage?expedition_id=1&mission_id=1`
- `GET /api/reports/incidents?severity=High&expedition_id=1`

Filters are allow-listed, validated and passed as SQL parameters. Successful
responses use `{success, report, count, data}`; validation and database errors
follow the existing AquaFleet error format. ADMIN, RESEARCHER, OPERATOR and
VIEWER can read reports, while every report mutation is denied. The SPA uses
five compact selector tabs and table-first results with clear empty states.

### Index review

Primary and unique keys already index identifiers. Existing explicit foreign
key indexes support the main joins, including expedition-to-vessel,
mission-to-expedition/zone, the two mission junctions, and mission-owned
telemetry, samples, incidents and inspections.

Phase 2 adds only three report-filter indexes:

- `idx_expedition_status (status)` for expedition summary filtering.
- `idx_mission_status (status)` for mission operations filtering.
- `idx_incident_severity_time (severity, time_reported)` for severity filters
  followed by the report's time ordering.

`EXPLAIN` verification confirms all three are candidate keys. MySQL may still
choose a full scan for the deliberately tiny sample dataset; the cost-based
choice can change as operational rows grow.

### Phase 2 verification

The integration suite creates `aquafleet_phase2_test`, loads the schema and
sample data, tests views/triggers/procedures/reports/query plans and the
transaction demo, then drops that database. Normal local AquaFleet data is not
changed.

```bat
set AQUAFLEET_RUN_DB_TESTS=1
backend\venv\Scripts\python.exe -m unittest backend.tests.test_phase2_database -v
backend\venv\Scripts\python.exe -m unittest backend.tests.test_rbac -v
node frontend\tests\phase1.test.js
node frontend\tests\phase2.test.js
```

---

## Phase 3 — existing-database upgrade and hardening

Phase 3 adds a non-destructive upgrade path for an existing `aquafleet_db`.
It preserves base-table rows and application users while installing the
VIEWER-compatible role constraint and the Phase 2 views, triggers, procedures
and report indexes. The migration is idempotent, so an interrupted deployment
can be checked and run again safely.

### Upgrade an existing local database

1. Stop writers and create a verified `mysqldump` backup outside committed
   source files. Keep database credentials in environment variables or the
   existing local `.env`; do not put them on the command line or in Git.
2. From `backend`, run the guarded upgrade utility:

   ```bat
   venv\Scripts\python.exe apply_database_upgrade.py
   ```

3. Confirm the utility reports preserved table counts and user records, plus
   21 tables, 5 views, 4 triggers, 4 procedures and 3 reporting indexes.
4. Start Flask and check `GET /api/health` and
   `GET /api/health/database` before allowing normal use.

The utility deliberately refuses any `DB_NAME` other than `aquafleet_db`.
The underlying SQL is
`database/migrations/phase3_upgrade_existing_database.sql`; do not substitute
`schema.sql` for this step because the schema bootstrap intentionally recreates
the database and is only for fresh installations.

### Verification

Run the complete project check from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

Use `-SkipDatabase` only when MySQL is unavailable; that skips the integration
coverage that proves migration idempotency, real-MySQL RBAC/CRUD/reporting,
trigger and constraint rejections, transaction rollback/commit behavior and
savepoint recovery. The database tests use disposable schemas and drop them
afterward; they do not mutate the normal `aquafleet_db`.

Phase 3 also verifies all role paths in a real browser. ADMIN has full domain
administration; RESEARCHER manages expeditions, missions and scientific sample
records; OPERATOR manages assigned operational records such as telemetry;
VIEWER is read-only. Flask authorization remains the security boundary even
when the SPA hides unavailable controls.
