"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pages = new Map();
const window = {
  AquaFleetWorkspace: { register(config) { pages.set(config.key, config); } },
  AquaFleetWorkspaceComponents: { detailCard(options) { return options; } },
  AquaFleetUi: { formatDate(value) { return value || "—"; }, formatDateTime(value) { return value || "—"; } }
};
const context = vm.createContext({ window });
for (const name of ["workspaces/data.js", "workspaces/pages/equipment.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8"), context);
}
assert.deepEqual([...pages.keys()], ["vehicle-sensors", "vehicle-batteries", "maintenance-records"]);
const helpers = window.AquaFleetEquipmentWorkspaces;
const matches = window.AquaFleetWorkspaceData.matches;
function finds(page, row, info, query) {
  const values = page.searchValues(row, info);
  return matches(values, values.map((_, index) => index), query);
}

const install = pages.get("vehicle-sensors");
const installations = [
  { vehicle_id: 1, sensor_id: 2, vehicle_name: "Varuna", sensor_type: "CTD", manufacturer: "Maker", mount_position: "<b>bay</b>", install_date: "2026-01-01" },
  { vehicle_id: 1, sensor_id: 3, vehicle_name: "Varuna", sensor_type: "Camera", manufacturer: "Maker", mount_position: "Nose", install_date: "2026-01-02" }
];
assert.equal(helpers.sensorsKey(installations[0]), "1/2");
assert.notEqual(install.identity(installations[0]), install.identity(installations[1]));
let info = install.context(installations, { sensors: [{ sensor_id: 2, sensor_type: "CTD", calibration_date: "2025-12-01" }], vehicles: [{ vehicle_id: 1 }, { vehicle_id: 2 }] });
assert.equal(install.metrics(installations, info)[1].value, "1");
assert.equal(install.metrics(installations, info)[3].value, "2");
assert.equal(finds(install, installations[0], info, "ctd"), true);
assert.equal(install.detail(installations[0], info).linked[0].status, "Date recorded");
assert.equal(install.detail(installations[0], info).fields[0][1], "<b>bay</b>");
info = install.context(installations, { sensors: null, vehicles: null });
assert.equal(install.metrics(installations, info)[1].note, "Fleet total unavailable");
assert.equal(install.detail(installations[0], info).linked, null);
info = install.context([], { sensors: [], vehicles: [] });
assert.equal(install.metrics([], info)[0].value, "0");

const battery = pages.get("vehicle-batteries");
const period = { vehicle_id: 1, battery_id: 2, vehicle_name: "Varuna", chemistry: "Li-Ion", capacity_wh: 1200, start_cycle: "2026-01-01 00:00:00", end_cycle: null };
const later = { ...period, start_cycle: "2026-06-01 00:00:00", end_cycle: "2026-07-01 00:00:00" };
assert.notEqual(battery.identity(period), battery.identity(later));
assert.equal(helpers.batteriesKey(period), "1/2/2026-01-01 00:00:00");
assert.equal(battery.filterValue(period), "Open");
assert.equal(battery.filterValue(later), "Closed");
info = battery.context([period, later], { "battery-packs": [{ battery_id: 2, chemistry: "Li-Ion", cycle_count: 5, health_status: "Good" }] });
assert.equal(battery.metrics([period, later], info)[1].value, "1");
assert.equal(battery.metrics([period, later], info)[2].value, "1");
assert.equal(finds(battery, period, info, "varuna"), true);
assert.equal(battery.detail(period, info).fields[1][1], "Open period");
info = battery.context([period], { "battery-packs": null });
assert.equal(battery.metrics([period], info)[3].note, "Pack inventory unavailable");
assert.equal(battery.detail(period, info).linked, null);

const maintenance = pages.get("maintenance-records");
const record = { maintenance_id: 4, vehicle_id: 2, vehicle_name: "Neelkanth", vehicle_type: "ROV", vehicle_status: "Deployed", maint_date: "2025-01-01", next_due_date: "2025-06-01", action_taken: "Seal check", cost: 12500 };
assert.equal(maintenance.identity, null);
assert.equal(helpers.maintenanceStatus(record, "2026-01-01"), "Past due date");
assert.equal(helpers.maintenanceStatus({ ...record, next_due_date: "2026-02-01" }, "2026-01-01"), "Future due date");
assert.equal(helpers.maintenanceStatus({ ...record, next_due_date: "2026-01-01" }, "2026-01-01"), "Due today");
assert.equal(helpers.maintenanceStatus({ ...record, next_due_date: null }, "2026-01-01"), "No due date");
assert.equal(finds(maintenance, record, {}, "seal check"), true);
assert.equal(maintenance.detail(record).linked[0].status, "Deployed");
assert.equal(maintenance.metrics([record])[2].value, "0.01");
assert.equal(maintenance.filters.includes("Completed"), false);
console.log("Equipment relationship mapping checks passed");
