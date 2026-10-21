"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const window = {
  AquaFleetApi: { get: async () => ({ data: [] }) },
  AquaFleetUi: {},
  AquaFleetAuth: { currentUser: () => ({ role: "VIEWER" }) }
};
const context = vm.createContext({ window });
for (const file of ["permissions.js", "report-csv.js", "reporting.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
}
const R = window.AquaFleetReports, Csv = window.AquaFleetReportCsv;
const expected = [
  ["expeditions", "/api/reports/expeditions", "expedition_id,title,vessel_name,start_date,end_date,status,budget,mission_count"],
  ["missions", "/api/reports/missions", "mission_id,mission_type,expedition_title,zone_name,duration_minutes,vehicle_count,operator_count,status"],
  ["vehicle-readiness", "/api/reports/vehicle-readiness", "vehicle_id,vehicle_name,vehicle_type,status,sensor_count,open_battery_assignment_count,last_maintenance_date,next_maintenance_due"],
  ["sample-lineage", "/api/reports/sample-lineage", "expedition_title,mission_type,sample_id,sample_type,collected_at,chain_of_custody_status,aliquot_no,volume_ml"],
  ["incidents", "/api/reports/incidents", "incident_id,incident_type,severity,mission_type,expedition_title,zone_name,time_reported"]
];
assert.equal(R.all.length, 5);
for (const [key, endpoint, fields] of expected) {
  const report = R.reportByKey(key);
  assert.equal(report.path, endpoint);
  assert.equal(report.columns.map((column) => column[0]).join(","), fields);
  assert.equal(Csv.filename(key), "aquafleet-" + key + "-report.csv");
  assert.equal(Csv.serialize(report.columns, []).replace(/^\uFEFF/, ""), report.columns.map((column) => column[1]).join(",") + "\r\n");
}
assert.equal(R.reportByKey("sample-lineage").localFilter.name, "chain_of_custody_status");
assert.equal(R.reportByKey("incidents").filter.name, "severity");
const report = R.reportByKey("expeditions");
const rows = [
  { expedition_id: 1, title: 'A, "B"\nC', vessel_name: "<b>literal</b>", start_date: null, end_date: "", status: "Active", budget: 100.5, mission_count: 2 },
  { expedition_id: 2, title: "=SUM(1,2)", vessel_name: "Safe", start_date: "2026-01-01", end_date: null, status: "Planned", budget: 0, mission_count: 0 }
];
const csv = Csv.serialize(report.columns, rows);
assert.ok(csv.startsWith("\uFEFFID,Expedition,Vessel,Start,End,Status,Budget,Missions\r\n"));
assert.ok(csv.includes('1,"A, ""B""\nC",<b>literal</b>,,,Active,100.5,2\r\n'));
assert.ok(csv.includes('2,"\'=SUM(1,2)",Safe,2026-01-01,,Planned,0,0\r\n'));
assert.equal((csv.match(/\r\n/g) || []).length, 3);
assert.equal(R.visibleRows(report, rows, "safe", "").length, 1);
assert.equal(R.visibleRows(report, rows, "missing", "").length, 0);
assert.equal(R.visibleRows(report, rows, "", "").length, 2);
const lineage = R.reportByKey("sample-lineage");
assert.equal(R.visibleRows(lineage, [{ chain_of_custody_status: "Stored" }, { chain_of_custody_status: "Disposed" }], "", "Disposed").length, 1);
assert.equal(R.canExport("success", rows), true);
assert.equal(R.canExport("success", []), false);
assert.equal(R.canExport("error", null), false);
assert.equal(R.canExport("loading", null), false);
for (const role of ["ADMIN", "OPERATOR", "RESEARCHER", "VIEWER"]) {
  assert.equal(window.AquaFleetPermissions.can("reports", "read", role), true);
  for (const action of ["create", "update", "delete"]) {
    assert.equal(window.AquaFleetPermissions.can("reports", action, role), false);
  }
}
console.log("Batch 7 report definitions, filters, CSV and RBAC checks passed");
