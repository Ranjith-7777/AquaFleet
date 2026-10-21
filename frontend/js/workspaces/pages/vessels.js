/* Research Vessels register, on the shared workspace controller. */
(function registerResearchVessels(global) {
  "use strict";
  const Data = global.AquaFleetWorkspaceData, C = global.AquaFleetWorkspaceComponents, Ui = global.AquaFleetUi;
  const TONES = { "At Sea": "blue", "In Port": "green", Scheduled: "amber", Unassigned: "grey", Unknown: "grey" };
  const EXPEDITION_TONES = { Active: "blue", Planned: "amber", Completed: "green", Cancelled: "grey" };

  function tone(value) { return TONES[value] || "grey"; }
  function pad(id) { return String(id).padStart(2, "0"); }
  function context(vessels, expeditions) {
    return { expeditions: expeditions === null ? null : Data.groupBy(expeditions, "vessel_id") };
  }
  function linked(vessel, info) { return info.expeditions === null ? null : info.expeditions.get(String(vessel.vessel_id)) || []; }

  /* Deployment is derived from the vessel's expeditions and never stored:
     Active means At Sea, Planned means Scheduled, past-only history means In
     Port and no expedition at all means Unassigned. `group` is the filter
     bucket (a Scheduled vessel is still in port). */
  function deployment(vessel, info) {
    const list = linked(vessel, info);
    if (list === null) return { label: "Unknown", group: "Unknown" };
    if (list.some(function (row) { return row.status === "Active"; })) return { label: "At Sea", group: "At Sea" };
    if (list.some(function (row) { return row.status === "Planned"; })) return { label: "Scheduled", group: "In Port" };
    if (list.length) return { label: "In Port", group: "In Port" };
    return { label: "Unassigned", group: "Unassigned" };
  }
  function isDeepSea(vessel) { return /ocean|deep[\s-]?sea/i.test(String(vessel.vessel_type || "")); }

  function metrics(vessels, info) {
    const total = vessels.length;
    const ports = new Set(vessels.map(function (v) { return Data.normalize(v.home_port); }).filter(Boolean)).size;
    const capacities = vessels.map(function (v) { return Number(v.capacity) || 0; });
    const capacity = capacities.reduce(function (a, b) { return a + b; }, 0);
    const mean = total ? Math.round(capacity / total) : 0, largest = capacities.length ? Math.max.apply(null, capacities) : 0;
    const deep = vessels.filter(isDeepSea).length;
    const committed = info.expeditions === null ? null : vessels.filter(function (v) {
      const label = deployment(v, info).label; return label === "At Sea" || label === "Scheduled";
    }).length;
    return [
      { icon: "⚓", label: "Registered Vessels", value: String(total), note: "Across " + ports + " home " + (ports === 1 ? "port" : "ports"), ratio: total ? 100 : 0, tone: "blue" },
      { icon: "⌖", label: "Assigned To Expeditions", value: committed === null ? "—" : String(committed), note: committed === null ? "Expedition data unavailable" : committed + " of " + total + " vessels committed", ratio: committed === null || !total ? 0 : committed / total * 100, tone: "teal" },
      { icon: "◫", label: "Total Berth Capacity", value: String(capacity), note: "Mean " + mean + " berths per vessel", ratio: largest ? mean / largest * 100 : 0, tone: "navy" },
      { icon: "▣", label: "Deep Sea Class", value: String(deep), note: "Ocean and deep-sea platforms", ratio: total ? deep / total * 100 : 0, tone: "grey" }
    ];
  }

  function detail(vessel, info) {
    if (!vessel) return C.detailCard({ key: "vessels", title: "Vessel Detail", row: null });
    const list = linked(vessel, info), state = deployment(vessel, info);
    return C.detailCard({
      key: "vessels", title: "Vessel Detail", row: vessel, id: vessel.vessel_id, name: vessel.vessel_name, subtitle: vessel.vessel_type,
      status: state.label, tone: tone(state.label),
      facts: [["Capacity", Ui.formatNumber(vessel.capacity)], ["Expeditions", list === null ? "—" : String(list.length)]],
      fields: [["Home Port", Ui.nullableText(vessel.home_port)]],
      linkedLabel: "Linked Expeditions",
      linked: list === null ? null : list.slice().sort(function (a, b) { return String(b.start_date).localeCompare(String(a.start_date)); }).map(function (row) {
        return { title: row.title, meta: Ui.formatDate(row.start_date) + " – " + Ui.formatDate(row.end_date), status: row.status, tone: EXPEDITION_TONES[row.status] };
      }),
      emptyLinked: "No expeditions assigned · vessel is free for scheduling", editLabel: "Edit Vessel",
      note: "Vessels assigned to an expedition cannot be deleted."
    });
  }

  global.AquaFleetWorkspace.register({
    key: "vessels", title: "Research Vessels", eyebrow: "AquaFleet Command · Fleet",
    subtitle: "Registered fleet platforms, berth capacity and home-port assignment from the AquaFleet database.",
    searchPlaceholder: "Search vessels or ports", addLabel: "Add Vessel", relationKey: "expeditions", idField: "vessel_id",
    registerTitle: "Vessel Register", pageSize: 8, filters: ["All", "At Sea", "In Port", "Unassigned"],
    filterValue: function (row, info) { return deployment(row, info).group; },
    searchValues: function (row, info) { return [row.vessel_id, row.vessel_name, row.vessel_type, row.home_port, row.capacity, deployment(row, info).label]; },
    columnsTemplate: "52px minmax(190px,2.1fr) minmax(150px,1.5fr) 84px 112px 122px",
    columns: [
      { label: "ID", type: "id", value: function (row) { return "#" + pad(row.vessel_id); } },
      { label: "Vessel", type: "primary", field: "vessel_name", subField: "vessel_type" },
      { label: "Home Port", type: "text", field: "home_port" },
      { label: "Capacity", type: "num", field: "capacity" },
      { label: "Deployment", type: "pill", value: function (row, info) { return deployment(row, info).label; } }
    ], context: context, metrics: metrics, tone: tone, detail: detail
  });
  global.AquaFleetVessels = Object.freeze({ context: context, metrics: metrics, deployment: deployment, linked: linked });
})(window);
