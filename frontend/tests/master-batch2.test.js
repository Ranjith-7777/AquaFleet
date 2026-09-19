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
for (const file of ["workspaces/data.js", "workspaces/pages/master-batch2.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}
assert.deepEqual([...pages.keys()], ["offshore-assets", "operators", "vehicles", "sensors", "battery-packs"]);
assert.deepEqual(Array.from(pages.get("vehicles").tabs, (tab) => tab.label), ["Vehicles", "Sensors", "Battery Packs", "Vehicle Sensors", "Vehicle Batteries", "Maintenance"]);
assert.equal(pages.get("sensors").eyebrow, "AquaFleet Command · Vehicles");
assert.equal(pages.get("offshore-assets").tabs[2].label, "Offshore Assets");

const asset = pages.get("offshore-assets");
const matches = window.AquaFleetWorkspaceData.matches;
function finds(page, row, info, query) {
  const values = page.searchValues(row, info);
  return matches(values, values.map((_, index) => index), query);
}
const assets = [{ asset_id: 1, asset_name: "<script>", asset_type: "Cable", latitude: 0, longitude: 0 }, { asset_id: 2, asset_name: "Pier", asset_type: "Jetty" }];
let info = asset.context(assets, { "inspection-tasks": [] });
assert.equal(asset.filterValue(assets[0], info), "Not inspected");
assert.equal(asset.metrics(assets, info)[1].value, "0");
assert.equal(asset.detail(assets[0], info).linked.length, 0);
info = asset.context(assets, { "inspection-tasks": null });
assert.equal(asset.filterValue(assets[0], info), "Unavailable");
assert.equal(asset.metrics(assets, info)[1].value, "—");
assert.equal(asset.detail(assets[0], info).linked, null);
info = asset.context(assets, { "inspection-tasks": [{ asset_id: 1, status: "Pending", task_type: "Check", priority: "High" }] });
assert.equal(asset.filterValue(assets[0], info), "Open Tasks");
assert.equal(asset.columns[4].value(assets[0], info), "1");
assert.equal(finds(asset, assets[0], info, "cable"), true);
assert.equal(finds(asset, assets[0], info, "missing"), false);

const operator = pages.get("operators");
const people = [{ operator_id: 4, first_name: "Ada", last_name: "Wave", role: "Pilot", certification_level: "Level 4 - Expert", contact_numbers: ["123"] }];
info = operator.context(people, { "mission-operators": [{ operator_id: 4, mission_id: 9, mission_type: "Survey", duty_role: "Pilot", shift: "Day" }], missions: [{ mission_id: 9, status: "In Progress" }] });
assert.equal(operator.filterValue(people[0], info), "In-Progress Mission");
assert.equal(operator.metrics(people, info)[1].value, "1");
assert.equal(operator.metrics(people, info)[2].value, "1");
assert.equal(operator.columns[1].value(people[0]), "Ada Wave");
assert.equal(operator.detail(people[0], info).linked[0].status, "In Progress");
assert.equal(finds(operator, people[0], info, "ada"), true);
info = operator.context(people, { "mission-operators": [], missions: null });
assert.equal(operator.filterValue(people[0], info), "Unassigned");
info = operator.context(people, { "mission-operators": null, missions: [] });
assert.equal(operator.filterValue(people[0], info), "Unavailable");

const vehicle = pages.get("vehicles");
const rover = { vehicle_id: 2, vehicle_name: "ROV", vehicle_type: "ROV", model: "M", max_depth: 2000, status: "Available" };
info = vehicle.context([rover], { "vehicle-sensors": [], "mission-vehicles": [], "vehicle-batteries": [], missions: [] });
assert.equal(vehicle.columns[3].value(rover, info), "0");
assert.equal(vehicle.detail(rover, info).fields[0][1], "None open");
assert.equal(finds(vehicle, rover, info, "rov"), true);
info = vehicle.context([rover], { "vehicle-sensors": null, "mission-vehicles": [], "vehicle-batteries": null, missions: [] });
assert.equal(vehicle.columns[3].value(rover, info), "—");
assert.equal(vehicle.detail(rover, info).fields[0][1], "Unavailable");

const sensor = pages.get("sensors");
const instrument = { sensor_id: 1, sensor_type: "CTD", manufacturer: "M", calibration_date: null, accuracy: 0.005 };
info = sensor.context([instrument], { "vehicle-sensors": [] });
assert.equal(sensor.filterValue(instrument, info), "Not recorded");
assert.equal(sensor.metrics([instrument], info)[2].value, "0");
assert.equal(finds(sensor, instrument, info, "ctd"), true);
info = sensor.context([instrument], { "vehicle-sensors": null });
assert.equal(sensor.metrics([instrument], info)[2].value, "—");
assert.equal(sensor.columns[4].value(instrument, info), "—");

const battery = pages.get("battery-packs");
const pack = { battery_id: 3, chemistry: "Li-Ion", capacity_wh: 900, health_status: "Poor", cycle_count: 7 };
info = battery.context([pack], { "vehicle-batteries": [] });
assert.equal(battery.filters.includes("Poor"), true);
assert.equal(battery.filterValue(pack), "Poor");
assert.equal(battery.metrics([pack], info)[1].value, "900");
assert.equal(battery.detail(pack, info).facts[1][1], "0");
assert.equal(finds(battery, pack, info, "li-ion"), true);
info = battery.context([pack], { "vehicle-batteries": null });
assert.equal(battery.detail(pack, info).facts[1][1], "Unavailable");

for (const page of pages.values()) {
  assert.equal(page.relationKeys.length > 0, true);
  assert.equal(page.columns.some((column) => column.type === "primary"), true);
  assert.equal(page.filters[0], "All");
  assert.equal(page.idField.endsWith("_id"), true);
}
console.log("Batch 2 data mapping checks passed");
