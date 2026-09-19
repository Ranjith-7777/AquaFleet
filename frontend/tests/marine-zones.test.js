"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const window = {
  AquaFleetWorkspace: { register(config) { window.page = config; } },
  AquaFleetMasterData: {},
  AquaFleetUi: {}
};
const context = vm.createContext({ window });
for (const file of ["workspaces/data.js", "workspaces/pages/master.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
}
const zones = [
  { zone_id: 1, zone_name: "Shelf", region: "Arabian Sea", min_depth: 20, max_depth: 250, risk_level: "Low" },
  { zone_id: 2, zone_name: "Ridge", region: "Arabian Sea", min_depth: 1500, max_depth: 3200, risk_level: "Critical" }
];
const missions = [{ mission_id: 11, zone_id: 2 }, { mission_id: 12, zone_id: 2 }];
const helpers = window.AquaFleetMarineZones;
const withMissions = helpers.context(zones, missions);
assert.equal(helpers.linked(zones[0], withMissions).length, 0);
assert.equal(helpers.linked(zones[1], withMissions).length, 2);
assert.equal(helpers.metrics(zones, withMissions)[1].value, "1");
assert.equal(helpers.metrics(zones, withMissions)[2].value, "3200");
assert.equal(helpers.metrics(zones, withMissions)[3].value, "1");
const unavailable = helpers.context(zones, null);
assert.equal(helpers.linked(zones[0], unavailable), null);
assert.equal(helpers.metrics(zones, unavailable)[1].value, "—");
assert.equal(helpers.metrics(zones, helpers.context(zones, []))[1].value, "0");
assert.equal(window.page.key, "marine-zones");
assert.equal(window.page.filters.join(","), "All,Low,Moderate,High,Critical");
assert.equal(window.AquaFleetWorkspaceData.matches(zones[1], window.page.searchFields, "ridge"), true);
assert.equal(window.AquaFleetWorkspaceData.pageOf(Array.from({ length: 10 }, (_, i) => i), 2, 8).rows.length, 2);
assert.equal(helpers.depth(20), "20.00");
console.log("Marine Zones mapping checks passed");
