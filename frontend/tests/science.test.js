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
for (const name of ["workspaces/data.js", "workspaces/pages/science.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8"), context);
}
assert.deepEqual([...pages.keys()], ["incidents", "samples", "sample-aliquots"]);
const helpers = window.AquaFleetScienceWorkspaces;
const matches = window.AquaFleetWorkspaceData.matches;
function finds(page, row, info, query) {
  const values = page.searchValues(row, info);
  return matches(values, values.map((_, index) => index), query);
}

const incident = pages.get("incidents");
const report = { incident_id: 1, mission_id: 3, incident_type: "Positioning", mission_type: "Shelf Survey", severity: "High", time_reported: "2026-01-01 09:00:00", description: "<b>QA sample</b>" };
let info = incident.context([report], { missions: [{ mission_id: 3, mission_type: "Shelf Survey", status: "Completed", start_time: "2026-01-01 08:00:00" }] });
assert.equal(incident.metrics([report], info)[1].value, "1");
assert.equal(incident.metrics([report], info)[2].value, "1");
assert.equal(incident.detail(report, info).linked[0].status, "Completed");
assert.equal(incident.detail(report, info).fields[1][1], "<b>QA sample</b>");
assert.equal(finds(incident, report, info, "shelf survey"), true);
assert.equal(incident.filterValue(report), "High");
info = incident.context([report], { missions: null });
assert.equal(incident.detail(report, info).linked, null);
assert.equal(incident.metrics([report], info)[2].note, "Mission collection unavailable");
assert.equal(incident.metrics([], incident.context([], { missions: [] }))[0].value, "0");

const sample = pages.get("samples");
const parent = { sample_id: 4, mission_id: 3, mission_type: "Shelf Survey", sample_type: "<b>QA sample</b>", collected_at: "2026-01-01 10:00:00", preservation_method: "Chilled", chain_of_custody_status: "Disposed", aliquot_count: 2 };
const aliquots = [
  { sample_id: 4, aliquot_no: 1, sample_type: parent.sample_type, preservation_method: "Chilled", volume_ml: 10, storage_temp: -80, chain_of_custody_status: "Disposed" },
  { sample_id: 4, aliquot_no: 2, sample_type: parent.sample_type, preservation_method: "Chilled", volume_ml: 20, storage_temp: 4, chain_of_custody_status: "Disposed" }
];
info = sample.context([parent], { "sample-aliquots": aliquots });
assert.equal(sample.metrics([parent], info)[1].value, "2");
assert.equal(sample.detail(parent, info).linked.length, 2);
assert.equal(sample.detail(parent, info).linked[0].status, "Sample: Disposed");
assert.equal(sample.filters.includes("Disposed"), true);
assert.equal(finds(sample, parent, info, "shelf survey"), true);
info = sample.context([parent], { "sample-aliquots": null });
assert.equal(sample.metrics([parent], info)[1].value, "Unavailable");
assert.equal(sample.detail(parent, info).linked, null);
assert.equal(sample.metrics([], sample.context([], { "sample-aliquots": [] }))[1].value, "0");

const aliquot = pages.get("sample-aliquots");
assert.equal(helpers.aliquotKey(aliquots[0]), "4/1");
assert.notEqual(aliquot.identity(aliquots[0]), aliquot.identity(aliquots[1]));
info = aliquot.context(aliquots, { samples: [parent] });
assert.equal(aliquot.metrics(aliquots, info)[1].value, "0.03");
assert.equal(aliquot.metrics(aliquots, info)[2].value, "1");
assert.equal(aliquot.metrics(aliquots, info)[3].value, "0");
assert.equal(aliquot.detail(aliquots[0], info).linked[0].title, "<b>QA sample</b>");
assert.equal(aliquot.filterValue(aliquots[0]), "Disposed");
assert.equal(finds(aliquot, aliquots[0], info, "chilled"), true);
info = aliquot.context(aliquots, { samples: null });
assert.equal(aliquot.detail(aliquots[0], info).linked, null);
assert.equal(aliquot.metrics([], aliquot.context([], { samples: [] }))[0].value, "0");
console.log("Science relationship, KPI and stored-status checks passed");
