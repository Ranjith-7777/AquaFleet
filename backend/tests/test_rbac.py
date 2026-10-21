"""RBAC boundary tests that require neither MySQL nor sample-data mutation."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Blueprint, Flask, g, jsonify

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from authentication import (  # noqa: E402
    RESOURCE_PERMISSIONS,
    SESSION_FULL_NAME,
    SESSION_ROLE,
    SESSION_USERNAME,
    SESSION_USER_ID,
    guard_authorization,
    guard_request,
    is_authorized,
)


class FakeCursor:
    def __init__(self, account):
        self.account = account
        self.closed = False

    def execute(self, query, params):
        self.user_id = params[0]

    def fetchone(self):
        if self.account is None or self.account["user_id"] != self.user_id:
            return None
        return dict(self.account)

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, account_provider):
        self.account_provider = account_provider
        self.connected = True

    def cursor(self, dictionary=False):
        return FakeCursor(self.account_provider())

    def is_connected(self):
        return self.connected

    def close(self):
        self.connected = False


def build_test_app(account_provider):
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY="rbac-tests-only-secret")

    @app.before_request
    def protect_request():
        blocked = guard_request()
        if blocked is not None:
            return blocked
        return guard_authorization()

    resources = {
        "vessels": "/api/vessels",
        "expeditions": "/api/expeditions",
        "missions": "/api/missions",
        "samples": "/api/samples",
        "telemetry_points": "/api/telemetry-points",
    }
    for blueprint_name, path in resources.items():
        blueprint = Blueprint(blueprint_name, __name__ + blueprint_name)

        def endpoint(name=blueprint_name):
            return jsonify({"success": True, "resource": name}), 200

        blueprint.add_url_rule("", "resource", endpoint,
                               methods=["GET", "POST", "PUT", "DELETE"])
        app.register_blueprint(blueprint, url_prefix=path)
    return app


class PermissionMatrixTests(unittest.TestCase):
    def test_every_resource_has_explicit_mutation_policy(self):
        self.assertEqual(21, len(RESOURCE_PERMISSIONS))
        for policy in RESOURCE_PERMISSIONS.values():
            self.assertEqual({"create", "update", "delete"}, set(policy))

    def test_every_registered_domain_blueprint_has_a_policy(self):
        from app import app as production_app

        domain_blueprints = set(production_app.blueprints) - {"auth"}
        self.assertEqual(domain_blueprints, set(RESOURCE_PERMISSIONS))

    def test_viewer_is_read_only(self):
        for resource in RESOURCE_PERMISSIONS:
            self.assertTrue(is_authorized("VIEWER", resource, "GET"))
            for method in ("POST", "PUT", "PATCH", "DELETE"):
                self.assertFalse(is_authorized("VIEWER", resource, method))

    def test_researcher_policy(self):
        self.assertTrue(is_authorized("RESEARCHER", "expeditions", "POST"))
        self.assertTrue(is_authorized("RESEARCHER", "missions", "PUT"))
        self.assertTrue(is_authorized("RESEARCHER", "samples", "POST"))
        self.assertFalse(is_authorized("RESEARCHER", "samples", "DELETE"))
        self.assertFalse(is_authorized("RESEARCHER", "vessels", "PUT"))
        self.assertFalse(is_authorized("RESEARCHER", "telemetry_points", "POST"))

    def test_operator_policy(self):
        self.assertTrue(is_authorized("OPERATOR", "missions", "PUT"))
        self.assertTrue(is_authorized("OPERATOR", "telemetry_points", "POST"))
        self.assertTrue(is_authorized("OPERATOR", "vehicle_batteries", "DELETE"))
        self.assertFalse(is_authorized("OPERATOR", "expeditions", "POST"))
        self.assertFalse(is_authorized("OPERATOR", "samples", "PUT"))
        self.assertFalse(is_authorized("OPERATOR", "vessels", "DELETE"))

    def test_admin_has_every_mutation(self):
        for resource in RESOURCE_PERMISSIONS:
            for method in ("POST", "PUT", "PATCH", "DELETE"):
                expected = resource != "reports"
                if resource == "notifications":
                    # Rows are written only by database triggers.
                    expected = method in ("PUT", "PATCH")
                self.assertEqual(expected, is_authorized("ADMIN", resource, method))


class AuthorizationBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.account = {
            "user_id": 7,
            "username": "course-user",
            "full_name": "Course User",
            "role": "VIEWER",
            "is_active": True,
        }
        self.app = build_test_app(lambda: self.account)
        self.connection_patch = patch(
            "authentication.get_db_connection",
            side_effect=lambda: FakeConnection(lambda: self.account),
        )
        self.connection_patch.start()
        self.client = self.app.test_client()

    def tearDown(self):
        self.connection_patch.stop()

    def login_session(self, cookie_role=None):
        with self.client.session_transaction() as session:
            session[SESSION_USER_ID] = self.account["user_id"]
            session[SESSION_USERNAME] = self.account["username"]
            session[SESSION_FULL_NAME] = self.account["full_name"]
            session[SESSION_ROLE] = cookie_role or self.account["role"]

    def test_unauthenticated_protected_endpoint_is_401(self):
        response = self.client.get("/api/vessels")
        self.assertEqual(401, response.status_code)
        self.assertEqual("Authentication required", response.get_json()["message"])

    def test_viewer_get_allowed_and_mutations_forbidden(self):
        self.login_session()
        self.assertEqual(200, self.client.get("/api/vessels").status_code)
        for method in ("post", "put", "delete"):
            response = getattr(self.client, method)("/api/vessels", json={})
            self.assertEqual(403, response.status_code)
            self.assertEqual("INSUFFICIENT_PERMISSIONS",
                             response.get_json()["error_code"])

    def test_researcher_allowed_and_forbidden_http_mutations(self):
        self.account["role"] = "RESEARCHER"
        self.login_session()
        self.assertEqual(200, self.client.post("/api/expeditions", json={}).status_code)
        self.assertEqual(200, self.client.put("/api/missions", json={}).status_code)
        self.assertEqual(200, self.client.post("/api/samples", json={}).status_code)
        self.assertEqual(403, self.client.post("/api/telemetry-points", json={}).status_code)
        self.assertEqual(403, self.client.delete("/api/samples").status_code)

    def test_operator_allowed_and_forbidden_http_mutations(self):
        self.account["role"] = "OPERATOR"
        self.login_session()
        self.assertEqual(200, self.client.put("/api/missions", json={}).status_code)
        self.assertEqual(200, self.client.post("/api/telemetry-points", json={}).status_code)
        self.assertEqual(403, self.client.post("/api/expeditions", json={}).status_code)
        self.assertEqual(403, self.client.put("/api/samples", json={}).status_code)

    def test_admin_mutations_reach_the_endpoint(self):
        self.account["role"] = "ADMIN"
        self.login_session()
        for method in ("post", "put", "delete"):
            self.assertEqual(200, getattr(self.client, method)("/api/vessels", json={}).status_code)

    def test_database_role_change_takes_effect_without_cookie_change(self):
        self.login_session(cookie_role="VIEWER")
        self.assertEqual(403, self.client.post("/api/vessels", json={}).status_code)
        self.account["role"] = "ADMIN"
        self.assertEqual(200, self.client.post("/api/vessels", json={}).status_code)

    def test_deactivated_user_is_blocked_and_session_cleared(self):
        self.login_session()
        self.account["is_active"] = False
        response = self.client.get("/api/vessels")
        self.assertEqual(403, response.status_code)
        self.assertEqual("ACCOUNT_INACTIVE", response.get_json()["error_code"])
        with self.client.session_transaction() as session:
            self.assertNotIn(SESSION_USER_ID, session)

    def test_rbac_403_does_not_clear_session(self):
        self.login_session()
        response = self.client.post("/api/vessels", json={})
        self.assertEqual(403, response.status_code)
        with self.client.session_transaction() as session:
            self.assertEqual(self.account["user_id"], session[SESSION_USER_ID])
        self.assertEqual(200, self.client.get("/api/vessels").status_code)


if __name__ == "__main__":
    unittest.main()
