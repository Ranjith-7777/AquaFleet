# AquaFleet Architecture and Code Guide

## Request path

```text
Browser UI
  -> Vanilla JavaScript fetch with session cookie
  -> Flask REST endpoint and central authentication/RBAC guard
  -> parameterized mysql-connector query
  -> MySQL 8 tables, constraints, triggers, views or procedures
  -> JSON response
  -> DOM rendering and user feedback
```

The layers have distinct responsibilities. The frontend presents workflows;
Flask validates input and authorizes actions; MySQL enforces relational and
transactional integrity. A hidden button is not treated as security.

## Frontend

The frontend is a single-page application using HTML5, Bootstrap 5, custom CSS
and small global JavaScript modules under `frontend/`.

| File | Responsibility |
|---|---|
| `index.html` | Application shell, navigation, authentication container, content panel, modal and script loading order |
| `js/app.js` | SPA coordinator: navigation, dashboard loading, resource tables, search, details and refresh behavior |
| `js/api.js` | Shared `fetch` wrapper, JSON parsing, cookies/credentials and normalized API errors |
| `js/auth.js` | Login/logout UI, current-user state and authenticated application shell |
| `js/permissions.js` | Client-side mirror of the role matrix used only to show appropriate controls |
| `js/resources.js` | Declarative resource metadata: endpoints, keys, columns, details and form definitions |
| `js/master-data.js` | Shared create/edit/delete modal engine, relationship option loading and form submission |
| `js/reporting.js` | Five report definitions, filters, tab selection, table rendering and report context rail |
| `js/ui.js` | Reusable DOM, formatting, alert, state-panel and modal helpers |
| `css/style.css` | AquaFleet visual system, responsive layout, tables, forms, authentication and report styling |

### From button click to visible result

For example, clicking **Add Mission** calls the shared form engine with the
mission resource definition. It loads expedition and zone choices through the
API, builds validated fields, then sends JSON with `Api.post`. Flask receives
the request at the missions Blueprint, the central guard verifies the signed
session and role, route validation checks the payload, and a parameterized
INSERT reaches MySQL. After a 201 JSON response, the modal closes and `app.js`
reloads the resource table. Errors remain JSON and are shown as accessible
alerts without discarding the valid session.

## Backend

Backend code lives under `backend/`.

| File/directory | Responsibility |
|---|---|
| `app.py` | Creates Flask, configures signed-session cookies/CORS, registers Blueprints, applies central guards and exposes health endpoints |
| `authentication.py` | Session helpers and the authoritative resource/action RBAC matrix |
| `database.py` | Creates MySQL connections from configuration |
| `config.py` | Reads database, session and CORS settings from environment / local `.env` |
| `create_demo_users.py` | Explicit local coursework account setup; hashes every password |
| `apply_database_upgrade.py` | Guarded existing-database migration with before/after verification |
| `routes/` | Authentication, reports and one Blueprint per domain resource |
| `tests/` | RBAC, views/triggers/procedures, migration, integrity, transaction and full-workflow tests |

### Flask Blueprints

A Blueprint groups related routes and supplies a stable endpoint namespace and
URL prefix, such as `/api/missions` or `/api/samples`. `app.py` registers all
Blueprints in one visible list. Resource modules keep their own validation,
CRUD SQL and error mapping instead of turning the application entry point into
one large file.

### Authentication and authorization

Login selects the account by a parameterized username query and verifies its
Werkzeug hash. Flask stores server-derived identity in a cookie signed by
`SECRET_KEY`; the password and hash never enter the cookie or API response.

Before every protected API request, `app.py` invokes helpers from
`authentication.py`. The helper re-reads the user by primary key so deletion,
deactivation or role changes take effect immediately. GET/HEAD is available to
all active canonical roles. POST/PUT/PATCH/DELETE is checked against the
central resource policy. Unauthenticated requests receive 401; authenticated
but forbidden actions receive 403.

### Parameterized SQL and transactions

Application values are supplied separately from SQL text using `%s`
placeholders. No route concatenates user input into a query. Dynamic report
filters are selected from allow-listed column definitions and their values are
still parameters.

Multi-step operations explicitly disable autocommit, commit only after every
statement succeeds and roll back on failure. MySQL constraints/triggers remain
effective even when data is changed outside Flask.

## Database assets

| File | Use |
|---|---|
| `database/schema.sql` | Fresh MySQL 8 database: 21 tables, constraints, indexes, views, triggers and procedures |
| `database/sample_data.sql` | Destructive deterministic domain-data reset for a known demo database only |
| `database/migrations/phase1_add_viewer_role.sql` | Earlier one-time VIEWER role upgrade |
| `database/migrations/phase3_upgrade_existing_database.sql` | Idempotent non-destructive upgrade for the finished existing database |
| `database/demo_transactions.sql` | Two full transaction demonstrations with cleanup |
| `database/faculty_demo.sql` | Ordered, safe viva queries covering core DBMS concepts |

The normalized tables are the source of truth. Views derive reporting data;
triggers reject invalid cross-table states; procedures package common reports;
indexes support FK joins and selected filters. Derived values such as mission
duration and assignment counts are calculated rather than stored redundantly.

## Running and verification

1. Load `schema.sql` and `sample_data.sql` only for a fresh/recreated demo
   database, or use the Phase 3 migration for an existing database.
2. Create/reset the four local demo accounts explicitly.
3. Run Flask on port 5000 and serve `frontend/` on port 5500.
4. Run `scripts/verify.ps1` from the repository root for compilation, all
   backend/database tests, JavaScript syntax, frontend tests and diff hygiene.

Secrets belong in ignored `backend/.env`. Database dumps and `.local_backups/`
are local recovery artifacts and are not source files.
