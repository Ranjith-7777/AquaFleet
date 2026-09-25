/* Stored mission observations and offshore inspection workflow. */
(function registerFieldWorkspaces(global) {
  "use strict";
  const C = global.AquaFleetWorkspaceComponents, Ui = global.AquaFleetUi;
  const tabs = [{ key: "missions", label: "Missions" }, { key: "mission-vehicles", label: "Mission Vehicles" },
    { key: "mission-operators", label: "Mission Operators" }, { key: "telemetry-points", label: "Telemetry" },
    { key: "incidents", label: "Incidents" }, { key: "inspection-tasks", label: "Inspections" }];
  const code = (value) => "#" + String(value).padStart(2, "0");
  const fixed = (value, digits) => value == null ? "—" : Number(value).toFixed(digits);
  const time = (value) => value ? Ui.formatDateTime(value) : "—";
  const percent = (part, total) => total ? part / total * 100 : 0;
  const tone = (value) => ({ Planned: "grey", "In Progress": "blue", Completed: "green", Aborted: "red", Pending: "amber", Cancelled: "grey", Low: "green", Medium: "amber", High: "red", Urgent: "red" })[value] || "grey";
  const metric = (label, value, note, icon, color, ratio) => ({ label, value: value === null ? "Unavailable" : String(value), note: value === null ? "Related data unavailable" : note, icon, tone: color, ratio });
  const id = (label, key) => ({ label, type: "id", value: (row) => code(row[key]) });
  const primary = (label, value, subValue) => ({ label, type: "primary", value, subValue });
  const field = (label, value, type) => ({ label, type: type || "text", value });
  const pill = (label, value) => ({ label, type: "pill", value });
  const byId = (rows, key) => rows === null ? null : new Map(rows.map((row) => [String(row[key]), row]));
  function base(key, title, subtitle, searchPlaceholder, addLabel, registerTitle, idField, identity, filters, template, columns, relationKeys, context, metrics, filterValue, searchValues, detail) {
    return { key, title, subtitle, eyebrow: "AquaFleet Command · Operations", searchPlaceholder, addLabel, registerTitle,
      idField, identity, pageSize: 8, filters, columnsTemplate: template, columns, relationKeys, context, metrics,
      filterValue, searchValues, detail, tabs, tone };
  }

  const telemetryKey = (row) => `${row.mission_id}/${row.log_no}`;
  function telemetryContext(rows, relations) { return { missions: byId(relations.missions, "mission_id") }; }
  function telemetryMetrics(rows) {
    const deepest = rows.length ? rows.reduce((value, row) => Math.max(value, Number(row.depth)), -Infinity) : null;
    const lowest = rows.length ? rows.reduce((value, row) => Math.min(value, Number(row.battery_level)), Infinity) : null;
    const missions = new Set(rows.map((row) => String(row.mission_id))).size;
    return [metric("Logged Points", rows.length, `Across ${missions} missions`, "▤", "blue", 100),
      metric("Deepest Reading", deepest === null ? "—" : fixed(deepest, 2), "Metres, maximum recorded depth", "▽", "teal", rows.length ? 100 : 0),
      metric("Lowest Battery Reading", lowest === null ? "—" : fixed(lowest, 2), "Recorded percentage", "⚡", "navy", lowest ?? 0),
      metric("Missions Logged", missions, "Missions with telemetry", "◎", "grey", 100)];
  }
  global.AquaFleetWorkspace.register(base("telemetry-points", "Telemetry Points", "Recorded mission positions, depth, battery percentage and water temperature.", "Search missions or log numbers", "Add Log Point", "Telemetry Log", "mission_id", telemetryKey,
    ["All", "Planned", "In Progress", "Completed", "Aborted"], "65px 62px 145px 85px 92px 85px 105px 112px",
    [id("Mission", "mission_id"), id("Log", "log_no"), field("Recorded At", (row) => time(row.timestamp), "mono"), field("Depth (m)", (row) => fixed(row.depth, 2), "num"), field("Battery %", (row) => fixed(row.battery_level, 2), "num"), field("Temp (°C)", (row) => fixed(row.temperature, 2), "num"), pill("Mission Status", (row) => row.mission_status)],
    ["missions"], telemetryContext, telemetryMetrics, (row) => row.mission_status,
    (row) => [row.mission_id, row.log_no, row.mission_type, row.timestamp, row.latitude, row.longitude, row.depth, row.battery_level, row.temperature, row.mission_status],
    (row, info) => { const mission = row && info.missions !== null ? info.missions.get(String(row.mission_id)) : null;
      return C.detailCard({ key: "telemetry-points", title: "Log Point Detail", row, id: row && telemetryKey(row), name: row?.mission_type, subtitle: row && `Log ${code(row.log_no)} · ${time(row.timestamp)}`,
        status: row && `Mission: ${row.mission_status}`, tone: tone(row?.mission_status), facts: [["Depth (m)", row ? fixed(row.depth, 2) : "—"], ["Battery %", row ? fixed(row.battery_level, 2) : "—"]],
        fields: [["Latitude", row ? fixed(row.latitude, 6) : "—"], ["Longitude", row ? fixed(row.longitude, 6) : "—"], ["Temperature (°C)", row ? fixed(row.temperature, 2) : "—"], ["Recorded At", row ? time(row.timestamp) : "—"]],
        linkedLabel: "Parent mission", linked: !row ? [] : info.missions === null ? null : [{ title: mission?.mission_type || `Mission ${code(row.mission_id)}`, meta: mission ? time(mission.start_time) : "ID only", status: mission?.status || "", tone: tone(mission?.status) }],
        emptyLinked: "No parent mission detail", editLabel: "Edit Log Point", note: "Log numbers are unique within a mission and cannot be changed after creation." }); }));

  function inspectionContext(rows, relations) { return { assets: byId(relations["offshore-assets"], "asset_id") }; }
  const isOpen = (row) => row.status === "Pending" || row.status === "In Progress";
  function inspectionMetrics(rows) {
    const completed = rows.filter((row) => row.status === "Completed").length;
    const open = rows.filter(isOpen).length;
    const urgent = rows.filter((row) => row.priority === "Urgent").length;
    return [metric("Inspection Tasks", rows.length, `Across ${new Set(rows.map((row) => String(row.asset_id))).size} offshore assets`, "⊞", "blue", 100),
      metric("Completed", completed, "Stored task status", "✓", "teal", percent(completed, rows.length)),
      metric("Open Tasks", open, "Pending or In Progress task rows", "⌖", "navy", percent(open, rows.length)),
      metric("Urgent Priority", urgent, "Stored task priority", "!", "grey", percent(urgent, rows.length))];
  }
  global.AquaFleetWorkspace.register(base("inspection-tasks", "Inspection Tasks", "Offshore inspection workflow, task priority, execution status and recorded findings.", "Search tasks, assets or missions", "Add Task", "Inspection Workflow", "inspection_id", null,
    ["All", "Pending", "In Progress", "Completed", "Cancelled"], "55px minmax(170px,1.7fr) minmax(135px,1.2fr) 90px 105px 112px",
    [id("ID", "inspection_id"), primary("Task", (row) => row.task_type, (row) => row.asset_name), field("Mission", (row) => row.mission_type), pill("Priority", (row) => row.priority), pill("Status", (row) => row.status)],
    ["offshore-assets"], inspectionContext, inspectionMetrics, (row) => row.status,
    (row) => [row.inspection_id, row.task_type, row.mission_id, row.mission_type, row.asset_id, row.asset_name, row.asset_type, row.priority, row.status, row.finding_summary],
    (row, info) => { const asset = row && info.assets !== null ? info.assets.get(String(row.asset_id)) : null;
      return C.detailCard({ key: "inspection-tasks", title: "Task Detail", row, id: row?.inspection_id, name: row?.task_type, subtitle: row?.asset_name,
        status: row?.status, tone: tone(row?.status), facts: [["Priority", row?.priority || "—"], ["Task ID", row ? code(row.inspection_id) : "—"]],
        fields: [["Mission", row?.mission_type || "—"], ["Finding Summary", row?.finding_summary || "Not recorded"]],
        linkedLabel: "Target asset", linked: !row ? [] : info.assets === null ? null : [{ title: asset?.asset_name || `Asset ${code(row.asset_id)}`, meta: asset ? asset.asset_type : "ID only", status: asset ? "Asset record" : "", tone: "grey" }],
        emptyLinked: "No target asset detail", editLabel: "Edit Task", note: "Completed and cancelled tasks are retained. A finding is required to finish or cancel a task." }); }));

  global.AquaFleetFieldWorkspaces = Object.freeze({ telemetryKey, telemetryMetrics, inspectionMetrics, isOpen });
})(window);
