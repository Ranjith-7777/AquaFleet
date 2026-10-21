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
for (const name of ["workspaces/data.js", "workspaces/pages/operations.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8"), context);
}
assert.deepEqual([...pages.keys()], ["expeditions", "missions", "mission-vehicles", "mission-operators"]);
const H = window.AquaFleetOperationWorkspaces;
const matches = window.AquaFleetWorkspaceData.matches;
function finds(page, row, info, query) {
  const values = page.searchValues(row, info);
  return matches(values, values.map((_, index) => index), query);
}

const expedition = pages.get("expeditions");
const campaigns = [{ expedition_id: 2, vessel_id: 5, vessel_name: "Research Vessel", title: "<b>Long Campaign</b>", status: "Cancelled", budget: 1200000, mission_count: 1, start_date: "2026-01-01", end_date: "2026-01-30", objective: "Survey" }];
const missions = [{ mission_id: 9, expedition_id: 2, mission_type: "Deep Survey", expedition_title: campaigns[0].title, zone_id: 3, zone_name: "Shelf", start_time: "2026-01-05 08:00:00", end_time: null, depth_target: 1200, duration_minutes: null, status: "Planned" }];
let info = expedition.context(campaigns, { missions });
assert.equal(expedition.metrics(campaigns, info)[2].value, "1");
assert.equal(expedition.metrics(campaigns, info)[3].value, "1.20");
assert.equal(expedition.detail(campaigns[0], info).linked[0].title, "Deep Survey");
assert.equal(expedition.detail(campaigns[0], info).name, "<b>Long Campaign</b>");
assert.equal(finds(expedition, campaigns[0], info, "research vessel"), true);
assert.equal(expedition.filters.includes("Cancelled"), true);
info = expedition.context(campaigns, { missions: null });
assert.equal(expedition.metrics(campaigns, info)[2].value, "Unavailable");
assert.equal(expedition.detail(campaigns[0], info).linked, null);
info = expedition.context([], { missions: [] });
assert.equal(expedition.metrics([], info)[2].value, "0");

const mission = pages.get("missions");
info = mission.context(missions, { "mission-vehicles": [], "mission-operators": [] });
assert.equal(mission.detail(missions[0], info).facts[0][1], "0");
assert.equal(mission.detail(missions[0], info).fields[2][1], "Not recorded");
assert.equal(mission.filters.includes("Aborted"), true);
assert.equal(finds(mission, missions[0], info, "long campaign"), true);
info = mission.context(missions, { "mission-vehicles": null, "mission-operators": [] });
assert.equal(mission.detail(missions[0], info).facts[0][1], "Unavailable");
assert.equal(mission.detail(missions[0], info).linked, null);

const vehicle = pages.get("mission-vehicles");
const deployment = { mission_id: 9, vehicle_id: 4, mission_type: "Deep Survey", vehicle_name: "Varuna", vehicle_type: "AUV", launch_time: "2026-01-05 08:15:00", recovery_time: null };
assert.equal(H.deploymentKey(deployment), "9/4");
assert.equal(H.deploymentState(deployment), "Unrecovered");
assert.equal(vehicle.filterValue(deployment), "Unrecovered");
assert.equal(vehicle.metrics([deployment], vehicle.context([deployment], { vehicles: null }))[1].value, "1");
assert.equal(vehicle.detail(deployment, vehicle.context([deployment], { vehicles: null })).linked, null);
assert.equal(vehicle.detail(deployment, vehicle.context([deployment], { vehicles: [] })).fields[1][1], "Not recorded");
assert.equal(finds(vehicle, deployment, {}, "varuna"), true);

const duty = pages.get("mission-operators");
const assignment = { mission_id: 9, operator_id: 6, mission_type: "Deep Survey", operator_name: "A. Iyer", duty_role: "Pilot", shift: "Day" };
assert.equal(H.dutyKey(assignment), "9/6");
info = duty.context([assignment], { missions: [{ ...missions[0], status: "In Progress" }], operators: [{ operator_id: 6, first_name: "Ananya", last_name: "Iyer" }] });
assert.equal(duty.filterValue(assignment, info), "In Progress");
assert.equal(duty.metrics([assignment], info)[2].value, "1");
assert.equal(duty.detail(assignment, info).linked[0].title, "Ananya Iyer");
assert.equal(finds(duty, assignment, info, "pilot"), true);
info = duty.context([assignment], { missions: null, operators: null });
assert.equal(duty.metrics([assignment], info)[2].value, "Unavailable");
assert.equal(duty.filterValue(assignment, info), "Unavailable");
assert.equal(duty.detail(assignment, info).linked, null);
info = duty.context([], { missions: [], operators: [] });
assert.equal(duty.metrics([], info)[2].value, "0");
console.log("Operations relationship, KPI and status checks passed");
