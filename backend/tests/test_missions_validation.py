"""Focused regression tests for mission workflow business rules."""

import sys
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from routes.missions import validate_against_parents, validate_mission_payload  # noqa: E402


class MissionValidationTests(unittest.TestCase):
    def valid_payload(self):
        return {
            "expedition_id": 1,
            "zone_id": 1,
            "mission_type": "Soil Check",
            "start_time": "2025-11-10 08:00:00",
            "end_time": None,
            "depth_target": 500,
            "status": "Planned",
        }

    def test_planned_and_in_progress_require_null_end_time(self):
        for status in ("Planned", "In Progress"):
            with self.subTest(status=status):
                payload = self.valid_payload()
                payload.update(status=status, end_time="2025-11-10 09:00:00")
                _, errors = validate_mission_payload(payload)
                self.assertIn("must be null", errors["end_time"])

    def test_completed_and_aborted_require_end_time(self):
        for status in ("Completed", "Aborted"):
            with self.subTest(status=status):
                payload = self.valid_payload()
                payload["status"] = status
                _, errors = validate_mission_payload(payload)
                self.assertIn("must not be null", errors["end_time"])

    def test_valid_completion_is_accepted(self):
        payload = self.valid_payload()
        payload.update(status="Completed", end_time="2025-11-10 09:00:00")
        cleaned, errors = validate_mission_payload(payload)
        self.assertEqual({}, errors)
        self.assertEqual("Completed", cleaned["status"])

    def test_supplied_create_example_reports_date_range_but_depth_is_valid(self):
        payload = self.valid_payload()
        payload.update(
            start_time="2026-10-22 23:05:35",
            end_time=None,
            depth_target=500,
        )
        cleaned, errors = validate_mission_payload(payload)
        self.assertEqual({}, errors)
        parent_errors = validate_against_parents(
            cleaned,
            {"start_date": date(2025, 11, 3), "end_date": date(2025, 11, 28)},
            {"min_depth": Decimal("50.00"), "max_depth": Decimal("600.00")},
        )
        self.assertIn("start_time", parent_errors)
        self.assertNotIn("depth_target", parent_errors)


if __name__ == "__main__":
    unittest.main()
