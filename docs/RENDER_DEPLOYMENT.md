# AquaFleet Render deployment preparation

This guide prepares a deployment for review. It does not authorize creating a
Render service, provisioning a database, changing an existing database, or
loading demo data.

## Architecture

One Render Python web service runs Gunicorn and Flask. Flask serves the existing
HTML/CSS/JavaScript frontend and the `/api` routes from the same HTTPS origin.
MySQL 8 remains an external managed service.

`render.yaml` deliberately disables auto-deploy. Normal builds and starts do
not run database initialization, migrations, sample-data loading, or account
creation.

## Render service

- Blueprint: repository-root `render.yaml`
- Runtime: Python 3.12
- Build: `pip install -r backend/requirements.txt`
- Start: one Gunicorn process with four threads, bound to Render's `PORT`
- Health check: `GET /api/health`
- Region: Singapore
- Auto-deploy: off

The single process is intentional because the default login limiter uses local
memory. Before increasing Gunicorn workers or scaling to multiple instances,
configure `RATELIMIT_STORAGE_URI` with a shared limits-compatible store.

## Required Render environment

The Blueprint generates `SECRET_KEY`. Enter the following database values in
Render; never place their values in Git or shell history:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Production settings already declared by the Blueprint:

- `FLASK_DEBUG=False`
- `SESSION_COOKIE_SECURE=True`
- `SESSION_LIFETIME_MINUTES=480`
- `LOGIN_RATE_LIMIT=10 per minute`
- `TRUST_PROXY_HEADERS=True` for Render's trusted forwarding hop
- `DB_CONNECT_TIMEOUT=10`
- `CORS_ORIGINS=` because production traffic is same-origin

For managed MySQL, download the provider's CA certificate and add it as a
Render secret file. Set `DB_SSL_CA` to the secret file's absolute path. Leave
`DB_SSL_VERIFY_CERT=True` and `DB_SSL_VERIFY_IDENTITY=True`. Do not disable
certificate verification to work around a certificate setup error.

## Database commands

Run these only as deliberate one-off commands with the same environment values
as the web service. They are never start or build commands.

### Inspect

```bash
cd backend
python manage_database.py status
```

This command is read-only.

### Initialize a new empty managed database

Create the database itself through the provider first. The application user
needs DDL privileges during setup. Then run:

```bash
cd backend
python manage_database.py initialize --confirm-empty-database
```

The command:

1. refuses to proceed if any base table already exists;
2. extracts only the non-destructive creation section of `database/schema.sql`;
3. creates all tables, relationships, views, triggers and procedures;
4. creates `schema_migration` and records checksummed baseline migrations;
5. loads no domain rows and creates no users.

If initialization fails after MySQL has committed some DDL, it leaves the
partial database untouched for inspection. It never drops objects to retry.
For a brand-new disposable database, delete and recreate that database through
the provider before retrying.

### Upgrade an existing AquaFleet database

First stop writers and create a verified logical backup with `mysqldump`. Then:

```bash
cd backend
python manage_database.py migrate
```

The command refuses empty or incomplete databases, takes a MySQL advisory lock,
applies pending migrations in order, records checksums, and detects migration
files changed after application. MySQL DDL is not transactional, so the backup
is required even though every migration is designed to be repeatable.

## Explicit faculty-demo setup

Only after selecting a new database dedicated to the faculty demonstration:

```bash
cd backend
python manage_database.py load-demo-data --confirm-reset-demo-data
python create_demo_users.py
```

The first command truncates and replaces all domain and notification demo rows.
It does not modify `app_user`. The second command creates missing demonstration
accounts and leaves existing accounts unchanged. Neither command runs during a
normal build, deploy, restart, or migration.

The checked-in demonstration credentials are public coursework credentials.
Use them only in the isolated faculty-demo database, restrict the service URL
where practical, and remove or replace the accounts before any wider use.

## Managed MySQL recommendation

Aiven currently offers a small free managed MySQL tier suitable for the faculty
demo. Confirm current availability, region, storage, inactivity and backup
limits before provisioning. It is not a high-availability production tier.
Use the provider's MySQL 8 connection details and CA certificate.

For longer-lived or operationally important use, choose a paid managed MySQL
plan with documented backups and recovery. Self-hosted MySQL on a Render disk
retains the engine but also makes upgrades, logical backups, monitoring and
recovery the project team's responsibility.

## Local verification

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

When MySQL is unavailable, `-SkipDatabase` runs only the non-database checks.
The complete run creates and removes disposable test databases; it never
changes `aquafleet_db`.
