/* Plain Node checks for the browser-side Phase 1 policy and form registry. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frontend = path.resolve(__dirname, "..");
const window = {
  AquaFleetAuth: { currentUser: () => ({ role: "VIEWER" }) },
  AquaFleetApi: {},
  AquaFleetUi: {}
};
const context = vm.createContext({ window });

function load(relativePath) {
  const filename = path.join(frontend, relativePath);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}

load("js/resources.js");
load("js/permissions.js");
load("js/master-data.js");

const permissions = window.AquaFleetPermissions;
const forms = window.AquaFleetMasterData.forms;

assert.equal(21, Object.keys(permissions.grants).length);
assert.equal(19, Object.keys(forms).length);

for (const resource of Object.keys(permissions.grants)) {
  assert.equal(true, permissions.can(resource, "read", "VIEWER"));
  assert.equal(false, permissions.can(resource, "create", "VIEWER"));
  assert.equal(false, permissions.can(resource, "update", "VIEWER"));
  assert.equal(false, permissions.can(resource, "delete", "VIEWER"));
  for (const action of ["create", "update", "delete"]) {
    /* Reports are read-only; notifications are written by triggers, so they
       can only be updated (marked read), never created or deleted. */
    const expected = resource === "reports" ? false : resource === "notifications" ? action === "update" : true;
    assert.equal(expected, permissions.can(resource, action, "ADMIN"));
  }
}

assert.equal(true, permissions.can("expeditions", "create", "RESEARCHER"));
assert.equal(false, permissions.can("expeditions", "delete", "RESEARCHER"));
assert.equal(true, permissions.can("samples", "update", "RESEARCHER"));
assert.equal(false, permissions.can("telemetry-points", "create", "RESEARCHER"));
assert.equal(true, permissions.can("missions", "update", "OPERATOR"));
assert.equal(true, permissions.can("telemetry-points", "delete", "OPERATOR"));
assert.equal(false, permissions.can("samples", "update", "OPERATOR"));

for (const requiredForm of [
  "expeditions", "missions", "mission-vehicles", "mission-operators",
  "vehicle-sensors", "vehicle-batteries", "maintenance-records",
  "telemetry-points", "samples", "sample-aliquots", "incidents",
  "inspection-tasks"
]) {
  assert.ok(forms[requiredForm], requiredForm + " form is registered");
}

const batteryPath = window.AquaFleetMasterData.recordPath(
  window.AquaFleetResources.byKey["vehicle-batteries"],
  { vehicle_id: 2, battery_id: 3, start_cycle: "2026-09-17 10:30:00" }
);
assert.equal(
  "/api/vehicle-batteries/2/3?start_cycle=2026-09-17%2010%3A30%3A00",
  batteryPath
);
assert.equal(
  "/api/mission-vehicles/4/5",
  window.AquaFleetMasterData.recordPath(
    window.AquaFleetResources.byKey["mission-vehicles"],
    { mission_id: 4, vehicle_id: 5 }
  )
);

console.log("Phase 1 frontend checks passed");
