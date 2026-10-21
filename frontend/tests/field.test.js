"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pages = new Map();
const window = {
  AquaFleetWorkspace: { register(config) { pages.set(config.key, config); } },
  AquaFleetWorkspaceComponents: { detailCard(options) { return options; } },
  AquaFleetUi: { formatDateTime(value) { return value || "—"; } }
};
const context = vm.createContext({ window });
for (const name of ["workspaces/data.js", "workspaces/pages/field.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8"), context);
}
assert.deepEqual([...pages.keys()], ["telemetry-points", "inspection-tasks"]);
const H = window.AquaFleetFieldWorkspaces;
const matches = window.AquaFleetWorkspaceData.matches;
function finds(page, row, info, query) {
  const values = page.searchValues(row, info);
  return matches(values, values.map((_, index) => index), query);
}

const telemetry = pages.get("telemetry-points");
const point = { mission_id: 5, log_no: 30, mission_type: "Vent Survey", mission_status: "In Progress", timestamp: "2026-08-03 05:00:00", latitude: 11.123456, longitude: 92.123456, depth: 1400.25, battery_level: 43.9, temperature: 3.2 };
const next = { ...point, log_no: 31, depth: 1550, battery_level: 61.3 };
assert.equal(H.telemetryKey(point), "5/30");
assert.notEqual(telemetry.identity(point), telemetry.identity(next));
let info = telemetry.context([point, next], { missions: [{ mission_id: 5, mission_type: "Vent Survey", status: "In Progress", start_time: "2026-08-03 04:30:00" }] });
assert.equal(telemetry.metrics([point, next], info)[0].value, "2");
assert.equal(telemetry.metrics([point, next], info)[1].value, "1550.00");
assert.equal(telemetry.metrics([point, next], info)[2].value, "43.90");
assert.equal(telemetry.metrics([point, next], info)[3].value, "1");
assert.equal(telemetry.filterValue(point), "In Progress");
assert.equal(telemetry.filters.includes("Warning"), false);
assert.equal(telemetry.detail(point, info).facts[1][1], "43.90");
assert.equal(telemetry.detail(point, info).linked[0].status, "In Progress");
assert.equal(finds(telemetry, point, info, "vent survey"), true);
info = telemetry.context([point], { missions: null });
assert.equal(telemetry.detail(point, info).linked, null);
assert.equal(telemetry.metrics([], telemetry.context([], { missions: [] }))[0].value, "0");

const inspections = pages.get("inspection-tasks");
const task = { inspection_id: 6, mission_id: 5, mission_type: "Vent Survey", asset_id: 3, asset_name: "Offshore Pile", asset_type: "Pile", task_type: "<b>QA inspection</b>", priority: "Urgent", status: "Pending", finding_summary: null };
const done = { ...task, inspection_id: 7, status: "Completed", priority: "High", finding_summary: "Recorded finding" };
info = inspections.context([task, done], { "offshore-assets": [{ asset_id: 3, asset_name: "Offshore Pile", asset_type: "Pile" }] });
assert.equal(inspections.metrics([task, done], info)[0].value, "2");
assert.equal(inspections.metrics([task, done], info)[1].value, "1");
assert.equal(inspections.metrics([task, done], info)[2].value, "1");
assert.equal(inspections.metrics([task, done], info)[3].value, "1");
assert.equal(H.isOpen(task), true);
assert.equal(H.isOpen(done), false);
assert.equal(inspections.detail(task, info).fields[1][1], "Not recorded");
assert.equal(inspections.detail(task, info).linked[0].title, "Offshore Pile");
assert.equal(inspections.detail(task, info).name, "<b>QA inspection</b>");
assert.equal(finds(inspections, task, info, "offshore pile"), true);
assert.equal(inspections.filters.includes("Cancelled"), true);
info = inspections.context([task], { "offshore-assets": null });
assert.equal(inspections.detail(task, info).linked, null);
assert.equal(inspections.metrics([], inspections.context([], { "offshore-assets": [] }))[2].value, "0");
console.log("Field telemetry and inspection mapping checks passed");
