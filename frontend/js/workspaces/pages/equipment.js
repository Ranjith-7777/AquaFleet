/* Equipment relationships, keyed by the database's actual primary keys. */
(function registerEquipmentWorkspaces(global) {
  "use strict";
  const C = global.AquaFleetWorkspaceComponents, Ui = global.AquaFleetUi;
  const tabs = [
    { key: "vehicles", label: "Vehicles" }, { key: "sensors", label: "Sensors" },
    { key: "battery-packs", label: "Battery Packs" }, { key: "vehicle-sensors", label: "Vehicle Sensors" },
    { key: "vehicle-batteries", label: "Vehicle Batteries" }, { key: "maintenance-records", label: "Maintenance" }
  ];
  const code = (number) => "#" + String(number).padStart(2, "0");
  const numeric = (value, digits) => value == null ? "—" : Number(value).toFixed(digits);
  const money = (value) => value == null ? "—" : "₹" + Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const metric = (label, value, note, icon, tone, ratio) => ({ label, value: value === null ? "—" : String(value), note: value === null ? "Related data unavailable" : note, icon, tone, ratio });
  const id = (label, field) => ({ label, type: "id", value: (row) => code(row[field]) });
  const primary = (label, value, subValue) => ({ label, type: "primary", value, subValue });
  const field = (label, value, type) => ({ label, type: type || "text", value });
  const pill = (label, value) => ({ label, type: "pill", value });
  const byId = (rows, fieldName) => rows === null ? null : new Map(rows.map((row) => [String(row[fieldName]), row]));
  const lookup = (map, idValue) => map === null ? null : map.get(String(idValue));
  function base(key, title, subtitle, searchPlaceholder, addLabel, registerTitle, idField, identity, filters, columnsTemplate, columns, relationKeys, context, metrics, filterValue, searchValues, detail, tone) {
    return { key, title, subtitle, eyebrow: "AquaFleet Command · Vehicles", searchPlaceholder, addLabel, registerTitle,
      idField, identity, pageSize: 8, filters, columnsTemplate, columns, relationKeys, tabs,
      context, metrics, filterValue, searchValues, detail, tone };
  }
  const sensorsKey = (row) => `${row.vehicle_id}/${row.sensor_id}`;
  const batteriesKey = (row) => `${row.vehicle_id}/${row.battery_id}/${row.start_cycle}`;
  const statusTone = (value) => ({ Installed: "green", Open: "blue", Closed: "green", Excellent: "green", Good: "green", Fair: "amber", Poor: "red", Replace: "red", "Past due date": "amber", "Future due date": "blue", "Due today": "amber" })[value] || "grey";

  function installationContext(rows, relations) {
    return { sensors: byId(relations.sensors, "sensor_id"), vehicles: byId(relations.vehicles, "vehicle_id") };
  }
  function installationMetrics(rows, info) {
    const vehicles = new Map(), sensors = new Set();
    rows.forEach((row) => { vehicles.set(String(row.vehicle_id), (vehicles.get(String(row.vehicle_id)) || 0) + 1); sensors.add(String(row.sensor_id)); });
    const highest = Math.max(0, ...vehicles.values());
    const leaders = highest ? rows.filter((row) => vehicles.get(String(row.vehicle_id)) === highest).map((row) => row.vehicle_name) : [];
    const names = [...new Set(leaders)].join(" and ");
    return [
      metric("Installations", rows.length, `Across ${vehicles.size} equipped vehicles`, "▣", "blue", 100),
      metric("Equipped Vehicles", vehicles.size, info.vehicles === null ? "Fleet total unavailable" : `of ${info.vehicles.size} fleet vehicles`, "◉", "teal", info.vehicles?.size ? vehicles.size / info.vehicles.size * 100 : 0),
      metric("Distinct Installed Sensors", sensors.size, "Sensor IDs in installation rows", "◈", "navy", 100),
      metric("Most Equipped", highest, names || "No installations recorded", "⌖", "grey", highest ? 100 : 0)
    ];
  }
  global.AquaFleetWorkspace.register(base(
    "vehicle-sensors", "Vehicle Sensors", "Sensor installations by vehicle, mounting position and installation date.", "Search vehicles or sensors", "Add Installation", "Installation Register",
    "vehicle_id", sensorsKey, ["All"], "58px minmax(190px,2fr) minmax(120px,1.1fr) minmax(118px,1.1fr) 106px 90px 112px",
    [id("Vehicle ID", "vehicle_id"), primary("Vehicle", (row) => row.vehicle_name, (row) => row.mount_position), field("Sensor", (row) => row.sensor_type), field("Manufacturer", (row) => row.manufacturer), field("Installed", (row) => Ui.formatDate(row.install_date), "mono"), pill("Status", () => "Installed")],
    ["sensors", "vehicles"], installationContext, installationMetrics, () => "Installed",
    (row) => [row.vehicle_id, row.vehicle_name, row.sensor_id, row.sensor_type, row.manufacturer, row.mount_position, row.install_date],
    (row, info) => {
      const sensor = row ? lookup(info.sensors, row.sensor_id) : null;
      return C.detailCard({ key: "vehicle-sensors", title: "Installation Detail", row, id: row && `${row.vehicle_id}/${row.sensor_id}`, name: row?.vehicle_name, subtitle: row?.sensor_type,
        status: "Installed", tone: "green", facts: [["Installed", row ? Ui.formatDate(row.install_date) : "—"], ["Vehicle ID", row ? code(row.vehicle_id) : "—"]],
        fields: [["Mount Position", row?.mount_position || "—"], ["Manufacturer", row?.manufacturer || "—"]],
        linkedLabel: "Sensor record", linked: !row ? [] : info.sensors === null ? null : [{ title: sensor?.sensor_type || `Sensor ${code(row.sensor_id)}`, meta: sensor?.calibration_date ? `Calibration date ${Ui.formatDate(sensor.calibration_date)}` : "Calibration date unavailable", status: sensor ? sensor.calibration_date ? "Date recorded" : "Not recorded" : "ID only", tone: "grey" }],
        emptyLinked: "No linked sensor record", editLabel: "Edit Installation", note: "Removing an installation does not delete the sensor record." });
    }, statusTone
  ));

  function batteryContext(rows, relations) { return { packs: byId(relations["battery-packs"], "battery_id") }; }
  function assignmentStatus(row) { return row.end_cycle === null ? "Open" : "Closed"; }
  function batteryMetrics(rows, info) {
    const open = rows.filter((row) => row.end_cycle === null).length, packs = new Set(rows.map((row) => String(row.battery_id)));
    return [
      metric("Assignment Periods", rows.length, `Across ${new Set(rows.map((row) => String(row.vehicle_id))).size} vehicles`, "▤", "blue", 100),
      metric("Open Periods", open, "No end cycle recorded", "⚡", "teal", rows.length ? open / rows.length * 100 : 0),
      metric("Closed Periods", rows.length - open, "End cycle recorded", "✓", "navy", rows.length ? (rows.length - open) / rows.length * 100 : 0),
      metric("Packs Assigned", packs.size, info.packs === null ? "Pack inventory unavailable" : `of ${info.packs.size} registered packs`, "◉", "grey", info.packs?.size ? packs.size / info.packs.size * 100 : 0)
    ];
  }
  global.AquaFleetWorkspace.register(base(
    "vehicle-batteries", "Vehicle Batteries", "Non-overlapping battery assignment periods recorded against each vehicle.", "Search vehicles or packs", "Add Assignment", "Assignment Periods",
    "vehicle_id", batteriesKey, ["All", "Open", "Closed"], "58px minmax(190px,2fr) 103px 134px 134px 76px 112px",
    [id("Vehicle ID", "vehicle_id"), primary("Vehicle", (row) => row.vehicle_name, (row) => `Battery ${row.battery_id} · ${row.chemistry}`), field("Capacity (Wh)", (row) => numeric(row.capacity_wh, 2), "num"), field("Start Cycle", (row) => Ui.formatDateTime(row.start_cycle), "mono"), field("End Cycle", (row) => row.end_cycle ? Ui.formatDateTime(row.end_cycle) : "—", "mono"), pill("State", assignmentStatus)],
    ["battery-packs"], batteryContext, batteryMetrics, assignmentStatus,
    (row) => [row.vehicle_id, row.vehicle_name, row.battery_id, row.chemistry, row.capacity_wh, row.start_cycle, row.end_cycle, assignmentStatus(row)],
    (row, info) => {
      const pack = row ? lookup(info.packs, row.battery_id) : null;
      return C.detailCard({ key: "vehicle-batteries", title: "Assignment Detail", row, id: row && `${row.vehicle_id}/${row.battery_id} · ${row.start_cycle.slice(0, 10)}`, name: row?.vehicle_name, subtitle: row && `Battery ${row.battery_id} · ${row.chemistry}`,
        status: row && assignmentStatus(row), tone: row && statusTone(assignmentStatus(row)), facts: [["Capacity (Wh)", row ? numeric(row.capacity_wh, 2) : "—"], ["Vehicle ID", row ? code(row.vehicle_id) : "—"]],
        fields: [["Cycle Start", row ? Ui.formatDateTime(row.start_cycle) : "—"], ["Cycle End", row?.end_cycle ? Ui.formatDateTime(row.end_cycle) : "Open period"]],
        linkedLabel: "Battery pack", linked: !row ? [] : info.packs === null ? null : [{ title: pack ? `Battery ${row.battery_id} · ${pack.chemistry}` : `Battery ${code(row.battery_id)}`, meta: pack ? `${pack.cycle_count} cycles` : "Pack detail unavailable", status: pack?.health_status || "ID only", tone: statusTone(pack?.health_status) }],
        emptyLinked: "No linked battery pack", editLabel: "Edit Assignment", note: "A battery pack cannot have overlapping assignment periods." });
    }, statusTone
  ));

  function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
  function maintenanceStatus(row, today) {
    if (!row.next_due_date) return "No due date";
    const current = typeof today === "string" ? today : localToday();
    return row.next_due_date < current ? "Past due date" : row.next_due_date === current ? "Due today" : "Future due date";
  }
  function maintenanceMetrics(rows) {
    const past = rows.filter((row) => maintenanceStatus(row) === "Past due date").length;
    const cost = rows.reduce((sum, row) => sum + Number(row.cost || 0), 0);
    const dated = rows.filter((row) => Boolean(row.next_due_date)).length;
    return [metric("Maintenance Records", rows.length, `Across ${new Set(rows.map((row) => String(row.vehicle_id))).size} vehicles`, "⚙", "blue", 100),
      metric("Past Recorded Due Dates", past, "Historical row date comparison", "!", "teal", rows.length ? past / rows.length * 100 : 0),
      metric("Recorded Cost", (cost / 1000000).toFixed(2), "₹ million, all records", "▣", "navy", 100),
      metric("Due Dates Recorded", dated, "Records with a next due date", "✓", "grey", rows.length ? dated / rows.length * 100 : 0)];
  }
  global.AquaFleetWorkspace.register(base(
    "maintenance-records", "Maintenance Records", "Vehicle maintenance history, work performed, recorded cost and next due dates.", "Search vehicles or actions", "Add Record", "Maintenance History",
    "maintenance_id", null, ["All", "Past due date", "Due today", "Future due date", "No due date"], "52px minmax(150px,1.6fr) minmax(180px,2fr) 105px 100px 102px 105px",
    [id("ID", "maintenance_id"), primary("Vehicle", (row) => row.vehicle_name, (row) => `${row.vehicle_type} · ${row.vehicle_status}`), field("Action Taken", (row) => row.action_taken), field("Cost", (row) => money(row.cost), "num"), field("Next Due", (row) => row.next_due_date ? Ui.formatDate(row.next_due_date) : "—", "mono"), pill("Status", maintenanceStatus)],
    [], () => ({}), maintenanceMetrics, maintenanceStatus,
    (row) => [row.maintenance_id, row.vehicle_id, row.vehicle_name, row.vehicle_type, row.vehicle_status, row.maint_date, row.action_taken, row.cost, row.next_due_date, maintenanceStatus(row)],
    (row) => C.detailCard({ key: "maintenance-records", title: "Record Detail", row, id: row?.maintenance_id, name: row?.vehicle_name, subtitle: row && `${row.vehicle_type} · ${row.vehicle_status}`,
      status: row && maintenanceStatus(row), tone: row && statusTone(maintenanceStatus(row)), facts: [["Cost", row ? money(row.cost) : "—"], ["Next Due", row?.next_due_date ? Ui.formatDate(row.next_due_date) : "No date recorded"]],
      fields: [["Maintenance Date", row ? Ui.formatDate(row.maint_date) : "—"], ["Action Taken", row?.action_taken || "—"]],
      linkedLabel: "Vehicle record", linked: row ? [{ title: row.vehicle_name || `Vehicle ${code(row.vehicle_id)}`, meta: `Vehicle ${code(row.vehicle_id)}`, status: row.vehicle_status, tone: statusTone(row.vehicle_status) }] : [],
      emptyLinked: "No linked vehicle record", editLabel: "Edit Record", note: "Deleting a maintenance record does not delete the vehicle." }), statusTone
  ));

  global.AquaFleetEquipmentWorkspaces = Object.freeze({ sensorsKey, batteriesKey, assignmentStatus, maintenanceStatus });
})(window);
