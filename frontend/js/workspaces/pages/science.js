/* Science records and incidents, using only stored state and keyed relationships. */
(function registerScienceWorkspaces(global) {
  "use strict";
  const C = global.AquaFleetWorkspaceComponents, Ui = global.AquaFleetUi;
  const programmeTabs = [{ key: "expeditions", label: "Expeditions" }, { key: "samples", label: "Samples" }, { key: "sample-aliquots", label: "Sample Aliquots" }];
  const operationsTabs = [{ key: "missions", label: "Missions" }, { key: "mission-vehicles", label: "Mission Vehicles" }, { key: "mission-operators", label: "Mission Operators" }, { key: "telemetry-points", label: "Telemetry" }, { key: "incidents", label: "Incidents" }, { key: "inspection-tasks", label: "Inspections" }];
  const custody = ["All", "Collected", "Sealed", "In Transit", "Received", "Stored", "Released", "Disposed"];
  const code = (value) => "#" + String(value).padStart(2, "0");
  const time = (value) => value ? Ui.formatDateTime(value) : "—";
  const fixed = (value, digits) => value == null ? "—" : Number(value).toFixed(digits);
  const tone = (value) => ({ Collected: "blue", Sealed: "blue", "In Transit": "amber", Received: "green", Stored: "green", Released: "grey", Disposed: "grey", Low: "green", Moderate: "amber", High: "red", Critical: "red", Planned: "grey", "In Progress": "blue", Completed: "green", Aborted: "red" })[value] || "grey";
  const percent = (part, total) => total ? part / total * 100 : 0;
  const metric = (label, value, note, icon, color, ratio) => ({ label, value: value === null ? "Unavailable" : String(value), note: value === null ? "Related data unavailable" : note, icon, tone: color, ratio });
  const id = (label, key) => ({ label, type: "id", value: (row) => code(row[key]) });
  const primary = (label, value, subValue) => ({ label, type: "primary", value, subValue });
  const field = (label, value, type) => ({ label, type: type || "text", value });
  const pill = (label, value) => ({ label, type: "pill", value });
  const byId = (rows, key) => rows === null ? null : new Map(rows.map((row) => [String(row[key]), row]));
  function grouped(rows, key) {
    if (rows === null) return null;
    const map = new Map();
    rows.forEach((row) => { const idValue = String(row[key]); if (!map.has(idValue)) map.set(idValue, []); map.get(idValue).push(row); });
    return map;
  }
  const related = (map, key) => map === null ? null : map.get(String(key)) || [];
  const aliquotKey = (row) => `${row.sample_id}/${row.aliquot_no}`;
  function base(key, title, subtitle, eyebrow, searchPlaceholder, addLabel, registerTitle, idField, identity, filters, template, columns, relationKeys, context, metrics, filterValue, searchValues, detail, tabs) {
    return { key, title, subtitle, eyebrow, searchPlaceholder, addLabel, registerTitle, idField, identity, pageSize: 8,
      filters, columnsTemplate: template, columns, relationKeys, context, metrics, filterValue, searchValues, detail, tabs, tone };
  }
  function incidentContext(rows, relations) { return { missions: byId(relations.missions, "mission_id") }; }
  function incidentMetrics(rows, info) {
    const high = rows.filter((row) => row.severity === "High" || row.severity === "Critical").length;
    const affected = new Set(rows.map((row) => String(row.mission_id))).size;
    const low = rows.filter((row) => row.severity === "Low").length;
    return [metric("Recorded Incidents", rows.length, `Across ${affected} missions`, "!", "blue", 100),
      metric("High Or Critical", high, "Stored severity, any mission state", "▲", "teal", percent(high, rows.length)),
      metric("Missions Affected", affected, info.missions === null ? "Mission collection unavailable" : `of ${info.missions.size} recorded missions`, "◎", "navy", info.missions?.size ? percent(affected, info.missions.size) : 0),
      metric("Low Severity", low, "Stored severity", "✓", "grey", percent(low, rows.length))];
  }
  global.AquaFleetWorkspace.register(base("incidents", "Incidents", "Recorded mission incidents, severity classification and full reported descriptions.", "AquaFleet Command · Operations", "Search incidents or missions", "Report Incident", "Incident Log", "incident_id", null,
    ["All", "Low", "Moderate", "High", "Critical"], "55px minmax(160px,1.6fr) minmax(170px,1.8fr) 140px 95px 112px",
    [id("ID", "incident_id"), primary("Incident", (row) => row.incident_type, (row) => row.mission_type), field("Description", (row) => row.description), field("Reported", (row) => time(row.time_reported), "mono"), pill("Severity", (row) => row.severity)],
    ["missions"], incidentContext, incidentMetrics, (row) => row.severity,
    (row) => [row.incident_id, row.mission_id, row.incident_type, row.mission_type, row.description, row.severity, row.time_reported],
    (row, info) => { const mission = row && info.missions !== null ? info.missions.get(String(row.mission_id)) : null;
      return C.detailCard({ key: "incidents", title: "Incident Detail", row, id: row?.incident_id, name: row?.incident_type, subtitle: row?.mission_type,
        status: row?.severity, tone: tone(row?.severity), facts: [["Reported", row ? time(row.time_reported) : "—"], ["Incident ID", row ? code(row.incident_id) : "—"]],
        fields: [["Mission", row?.mission_type || "—"], ["Description", row?.description || "—"]],
        linkedLabel: "Parent mission", linked: !row ? [] : info.missions === null ? null : [{ title: mission?.mission_type || `Mission ${code(row.mission_id)}`, meta: mission ? time(mission.start_time) : "ID only", status: mission?.status || "", tone: tone(mission?.status) }],
        emptyLinked: "No parent mission detail", editLabel: "Edit Incident", note: "Deleting an incident removes this report from the record." }); }, operationsTabs));

  function sampleContext(rows, relations) { return { aliquots: grouped(relations["sample-aliquots"], "sample_id"), allAliquots: relations["sample-aliquots"] }; }
  function sampleMetrics(rows, info) {
    const transit = rows.filter((row) => row.chain_of_custody_status === "In Transit").length;
    const held = rows.filter((row) => ["Stored", "Received"].includes(row.chain_of_custody_status)).length;
    return [metric("Recorded Samples", rows.length, `From ${new Set(rows.map((row) => String(row.mission_id))).size} missions`, "◈", "blue", 100),
      metric("Aliquot Rows", info.allAliquots === null ? null : info.allAliquots.length, "Sub-portions of all samples", "▤", "teal", 100),
      metric("In Transit", transit, "Stored sample custody state", "⌖", "navy", percent(transit, rows.length)),
      metric("Stored Or Received", held, "Two literal custody values", "✓", "grey", percent(held, rows.length))];
  }
  global.AquaFleetWorkspace.register(base("samples", "Samples", "Collected marine samples, preservation method and chain-of-custody state.", "AquaFleet Command · Programme", "Search samples or missions", "Add Sample", "Sample Register", "sample_id", null,
    custody, "55px minmax(160px,1.6fr) 145px minmax(130px,1fr) 75px 105px 112px",
    [id("ID", "sample_id"), primary("Sample", (row) => row.sample_type, (row) => row.mission_type), field("Collected", (row) => time(row.collected_at), "mono"), field("Preservation", (row) => row.preservation_method), field("Aliquots", (row) => row.aliquot_count, "num"), pill("Custody", (row) => row.chain_of_custody_status)],
    ["sample-aliquots"], sampleContext, sampleMetrics, (row) => row.chain_of_custody_status,
    (row) => [row.sample_id, row.mission_id, row.sample_type, row.mission_type, row.preservation_method, row.collected_at, row.chain_of_custody_status],
    (row, info) => { const aliquots = row ? related(info.aliquots, row.sample_id) : [];
      return C.detailCard({ key: "samples", title: "Sample Detail", row, id: row?.sample_id, name: row?.sample_type, subtitle: row?.mission_type,
        status: row?.chain_of_custody_status, tone: tone(row?.chain_of_custody_status), facts: [["Aliquots", row ? String(row.aliquot_count) : "—"], ["Sample ID", row ? code(row.sample_id) : "—"]],
        fields: [["Collected At", row ? time(row.collected_at) : "—"], ["Preservation Method", row?.preservation_method || "—"]],
        linkedLabel: "Derived aliquots", linked: aliquots && aliquots.map((item) => ({ title: `Aliquot ${code(item.aliquot_no)}`, meta: `${fixed(item.volume_ml, 2)} ml · ${fixed(item.storage_temp, 2)} °C`, status: `Sample: ${item.chain_of_custody_status}`, tone: tone(item.chain_of_custody_status) })),
        emptyLinked: "No aliquots derived from this sample", editLabel: "Edit Sample", note: "Samples with aliquots cannot be deleted." }); }, programmeTabs));

  function aliquotContext(rows, relations) { return { samples: byId(relations.samples, "sample_id") }; }
  function aliquotMetrics(rows) {
    const volume = rows.reduce((sum, row) => sum + Number(row.volume_ml || 0), 0);
    const atMinus80 = rows.filter((row) => Number(row.storage_temp) === -80).length;
    const held = rows.filter((row) => ["Stored", "Received"].includes(row.chain_of_custody_status)).length;
    return [metric("Aliquots", rows.length, `Derived from ${new Set(rows.map((row) => String(row.sample_id))).size} samples`, "▤", "blue", 100),
      metric("Total Volume", (volume / 1000).toFixed(2), "Litres across all aliquot rows", "◈", "teal", 100),
      metric("At -80 °C", atMinus80, "Recorded storage temperature", "❄", "navy", percent(atMinus80, rows.length)),
      metric("Parent Stored/Received", held, "Parent sample stored or received", "✓", "grey", percent(held, rows.length))];
  }
  global.AquaFleetWorkspace.register(base("sample-aliquots", "Sample Aliquots", "Sub-portions of collected samples with volume and storage temperature.", "AquaFleet Command · Programme", "Search aliquots or samples", "Add Aliquot", "Aliquot Register", "sample_id", aliquotKey,
    custody, "68px 68px minmax(145px,1.4fr) 105px 110px 105px 112px",
    [id("Sample", "sample_id"), id("Aliquot", "aliquot_no"), field("Sample Type", (row) => row.sample_type), field("Volume (ml)", (row) => fixed(row.volume_ml, 2), "num"), field("Storage Temp", (row) => `${fixed(row.storage_temp, 2)} °C`, "mono"), pill("Parent Custody", (row) => row.chain_of_custody_status)],
    ["samples"], aliquotContext, aliquotMetrics, (row) => row.chain_of_custody_status,
    (row, info) => [row.sample_id, row.aliquot_no, row.sample_type, row.preservation_method, row.mission_id, row.volume_ml, row.storage_temp, row.chain_of_custody_status, info.samples?.get(String(row.sample_id))?.mission_type],
    (row, info) => { const parent = row && info.samples !== null ? info.samples.get(String(row.sample_id)) : null;
      return C.detailCard({ key: "sample-aliquots", title: "Aliquot Detail", row, id: row && aliquotKey(row), name: row && `Aliquot ${code(row.aliquot_no)}`, subtitle: row?.sample_type,
        status: row && `Parent: ${row.chain_of_custody_status}`, tone: tone(row?.chain_of_custody_status), facts: [["Volume (ml)", row ? fixed(row.volume_ml, 2) : "—"], ["Storage Temp", row ? `${fixed(row.storage_temp, 2)} °C` : "—"]],
        fields: [["Parent Sample", row ? code(row.sample_id) : "—"], ["Aliquot Number", row ? code(row.aliquot_no) : "—"]],
        linkedLabel: "Parent sample", linked: !row ? [] : info.samples === null ? null : [{ title: parent?.sample_type || `Sample ${code(row.sample_id)}`, meta: parent ? `${parent.preservation_method} · ${time(parent.collected_at)}` : "ID only", status: parent ? `Sample: ${parent.chain_of_custody_status}` : "", tone: tone(parent?.chain_of_custody_status) }],
        emptyLinked: "No parent sample detail", editLabel: "Edit Aliquot", note: "Aliquot numbers are unique within each sample and cannot be changed after creation." }); }, programmeTabs));

  global.AquaFleetScienceWorkspaces = Object.freeze({ grouped, related, aliquotKey, incidentMetrics, sampleMetrics, aliquotMetrics });
})(window);
