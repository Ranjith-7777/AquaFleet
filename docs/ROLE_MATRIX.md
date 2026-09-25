# AquaFleet Demo Accounts and RBAC Matrix

These accounts are for the local coursework demonstration only. Run
`backend\venv\Scripts\python.exe backend\create_demo_users.py --reset` from
the repository root when a deliberate deterministic reset is required. The
database stores Werkzeug password hashes, never these plaintext passwords.

| Username | Coursework password | Role | Demonstration purpose |
|---|---|---|---|
| `admin` | `AquaAdmin@2026` | ADMIN | Complete administration and all workflows |
| `researcher` | `AquaResearch@2026` | RESEARCHER | Research planning and scientific samples |
| `operator` | `AquaOperator@2026` | OPERATOR | Mission execution, equipment and operational records |
| `viewer` | `AquaViewer@2026` | VIEWER | Read-only browsing and reports |

Change these credentials before any non-local deployment.

## Effective permissions

All four active roles may read domain resources and the five reports. Mutation
permissions are explicit:

| Resource group | ADMIN | RESEARCHER | OPERATOR | VIEWER |
|---|---|---|---|---|
| Vessels, zones, vehicles, operators, sensors, batteries, assets | Create/update/delete | Read | Read | Read |
| Expeditions | Create/update/delete | Create/update | Read | Read |
| Missions | Create/update/delete | Create/update | Update | Read |
| Mission–vehicle and mission–operator assignments | Create/update/delete | Create/update/delete | Create/update/delete | Read |
| Vehicle sensors and batteries | Create/update/delete | Read | Create/update/delete | Read |
| Maintenance, telemetry, incidents, inspection tasks | Create/update/delete | Read | Create/update/delete | Read |
| Samples and aliquots | Create/update/delete | Create/update | Read | Read |
| Notifications (trigger-written) | Read / mark read | Read / mark read | Read / mark read | Read |
| Reports | Read | Read | Read | Read |

The browser mirrors this matrix by hiding unavailable controls. That is only
user experience: `backend/authentication.py` re-reads the active database user
on every protected request and returns HTTP 403 when the method/resource action
is not granted. A 403 does not log the user out; an invalid or inactive session
returns 401/403 according to the authentication condition and is cleared when
appropriate.

## Fast faculty demonstration

1. Sign in as `admin`; open Expeditions or Missions and point out Add/Edit/Delete.
2. Sign out and use `viewer`; open the same resource and show that only View and
   Refresh remain.
3. Explain that a direct viewer `POST /api/vessels` also receives HTTP 403,
   proven by automated tests; frontend visibility is not the security boundary.
