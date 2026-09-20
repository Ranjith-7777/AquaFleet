/* Expedition and mission operations, joined only through database identifiers. */
(function registerOperationWorkspaces(global) {
  "use strict";
  const C = global.AquaFleetWorkspaceComponents, Ui = global.AquaFleetUi;
  const tabs = [
    { key: "missions", label: "Missions" }, { key: "mission-vehicles", label: "Mission Vehicles" },
    { key: "mission-operators", label: "Mission Operators" }, { key: "telemetry-points", label: "Telemetry" },
    { key: "incidents", label: "Incidents" }, { key: "inspection-tasks", label: "Inspections" }
  ];
  const programmeTabs = [{ key: "expeditions", label: "Expeditions" }, { key: "samples", label: "Samples" }, { key: "sample-aliquots", label: "Sample Aliquots" }];
  const code = (value) => "#" + String(value).padStart(2, "0");
  const count = (rows) => rows === null ? "Unavailable" : String(rows.length);
  const tone = (value) => ({ Active: "green", Completed: "green", Recovered: "green", "In Progress": "blue", Unrecovered: "blue", Aborted: "red", Planned: "grey", Cancelled: "grey" })[value] || "grey";
  const percent = (part, total) => total ? part / total * 100 : 0;
  const metric = (label, value, note, icon, color, ratio) => ({ label, value: value === null ? "Unavailable" : String(value), note: value === null ? "Related data unavailable" : note, icon, tone: color, ratio });
  const id = (label, field) => ({ label, type: "id", value: (row) => code(row[field]) });
  const primary = (label, value, subValue) => ({ label, type: "primary", value, subValue });
  const field = (label, value, type) => ({ label, type: type || "text", value });
  const pill = (label, value) => ({ label, type: "pill", value });
  const byId = (rows, fieldName) => rows === null ? null : new Map(rows.map((row) => [String(row[fieldName]), row]));
  function grouped(rows, fieldName) {
    if (rows === null) return null;
    const map = new Map();
    rows.forEach((row) => { const key = String(row[fieldName]); if (!map.has(key)) map.set(key, []); map.get(key).push(row); });
    return map;
  }
  const related = (map, key) => map === null ? null : map.get(String(key)) || [];
  const money = (amount) => amount == null ? "—" : "₹" + Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (value) => value ? Ui.formatDate(value) : "—";
  const time = (value) => value ? Ui.formatDateTime(value) : "—";
  const depth = (value) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " m";
  const deploymentState = (row) => row.recovery_time == null ? "Unrecovered" : "Recovered";
  const parentStatus = (row, info) => info.missions === null ? "Unavailable" : info.missions.get(String(row.mission_id))?.status || "Unavailable";
  function base(key, title, subtitle, eyebrow, searchPlaceholder, addLabel, registerTitle, idField, identity, filters, template, columns, relationKeys, context, metrics, filterValue, searchValues, detail, pageTabs) {
    return { key, title, subtitle, eyebrow, searchPlaceholder, addLabel, registerTitle, idField, identity,
      pageSize: 8, filters, columnsTemplate: template, columns, relationKeys, context, metrics,
      filterValue, searchValues, detail, tabs: pageTabs || tabs, tone };
  }
  function expeditionContext(rows, relations) { return { missions: grouped(relations.missions, "expedition_id"), allMissions: relations.missions }; }
  function expeditionMetrics(rows, info) {
    const active = rows.filter((row) => row.status === "Active").length;
    const planned = info.allMissions === null ? null : info.allMissions.filter((row) => row.status === "Planned").length;
    const budget = rows.reduce((sum, row) => sum + Number(row.budget || 0), 0);
    return [metric("Expeditions", rows.length, `Across ${new Set(rows.map((row) => String(row.vessel_id))).size} research vessels`, "⊞", "blue", 100),
      metric("Active Now", active, "Stored expedition status", "⌖", "teal", percent(active, rows.length)),
      metric("Planned Missions", planned, "Mission rows with Planned status", "◎", "navy", planned === null ? 0 : percent(planned, info.allMissions.length)),
      metric("Recorded Budget", (budget / 1000000).toFixed(2), "₹ million across expeditions", "▣", "grey", 100)];
  }
  global.AquaFleetWorkspace.register(base("expeditions", "Expeditions", "Research campaigns, assigned vessels, scheduled dates, budgets and mission totals.", "AquaFleet Command · Programme", "Search expeditions or vessels", "Add Expedition", "Programme Register", "expedition_id", null,
    ["All", "Planned", "Active", "Completed", "Cancelled"], "55px minmax(180px,2fr) 115px 115px 85px 100px 112px",
    [id("ID", "expedition_id"), primary("Expedition", (row) => row.title, (row) => row.vessel_name), field("Start", (row) => date(row.start_date), "mono"), field("End", (row) => date(row.end_date), "mono"), field("Missions", (row) => row.mission_count, "num"), pill("Status", (row) => row.status)],
    ["missions"], expeditionContext, expeditionMetrics, (row) => row.status,
    (row) => [row.expedition_id, row.title, row.vessel_id, row.vessel_name, row.start_date, row.end_date, row.status, row.objective],
    (row, info) => { const missions = row ? related(info.missions, row.expedition_id) : [];
      return C.detailCard({ key: "expeditions", title: "Expedition Detail", row, id: row?.expedition_id, name: row?.title, subtitle: row?.vessel_name,
        status: row?.status, tone: tone(row?.status), facts: [["Missions", row ? String(row.mission_count) : "—"], ["Budget", row ? money(row.budget) : "—"]],
        fields: [["Start Date", row ? date(row.start_date) : "—"], ["End Date", row ? date(row.end_date) : "—"], ["Objective", row?.objective || "—"]],
        linkedLabel: "Missions in this campaign", linked: missions && missions.map((item) => ({ title: item.mission_type, meta: `${time(item.start_time)} · ${code(item.mission_id)}`, status: item.status, tone: tone(item.status) })),
        emptyLinked: "No missions recorded for this expedition", editLabel: "Edit Expedition", note: "Expeditions with missions cannot be deleted." }); }, programmeTabs));

  function missionContext(rows, relations) { return { vehicles: grouped(relations["mission-vehicles"], "mission_id"), operators: grouped(relations["mission-operators"], "mission_id") }; }
  function missionMetrics(rows) {
    const progress = rows.filter((row) => row.status === "In Progress"), completed = rows.filter((row) => row.status === "Completed");
    const deepest = rows.reduce((max, row) => Math.max(max, Number(row.depth_target || 0)), 0);
    return [metric("Recorded Missions", rows.length, `Across ${new Set(rows.map((row) => String(row.expedition_id))).size} expeditions`, "◎", "blue", 100),
      metric("In Progress", progress.length, "Stored mission status", "⌖", "teal", percent(progress.length, rows.length)),
      metric("Completed", completed.length, "Stored mission status", "✓", "navy", percent(completed.length, rows.length)),
      metric("Deepest Target", rows.length ? deepest.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—", "Metres, maximum target depth", "▽", "grey", rows.length ? 100 : 0)];
  }
  global.AquaFleetWorkspace.register(base("missions", "Missions", "Mission plans, parent expeditions, survey zones and execution status.", "AquaFleet Command · Operations", "Search missions or zones", "Add Mission", "Mission Register", "mission_id", null,
    ["All", "Planned", "In Progress", "Completed", "Aborted"], "55px minmax(190px,2fr) minmax(115px,1fr) 125px 95px 105px 112px",
    [id("ID", "mission_id"), primary("Mission", (row) => row.mission_type, (row) => row.expedition_title), field("Zone", (row) => row.zone_name), field("Start", (row) => time(row.start_time), "mono"), field("Depth", (row) => depth(row.depth_target), "num"), pill("Status", (row) => row.status)],
    ["mission-vehicles", "mission-operators"], missionContext, missionMetrics, (row) => row.status,
    (row) => [row.mission_id, row.mission_type, row.expedition_id, row.expedition_title, row.zone_id, row.zone_name, row.region, row.status, row.start_time, row.end_time],
    (row, info) => { const vehicles = row ? related(info.vehicles, row.mission_id) : [], operators = row ? related(info.operators, row.mission_id) : [];
      return C.detailCard({ key: "missions", title: "Mission Detail", row, id: row?.mission_id, name: row?.mission_type, subtitle: row?.expedition_title,
        status: row?.status, tone: tone(row?.status), facts: [["Vehicles", count(vehicles)], ["Operators", count(operators)]],
        fields: [["Zone", row?.zone_name || "—"], ["Start Time", row ? time(row.start_time) : "—"], ["End Time", row?.end_time ? time(row.end_time) : "Not recorded"], ["Duration (minutes)", row?.duration_minutes == null ? "—" : String(row.duration_minutes)], ["Depth Target", row ? depth(row.depth_target) : "—"]],
        linkedLabel: "Assigned vehicles", linked: vehicles && vehicles.map((item) => ({ title: item.vehicle_name, meta: `${time(item.launch_time)} · ${code(item.vehicle_id)}`, status: deploymentState(item), tone: tone(deploymentState(item)) })),
        emptyLinked: "No vehicles assigned to this mission", editLabel: "Edit Mission", note: "Missions with linked operational records cannot be deleted." }); }));

  const deploymentKey = (row) => `${row.mission_id}/${row.vehicle_id}`;
  function deploymentMetrics(rows, info) {
    const open = rows.filter((row) => row.recovery_time == null).length, used = new Set(rows.map((row) => String(row.vehicle_id))).size;
    return [metric("Deployments", rows.length, `Across ${new Set(rows.map((row) => String(row.mission_id))).size} missions`, "⊟", "blue", 100),
      metric("Unrecovered", open, "No recovery time recorded", "⌖", "teal", percent(open, rows.length)),
      metric("Recovered", rows.length - open, "Recovery time recorded", "✓", "navy", percent(rows.length - open, rows.length)),
      metric("Vehicles Used", used, info.vehicles === null ? "Fleet inventory unavailable" : `of ${info.vehicles.size} fleet vehicles`, "◉", "grey", info.vehicles?.size ? percent(used, info.vehicles.size) : 0)];
  }
  global.AquaFleetWorkspace.register(base("mission-vehicles", "Mission Vehicles", "Vehicle deployment periods assigned to missions, with launch and recovery times.", "AquaFleet Command · Operations", "Search missions or vehicles", "Assign Vehicle", "Deployment Register", "mission_id", deploymentKey,
    ["All", "Unrecovered", "Recovered"], "65px minmax(180px,1.8fr) 100px 145px 145px 105px 112px",
    [id("Mission", "mission_id"), primary("Mission Type", (row) => row.mission_type, (row) => row.vehicle_name), field("Class", (row) => row.vehicle_type), field("Launch", (row) => time(row.launch_time), "mono"), field("Recovery", (row) => row.recovery_time ? time(row.recovery_time) : "—", "mono"), pill("State", deploymentState)],
    ["vehicles"], (rows, relations) => ({ vehicles: byId(relations.vehicles, "vehicle_id") }), deploymentMetrics, deploymentState,
    (row) => [row.mission_id, row.mission_type, row.vehicle_id, row.vehicle_name, row.vehicle_type, row.launch_time, row.recovery_time, deploymentState(row)],
    (row, info) => { const vehicle = row && info.vehicles !== null ? info.vehicles.get(String(row.vehicle_id)) : null;
      return C.detailCard({ key: "mission-vehicles", title: "Deployment Detail", row, id: row && deploymentKey(row), name: row?.vehicle_name, subtitle: row?.mission_type,
        status: row && deploymentState(row), tone: row && tone(deploymentState(row)), facts: [["Class", row?.vehicle_type || "—"], ["Mission ID", row ? code(row.mission_id) : "—"]],
        fields: [["Launch Time", row ? time(row.launch_time) : "—"], ["Recovery Time", row?.recovery_time ? time(row.recovery_time) : "Not recorded"]],
        linkedLabel: "Vehicle record", linked: !row ? [] : info.vehicles === null ? null : [{ title: vehicle?.vehicle_name || `Vehicle ${code(row.vehicle_id)}`, meta: vehicle ? vehicle.vehicle_type : "ID only", status: vehicle?.status || "", tone: "grey" }],
        emptyLinked: "No linked vehicle record", editLabel: "Edit Deployment", note: "Recovery time must be later than launch time." }); }));

  const dutyKey = (row) => `${row.mission_id}/${row.operator_id}`;
  function dutyMetrics(rows, info) {
    const rostered = new Set(rows.map((row) => String(row.operator_id))).size;
    const active = info.missions === null ? null : rows.filter((row) => parentStatus(row, info) === "In Progress").length;
    return [metric("Duty Assignments", rows.length, `Across ${new Set(rows.map((row) => String(row.mission_id))).size} missions`, "⚇", "blue", 100),
      metric("Operators Rostered", rostered, "Distinct operator IDs in assignments", "◎", "teal", 100),
      metric("In Progress Assignments", active, "Parent mission status In Progress", "⌖", "navy", active === null ? 0 : percent(active, rows.length)),
      metric("Watch Patterns", new Set(rows.map((row) => row.shift)).size, "Distinct recorded shift strings", "▤", "grey", 100)];
  }
  global.AquaFleetWorkspace.register(base("mission-operators", "Mission Operators", "Operator duty assignments and watch shifts recorded against each mission.", "AquaFleet Command · Operations", "Search operators or missions", "Assign Operator", "Duty Roster", "mission_id", dutyKey,
    ["All", "Planned", "In Progress", "Completed", "Aborted", "Unavailable"], "65px minmax(175px,1.8fr) minmax(115px,1fr) 115px 105px 112px",
    [id("Mission", "mission_id"), primary("Operator", (row) => row.operator_name, (row) => row.mission_type), field("Duty Role", (row) => row.duty_role), field("Shift", (row) => row.shift), pill("State", parentStatus)],
    ["missions", "operators"], (rows, relations) => ({ missions: byId(relations.missions, "mission_id"), operators: byId(relations.operators, "operator_id") }), dutyMetrics, parentStatus,
    (row, info) => [row.mission_id, row.mission_type, row.operator_id, row.operator_name, row.duty_role, row.shift, parentStatus(row, info)],
    (row, info) => { const operator = row && info.operators !== null ? info.operators.get(String(row.operator_id)) : null;
      return C.detailCard({ key: "mission-operators", title: "Assignment Detail", row, id: row && dutyKey(row), name: row?.operator_name, subtitle: row?.mission_type,
        status: row && parentStatus(row, info), tone: row && tone(parentStatus(row, info)), facts: [["Mission ID", row ? code(row.mission_id) : "—"], ["Shift", row?.shift || "—"]],
        fields: [["Duty Role", row?.duty_role || "—"], ["Mission", row?.mission_type || "—"]],
        linkedLabel: "Operator record", linked: !row ? [] : info.operators === null ? null : [{ title: operator ? `${operator.first_name} ${operator.last_name}` : `Operator ${code(row.operator_id)}`, meta: operator?.role || "ID only", status: operator?.status || "", tone: "grey" }],
        emptyLinked: "No linked operator record", editLabel: "Edit Assignment", note: "Mission and operator IDs cannot be changed after assignment." }); }));

  global.AquaFleetOperationWorkspaces = Object.freeze({ grouped, related, deploymentKey, dutyKey, deploymentState, parentStatus, expeditionMetrics, missionMetrics, deploymentMetrics, dutyMetrics });
})(window);
