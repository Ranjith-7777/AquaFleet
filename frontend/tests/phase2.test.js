/* Plain Node checks for the browser-side Phase 2 report registry. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frontend = path.resolve(__dirname, "..");
const window = {
  AquaFleetApi: { get: async () => ({ data: [] }) },
  AquaFleetUi: {}
};
const context = vm.createContext({ window });
const filename = path.join(frontend, "js", "reporting.js");
vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });

const reports = window.AquaFleetReports.all;
assert.equal(5, reports.length);
assert.deepEqual(
  Array.from(reports, report => report.key),
  ["expeditions", "missions", "vehicle-readiness", "sample-lineage", "incidents"]
);

for (const report of reports) {
  assert.match(report.path, /^\/api\/reports\//);
  assert.match(report.view, /^vw_/);
  assert.ok(report.columns.length >= 7, `${report.key} has useful report columns`);
  assert.equal(new Set(report.columns.map(column => column[0])).size, report.columns.length);
}

assert.equal("status", reports[0].filter.name);
assert.equal("status", reports[1].filter.name);
assert.equal("status", reports[2].filter.name);
assert.equal(undefined, reports[3].filter);
assert.equal("severity", reports[4].filter.name);

const indexHtml = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(frontend, "js", "app.js"), "utf8");
assert.match(indexHtml, /data-view="reports"/);
assert.match(indexHtml, /js\/reporting\.js/);
assert.match(appSource, /Reports\.render/);

console.log("Phase 2 frontend reporting checks passed");
