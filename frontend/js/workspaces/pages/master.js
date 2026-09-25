/* Batch 1: Marine Zones. Other master registers remain on the legacy renderer. */
(function registerMarineZones(global) {
  "use strict";
  const Data = global.AquaFleetWorkspaceData, C = global.AquaFleetWorkspaceComponents;
  const Master = global.AquaFleetMasterData, Ui = global.AquaFleetUi;
  function tone(value) { return { Low: "green", Moderate: "amber", High: "red", Critical: "red" }[value] || "grey"; }
  function depth(value) { return value == null ? "—" : Number(value).toFixed(2); }
  function context(zones, missions) {
    return { missions: missions === null ? null : Data.groupBy(missions, "zone_id") };
  }
  function linked(zone, info) { return info.missions === null ? null : info.missions.get(String(zone.zone_id)) || []; }
  function metrics(zones, info) {
    const regions = new Set(zones.map(function (zone) { return zone.region; }).filter(Boolean)).size;
    const used = info.missions === null ? null : zones.filter(function (zone) { return linked(zone, info).length > 0; }).length;
    const deepest = zones.reduce(function (best, zone) { return !best || Number(zone.max_depth) > Number(best.max_depth) ? zone : best; }, null);
    const restricted = zones.filter(function (zone) { return zone.risk_level === "High" || zone.risk_level === "Critical"; }).length;
    return [
      { icon: "◈", label: "Registered Zones", value: String(zones.length), note: "Across " + regions + (regions === 1 ? " sea region" : " sea regions"), ratio: zones.length ? 100 : 0, tone: "blue" },
      { icon: "⌖", label: "Zones In Use", value: used === null ? "—" : String(used), note: used === null ? "Mission data unavailable" : used === zones.length && zones.length ? "All zones carry missions" : used + " of " + zones.length + " zones carry missions", ratio: used === null || !zones.length ? 0 : used / zones.length * 100, tone: "teal" },
      { icon: "▽", label: "Deepest Envelope (m)", value: deepest ? String(deepest.max_depth) : "—", note: deepest ? deepest.zone_name : "No depth data recorded", ratio: deepest ? 88 : 0, tone: "navy" },
      { icon: "!", label: "High Or Critical Risk", value: String(restricted), note: restricted + " of " + zones.length + " zones restricted", ratio: zones.length ? restricted / zones.length * 100 : 0, tone: "grey" }
    ];
  }
  function detail(zone, info) {
    const card = C.el("article", "ws-card ws-detail");
    const head = C.el("div", "ws-detail-head"); head.append(C.el("h2", "", "Zone Detail"), C.el("span", "ws-detail-ref", zone ? "#" + String(zone.zone_id).padStart(2, "0") : "—")); card.appendChild(head);
    if (!zone) { const empty = C.el("div", "ws-detail-body"); C.state(empty, "empty", "No zone selected", "Select a zone from the register."); card.appendChild(empty); return card; }
    const body = C.el("div", "ws-detail-body");
    body.append(C.el("strong", "ws-detail-title", zone.zone_name), C.el("p", "ws-detail-sub", zone.region), C.pill(zone.risk_level, tone(zone.risk_level)));
    const facts = C.el("div", "ws-facts");
    const count = linked(zone, info);
    facts.append(C.fact("Depth Span", (Number(zone.max_depth) - Number(zone.min_depth)).toLocaleString() + " m"), C.fact("Missions", count === null ? "Unavailable" : String(count.length)));
    body.append(facts, C.fact("Minimum Depth", depth(zone.min_depth) + " m", true), C.fact("Maximum Depth", depth(zone.max_depth) + " m", true));
    body.appendChild(C.el("p", "ws-section-label", "Missions in this zone"));
    const list = C.el("div", "ws-linked");
    if (count === null) {
      list.appendChild(C.el("p", "ws-linked-empty", "Mission data unavailable."));
      list.appendChild(C.button("Retry missions", "ws-state-retry", function () { global.AquaFleetWorkspace.refresh(); }));
    }
    else if (!count.length) list.appendChild(C.el("p", "ws-linked-empty", "No missions recorded in this zone"));
    else count.slice().sort(function (a, b) { return String(b.start_time).localeCompare(String(a.start_time)); }).forEach(function (mission) {
      const row = C.el("div", "ws-linked-row"), copy = C.el("div", "ws-linked-copy");
      copy.append(C.el("strong", "", mission.mission_type), C.el("small", "", Ui.formatDateTime(mission.start_time)));
      row.append(copy, C.pill(mission.status, { Completed: "green", "In Progress": "blue", Planned: "grey", Aborted: "red" }[mission.status])); list.appendChild(row);
    });
    body.appendChild(list); card.appendChild(body);
    if (Master.can("marine-zones", "update") || Master.can("marine-zones", "delete")) {
      const footer = C.el("div", "ws-detail-footer"), actions = C.el("div", "ws-detail-actions");
      if (Master.can("marine-zones", "update")) actions.appendChild(C.button("Edit Zone", "ws-primary", function () { Master.openEdit("marine-zones", zone); }));
      if (Master.can("marine-zones", "delete")) actions.appendChild(C.button("Delete", "ws-danger", function () { Master.openDelete("marine-zones", zone); }));
      footer.append(actions, C.el("p", "ws-detail-note", "Zones referenced by a mission cannot be deleted.")); card.appendChild(footer);
    }
    return card;
  }
  global.AquaFleetWorkspace.register({
    key: "marine-zones", title: "Marine Zones", subtitle: "Survey regions, operating depth envelopes and risk classification for mission planning.", searchPlaceholder: "Search zones or regions", addLabel: "Add Zone", relationKey: "missions", idField: "zone_id", filterField: "risk_level",
    registerTitle: "Zone Register", pageSize: 8, filters: ["All", "Low", "Moderate", "High", "Critical"], searchFields: ["zone_id", "zone_name", "region", "risk_level"],
    tabs: [{ key: "vessels", label: "Research Vessels" }, { key: "marine-zones", label: "Marine Zones" }, { key: "offshore-assets", label: "Offshore Assets" }, { key: "operators", label: "Operators" }],
    columnsTemplate: "52px minmax(190px,2.1fr) 92px 92px 78px 104px 122px",
    columns: [
      { label: "ID", type: "id", value: function (row) { return "#" + String(row.zone_id).padStart(2, "0"); } },
      { label: "Zone", type: "primary", field: "zone_name", subField: "region" },
      { label: "Min Depth", type: "num", value: function (row) { return depth(row.min_depth); } },
      { label: "Max Depth", type: "num", value: function (row) { return depth(row.max_depth); } },
      { label: "Missions", type: "num", value: function (row, info) { const rows = linked(row, info); return rows === null ? "—" : String(rows.length); } },
      { label: "Risk", type: "pill", field: "risk_level" }
    ], context: context, metrics: metrics, tone: tone, detail: detail
  });
  global.AquaFleetMarineZones = Object.freeze({ context: context, metrics: metrics, linked: linked, depth: depth });
})(window);
