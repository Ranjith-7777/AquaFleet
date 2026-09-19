/* Batch 2 master registers: factual views over existing resource collections. */
(function registerMasterWorkspaces(global) {
  "use strict";
  const Data = global.AquaFleetWorkspaceData, C = global.AquaFleetWorkspaceComponents, Ui = global.AquaFleetUi;
  const fleetTabs = [{ key: "vessels", label: "Research Vessels" }, { key: "marine-zones", label: "Marine Zones" }, { key: "offshore-assets", label: "Offshore Assets" }, { key: "operators", label: "Operators" }];
  const equipmentTabs = [{ key: "vehicles", label: "Vehicles" }, { key: "sensors", label: "Sensors" }, { key: "battery-packs", label: "Battery Packs" }, { key: "vehicle-sensors", label: "Vehicle Sensors" }, { key: "vehicle-batteries", label: "Vehicle Batteries" }, { key: "maintenance-records", label: "Maintenance" }];
  const n = function (value) { return value == null ? "—" : Number(value).toLocaleString(); };
  const fixed = function (value, digits) { return value == null ? "—" : Number(value).toFixed(digits); };
  const count = function (rows) { return rows === null ? "Unavailable" : String(rows.length); };
  const percent = function (part, total) { return part === null || !total ? 0 : part / total * 100; };
  function grouped(relations, key, field) { return relations[key] === null ? null : Data.groupBy(relations[key], field); }
  function related(group, id) { return group === null ? null : group.get(String(id)) || []; }
  function total(group) { return group === null ? null : [...group.values()].reduce(function (sum, rows) { return sum + rows.length; }, 0); }
  function metric(label, value, note, icon, tone, ratio) { return { label: label, value: value === null ? "—" : String(value), note: value === null ? "Related data unavailable" : note, icon: icon, tone: tone, ratio: ratio }; }
  function base(key, title, subtitle, searchPlaceholder, addLabel, registerTitle, idField, filters, columnsTemplate, columns, relationKeys, context, metrics, filterValue, searchValues, detail, tone) {
    return { key: key, title: title, subtitle: subtitle, eyebrow: equipmentTabs.some(function (tab) { return tab.key === key; }) ? "AquaFleet Command · Vehicles" : "AquaFleet Command · Fleet & Crew", searchPlaceholder: searchPlaceholder, addLabel: addLabel, registerTitle: registerTitle, idField: idField,
      pageSize: 8, filters: filters, columnsTemplate: columnsTemplate, columns: columns, relationKeys: relationKeys, tabs: equipmentTabs.some(function (tab) { return tab.key === key; }) ? equipmentTabs : fleetTabs,
      context: context, metrics: metrics, filterValue: filterValue, searchValues: searchValues, detail: detail, tone: tone };
  }
  const id = function (field) { return { label: "ID", type: "id", value: function (row) { return "#" + String(row[field]).padStart(2, "0"); } }; };
  const primary = function (label, field, subValue) { return { label: label, type: "primary", field: field, subValue: subValue }; };
  const numeric = function (label, value) { return { label: label, type: "num", value: value }; };
  const text = function (label, value) { return { label: label, type: "text", value: value }; };
  const pill = function (label, value) { return { label: label, type: "pill", value: value }; };
  const unavailable = function (value) { return value === null ? "—" : String(value); };
  function detail(config) { return C.detailCard(config); }

  // Offshore Assets: task status is a workflow fact, not an inspection deadline.
  function assetContext(rows, relations) { return { tasks: grouped(relations, "inspection-tasks", "asset_id") }; }
  function assetTasks(row, info) { return related(info.tasks, row.asset_id); }
  function assetOpen(rows) { return rows.filter(function (task) { return task.status === "Pending" || task.status === "In Progress"; }); }
  function assetStatus(row, info) { const rows = assetTasks(row, info); return rows === null ? "Unavailable" : !rows.length ? "Not inspected" : assetOpen(rows).length ? "Open Tasks" : "No Open Tasks"; }
  function assetMetrics(rows, info) {
    const taskRows = info.tasks === null ? null : [...info.tasks.values()].flat();
    const open = taskRows === null ? null : assetOpen(taskRows).length;
    const completed = taskRows === null ? null : taskRows.filter(function (task) { return task.status === "Completed"; }).length;
    return [metric("Registered Assets", rows.length, "Offshore structures", "◈", "blue", 100), metric("Inspection Tasks", taskRows && taskRows.length, "Recorded task rows", "⌖", "teal", 100), metric("Open Inspections", open, "Pending or in progress", "▽", "navy", percent(open, taskRows && taskRows.length)), metric("Completed Inspections", completed, "Completed task rows", "!", "grey", percent(completed, taskRows && taskRows.length))];
  }
  const assetTone = function (value) { return value === "Open Tasks" ? "amber" : value === "No Open Tasks" ? "green" : "grey"; };
  global.AquaFleetWorkspace.register(base("offshore-assets", "Offshore Assets", "Offshore infrastructure targeted by inspection tasks, with recorded positions.", "Search assets or types", "Add Asset", "Asset Register", "asset_id",
    ["All", "Not inspected", "Open Tasks", "No Open Tasks", "Unavailable"], "52px minmax(190px,2.1fr) 108px 108px 78px 120px 122px",
    [id("asset_id"), primary("Asset", "asset_name", function (row) { return row.asset_type; }), text("Latitude", function (row) { return fixed(row.latitude, 6); }), text("Longitude", function (row) { return fixed(row.longitude, 6); }), numeric("Tasks", function (row, info) { return unavailable(assetTasks(row, info)?.length ?? null); }), pill("Status", assetStatus)],
    ["inspection-tasks"], assetContext, assetMetrics, assetStatus, function (row, info) { return [row.asset_id, row.asset_name, row.asset_type, assetStatus(row, info)]; },
    function (row, info) { const tasks = row ? assetTasks(row, info) : null; return detail({ key: "offshore-assets", title: "Asset Detail", row: row, id: row?.asset_id, name: row?.asset_name, subtitle: row?.asset_type, status: row && assetStatus(row, info), tone: row && assetTone(assetStatus(row, info)),
      facts: [["Inspection Tasks", count(tasks)], ["Open Tasks", tasks === null ? "Unavailable" : String(assetOpen(tasks).length)]], fields: [["Latitude", row ? fixed(row.latitude, 6) : "—"], ["Longitude", row ? fixed(row.longitude, 6) : "—"]],
      linkedLabel: "Inspection tasks", linked: tasks && tasks.map(function (task) { return { title: task.task_type, meta: task.priority + " priority", status: task.status, tone: { Completed: "green", "In Progress": "blue", Pending: "amber", Cancelled: "grey" }[task.status] }; }), emptyLinked: "No inspection tasks recorded", editLabel: "Edit Asset", note: "Assets with inspection tasks cannot be deleted." }); }, assetTone));

  // Operators: only a parent mission's stored In Progress status supports this grouping.
  function operatorContext(rows, relations) {
    return { duties: grouped(relations, "mission-operators", "operator_id"), missions: relations.missions === null ? null : new Map(relations.missions.map(function (row) { return [String(row.mission_id), row]; })) };
  }
  function duties(row, info) { return related(info.duties, row.operator_id); }
  function operatorStatus(row, info) {
    const rows = duties(row, info); if (rows === null) return "Unavailable"; if (!rows.length) return "Unassigned"; if (info.missions === null) return "Unavailable";
    return rows.some(function (duty) { return info.missions.get(String(duty.mission_id))?.status === "In Progress"; }) ? "In-Progress Mission" : "Assigned";
  }
  function operatorName(row) { return row.first_name + " " + row.last_name; }
  function operatorMetrics(rows, info) {
    const active = info.duties === null || info.missions === null ? null : rows.filter(function (row) { return operatorStatus(row, info) === "In-Progress Mission"; }).length;
    const expert = rows.filter(function (row) { return /\bexpert\b/i.test(row.certification_level || ""); }).length;
    const contacts = rows.reduce(function (sum, row) { return sum + (Array.isArray(row.contact_numbers) ? row.contact_numbers.length : 0); }, 0);
    return [metric("Registered Operators", rows.length, "Personnel records", "◈", "blue", 100), metric("Assigned To In-Progress Missions", active, "Distinct operators by parent mission status", "⌖", "teal", percent(active, rows.length)), metric("Certification Mentions Expert", expert, "Literal certification text", "▽", "navy", percent(expert, rows.length)), metric("Contact Numbers", contacts, "Recorded contact rows", "!", "grey", 100)];
  }
  const operatorTone = function (value) { return value === "In-Progress Mission" ? "blue" : value === "Assigned" ? "green" : "grey"; };
  global.AquaFleetWorkspace.register(base("operators", "Operators", "Personnel register, certification levels, contact records and mission duty assignments.", "Search operators or roles", "Add Operator", "Personnel Register", "operator_id",
    ["All", "Assigned", "In-Progress Mission", "Unassigned", "Unavailable"], "52px minmax(190px,2.1fr) 135px 74px 78px 130px 122px",
    [id("operator_id"), { label: "Operator", type: "primary", value: operatorName, subValue: function (row) { return row.role; } }, text("Certification", function (row) { return row.certification_level; }), numeric("Contacts", function (row) { return Array.isArray(row.contact_numbers) ? row.contact_numbers.length : 0; }), numeric("Missions", function (row, info) { return unavailable(duties(row, info)?.length ?? null); }), pill("Status", operatorStatus)],
    ["mission-operators", "missions"], operatorContext, operatorMetrics, operatorStatus, function (row, info) { return [row.operator_id, operatorName(row), row.role, row.certification_level, row.email, ...(row.contact_numbers || []), operatorStatus(row, info)]; },
    function (row, info) { const assignments = row ? duties(row, info) : null; return detail({ key: "operators", title: "Operator Detail", row: row, id: row?.operator_id, name: row && operatorName(row), subtitle: row?.role, status: row && operatorStatus(row, info), tone: row && operatorTone(operatorStatus(row, info)),
      facts: [["Mission Duties", count(assignments)], ["Contacts", row ? String(row.contact_numbers?.length || 0) : "—"]], fields: [["Certification Level", row?.certification_level || "—"], ["Email", row?.email || "—"], ["Primary Contact", row?.contact_numbers?.[0] || "—"]],
      linkedLabel: "Mission assignments", linked: assignments && assignments.map(function (duty) { const mission = info.missions?.get(String(duty.mission_id)); return { title: duty.mission_type, meta: duty.duty_role + " · " + duty.shift, status: mission ? mission.status : "Unavailable", tone: { "In Progress": "blue", Completed: "green", Planned: "grey", Aborted: "red" }[mission?.status] || "grey" }; }), emptyLinked: "No mission assignments recorded", editLabel: "Edit Operator", note: "Operators assigned to a mission cannot be deleted." }); }, operatorTone));

  // Vehicles: equipment and mission relations are keyed by vehicle_id.
  function vehicleContext(rows, relations) {
    return { sensors: grouped(relations, "vehicle-sensors", "vehicle_id"), deployments: grouped(relations, "mission-vehicles", "vehicle_id"), batteries: grouped(relations, "vehicle-batteries", "vehicle_id"), missions: relations.missions === null ? null : new Map(relations.missions.map(function (row) { return [String(row.mission_id), row]; })) };
  }
  function vehicleMetrics(rows) { return [metric("Registered Vehicles", rows.length, "AUV and ROV platforms", "◈", "blue", 100), metric("Available", rows.filter(function (r) { return r.status === "Available"; }).length, "Current vehicle status", "⌖", "teal", percent(rows.filter(function (r) { return r.status === "Available"; }).length, rows.length)), metric("Deployed", rows.filter(function (r) { return r.status === "Deployed"; }).length, "Current vehicle status", "▽", "navy", percent(rows.filter(function (r) { return r.status === "Deployed"; }).length, rows.length)), metric("In Maintenance", rows.filter(function (r) { return r.status === "Maintenance"; }).length, "Current vehicle status", "!", "grey", percent(rows.filter(function (r) { return r.status === "Maintenance"; }).length, rows.length))]; }
  const vehicleTone = function (value) { return { Available: "green", Deployed: "blue", Maintenance: "amber", Retired: "grey" }[value] || "grey"; };
  global.AquaFleetWorkspace.register(base("vehicles", "AUV / ROV Vehicles", "Autonomous and remotely operated vehicle fleet, depth ratings and operational status.", "Search vehicles or models", "Add Vehicle", "Vehicle Register", "vehicle_id",
    ["All", "Available", "Deployed", "Maintenance", "Retired"], "52px minmax(190px,2.1fr) 92px 78px 78px 110px 122px",
    [id("vehicle_id"), primary("Vehicle", "vehicle_name", function (row) { return row.vehicle_type + " · " + row.model; }), numeric("Max Depth", function (row) { return fixed(row.max_depth, 2); }), numeric("Sensors", function (row, info) { return unavailable(related(info.sensors, row.vehicle_id)?.length ?? null); }), numeric("Missions", function (row, info) { return unavailable(related(info.deployments, row.vehicle_id)?.length ?? null); }), pill("Status", function (row) { return row.status; })],
    ["vehicle-sensors", "mission-vehicles", "vehicle-batteries", "missions"], vehicleContext, vehicleMetrics, function (row) { return row.status; }, function (row) { return [row.vehicle_id, row.vehicle_name, row.vehicle_type, row.model, row.status]; },
    function (row, info) { const sensors = row ? related(info.sensors, row.vehicle_id) : null, deployments = row ? related(info.deployments, row.vehicle_id) : null, batteries = row ? related(info.batteries, row.vehicle_id) : null;
      const openBattery = batteries === null ? null : batteries.filter(function (entry) { return entry.end_cycle === null; }).sort(function (a, b) { return String(b.start_cycle).localeCompare(String(a.start_cycle)); })[0];
      return detail({ key: "vehicles", title: "Vehicle Detail", row: row, id: row?.vehicle_id, name: row?.vehicle_name, subtitle: row && row.vehicle_type + " · " + row.model, status: row?.status, tone: row && vehicleTone(row.status),
        facts: [["Max Depth", row ? fixed(row.max_depth, 2) + " m" : "—"], ["Sensors Fitted", count(sensors)]], fields: [["Open Battery Assignment", batteries === null ? "Unavailable" : openBattery ? "Battery #" + openBattery.battery_id : "None open"], ["Mission Deployments", count(deployments)]],
        linkedLabel: "Mission deployments", linked: deployments && deployments.map(function (entry) { const mission = info.missions?.get(String(entry.mission_id)); return { title: entry.mission_type, meta: Ui.formatDateTime(entry.launch_time) + " · " + (entry.recovery_time ? "recovered" : "unrecovered"), status: info.missions === null ? "Unavailable" : mission?.status || "—", tone: { Completed: "green", "In Progress": "blue", Planned: "grey", Aborted: "red" }[mission?.status] || "grey" }; }), emptyLinked: "No mission deployments recorded", editLabel: "Edit Vehicle", note: "Related mission, equipment or maintenance records may prevent deletion." }); }, vehicleTone));

  // Sensors: calibration_date is historical; there is no approved due interval.
  function sensorContext(rows, relations) { return { installs: grouped(relations, "vehicle-sensors", "sensor_id") }; }
  function sensorStatus(row) { return row.calibration_date ? "Date recorded" : "Not recorded"; }
  function sensorMetrics(rows, info) {
    const installs = total(info.installs), fitted = info.installs === null ? null : rows.filter(function (row) { return related(info.installs, row.sensor_id).length > 0; }).length;
    const recorded = rows.filter(function (row) { return Boolean(row.calibration_date); }).length;
    return [metric("Registered Sensors", rows.length, "Scientific instruments", "◈", "blue", 100), metric("Calibration Dates Recorded", recorded, "Historical dates, no due rule", "⌖", "teal", percent(recorded, rows.length)), metric("Recorded Installations", installs, "Vehicle-sensor assignments", "▽", "navy", 100), metric("Fitted To Vehicles", fitted, "Distinct sensor records installed", "!", "grey", percent(fitted, rows.length))];
  }
  global.AquaFleetWorkspace.register(base("sensors", "Sensors", "Scientific sensor inventory, manufacturer, calibration date and measurement accuracy.", "Search sensors or makers", "Add Sensor", "Sensor Inventory", "sensor_id",
    ["All", "Date recorded", "Not recorded"], "52px minmax(190px,2.1fr) 110px 88px 78px 118px 122px",
    [id("sensor_id"), primary("Sensor", "sensor_type", function (row) { return row.manufacturer; }), text("Calibrated", function (row) { return Ui.formatDate(row.calibration_date); }), numeric("Accuracy", function (row) { return fixed(row.accuracy, 3); }), numeric("Installs", function (row, info) { return unavailable(related(info.installs, row.sensor_id)?.length ?? null); }), pill("Status", sensorStatus)],
    ["vehicle-sensors"], sensorContext, sensorMetrics, sensorStatus, function (row) { return [row.sensor_id, row.sensor_type, row.manufacturer, row.calibration_date, row.accuracy]; },
    function (row, info) { const installs = row ? related(info.installs, row.sensor_id) : null; return detail({ key: "sensors", title: "Sensor Detail", row: row, id: row?.sensor_id, name: row?.sensor_type, subtitle: row?.manufacturer, status: row && sensorStatus(row), tone: "grey",
      facts: [["Accuracy", row ? fixed(row.accuracy, 3) : "—"], ["Installations", count(installs)]], fields: [["Calibration Date", row?.calibration_date ? Ui.formatDate(row.calibration_date) : "Not recorded"], ["Manufacturer", row?.manufacturer || "—"]],
      linkedLabel: "Vehicle installations", linked: installs && installs.map(function (entry) { return { title: entry.vehicle_name, meta: entry.mount_position + " · " + Ui.formatDate(entry.install_date) }; }), emptyLinked: "Not fitted to any vehicle", editLabel: "Edit Sensor", note: "Sensors installed on a vehicle cannot be deleted." }); }, function () { return "grey"; }));

  // Battery health is a stored enum. Include Poor even though sample artifact omits it.
  function batteryContext(rows, relations) { return { assignments: grouped(relations, "vehicle-batteries", "battery_id") }; }
  function batteryMetrics(rows) {
    const capacity = rows.reduce(function (sum, row) { return sum + Number(row.capacity_wh || 0); }, 0);
    const good = rows.filter(function (row) { return row.health_status === "Excellent" || row.health_status === "Good"; }).length;
    const replace = rows.filter(function (row) { return row.health_status === "Replace"; }).length;
    return [metric("Battery Packs", rows.length, "Registered packs", "◈", "blue", 100), metric("Total Capacity", n(capacity), "Watt-hours recorded", "⌖", "teal", 100), metric("Good Or Better", good, "Excellent or Good health", "▽", "navy", percent(good, rows.length)), metric("Replace Condition", replace, "Stored health status", "!", "grey", percent(replace, rows.length))];
  }
  const batteryTone = function (value) { return { Excellent: "green", Good: "green", Fair: "amber", Poor: "red", Replace: "red" }[value] || "grey"; };
  global.AquaFleetWorkspace.register(base("battery-packs", "Battery Packs", "Battery inventory, chemistry, stored capacity, condition and lifecycle counts.", "Search packs or chemistry", "Add Battery", "Battery Inventory", "battery_id",
    ["All", "Excellent", "Good", "Fair", "Poor", "Replace"], "52px minmax(190px,2.1fr) 92px 78px 90px 110px 122px",
    [id("battery_id"), primary("Pack", "chemistry", function (row) { return fixed(row.capacity_wh, 2) + " Wh"; }), numeric("Capacity", function (row) { return fixed(row.capacity_wh, 2); }), numeric("Cycles", function (row) { return n(row.cycle_count); }), numeric("Assignments", function (row, info) { return unavailable(related(info.assignments, row.battery_id)?.length ?? null); }), pill("Health", function (row) { return row.health_status; })],
    ["vehicle-batteries"], batteryContext, batteryMetrics, function (row) { return row.health_status; }, function (row) { return [row.battery_id, row.chemistry, row.capacity_wh, row.health_status]; },
    function (row, info) { const assignments = row ? related(info.assignments, row.battery_id) : null; return detail({ key: "battery-packs", title: "Battery Detail", row: row, id: row?.battery_id, name: row?.chemistry, subtitle: row && fixed(row.capacity_wh, 2) + " Wh", status: row?.health_status, tone: row && batteryTone(row.health_status),
      facts: [["Cycle Count", row ? n(row.cycle_count) : "—"], ["Assignments", count(assignments)]], fields: [["Capacity (Wh)", row ? fixed(row.capacity_wh, 2) : "—"], ["Chemistry", row?.chemistry || "—"]],
      linkedLabel: "Vehicle assignment periods", linked: assignments && assignments.map(function (entry) { return { title: entry.vehicle_name, meta: Ui.formatDateTime(entry.start_cycle) + " – " + (entry.end_cycle ? Ui.formatDateTime(entry.end_cycle) : "open"), status: entry.end_cycle ? "Closed" : "Open", tone: entry.end_cycle ? "grey" : "blue" }; }), emptyLinked: "Never assigned to a vehicle", editLabel: "Edit Battery", note: "Packs with an open assignment period cannot be deleted." }); }, batteryTone));

  global.AquaFleetMasterWorkspaces = Object.freeze({ assetStatus: assetStatus, operatorStatus: operatorStatus, sensorStatus: sensorStatus, batteryTone: batteryTone });
})(window);
