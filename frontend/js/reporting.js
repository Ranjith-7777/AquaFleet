/* Read-only reporting workspace over the five existing SQL-view endpoints. */
(function exposeAquaFleetReports(global) {
  "use strict";
  const Api = global.AquaFleetApi, Ui = global.AquaFleetUi, Csv = global.AquaFleetReportCsv;
  const choice = (values) => values.map((value) => ({ value, label: value }));
  const reports = [
    { key: "expeditions", title: "Expedition Summary", view: "vw_expedition_summary", path: "/api/reports/expeditions",
      description: "Vessels, budgets, campaign dates and derived mission totals.",
      filter: { name: "status", label: "Expedition status", choices: choice(["Planned", "Active", "Completed", "Cancelled"]) },
      columns: [["expedition_id", "ID", "number"], ["title", "Expedition"], ["vessel_name", "Vessel"], ["start_date", "Start", "date"], ["end_date", "End", "date"], ["status", "Status", "badge", "expedition"], ["budget", "Budget", "number"], ["mission_count", "Missions", "number"]] },
    { key: "missions", title: "Mission Operations", view: "vw_mission_operations", path: "/api/reports/missions",
      description: "Expedition and zone context with derived duration and assignment counts.",
      filter: { name: "status", label: "Mission status", choices: choice(["Planned", "In Progress", "Completed", "Aborted"]) },
      columns: [["mission_id", "ID", "number"], ["mission_type", "Mission"], ["expedition_title", "Expedition"], ["zone_name", "Zone"], ["duration_minutes", "Minutes", "number"], ["vehicle_count", "Vehicles", "number"], ["operator_count", "Operators", "number"], ["status", "Status", "badge", "mission"]] },
    { key: "vehicle-readiness", title: "Vehicle Readiness", view: "vw_vehicle_readiness", path: "/api/reports/vehicle-readiness",
      description: "Configuration counts and maintenance dates without storing derived readiness data.",
      filter: { name: "status", label: "Vehicle status", choices: choice(["Available", "Deployed", "Maintenance", "Retired"]) },
      columns: [["vehicle_id", "ID", "number"], ["vehicle_name", "Vehicle"], ["vehicle_type", "Type"], ["status", "Status", "badge", "vehicle"], ["sensor_count", "Sensors", "number"], ["open_battery_assignment_count", "Open batteries", "number"], ["last_maintenance_date", "Last maintenance", "date"], ["next_maintenance_due", "Next due", "date"]] },
    { key: "sample-lineage", title: "Sample Lineage", view: "vw_sample_lineage", path: "/api/reports/sample-lineage",
      description: "Traceability from expedition and mission through samples to aliquots.",
      localFilter: { name: "chain_of_custody_status", label: "Custody state", choices: choice(["Collected", "Sealed", "In Transit", "Received", "Stored", "Released", "Disposed"]) },
      columns: [["expedition_title", "Expedition"], ["mission_type", "Mission"], ["sample_id", "Sample ID", "number"], ["sample_type", "Sample"], ["collected_at", "Collected", "datetime"], ["chain_of_custody_status", "Custody", "badge", "custody"], ["aliquot_no", "Aliquot", "number"], ["volume_ml", "Volume (ml)", "number"]] },
    { key: "incidents", title: "Incident Overview", view: "vw_incident_overview", path: "/api/reports/incidents",
      description: "Incident severity with mission, expedition and zone context.",
      filter: { name: "severity", label: "Severity", choices: choice(["Low", "Moderate", "High", "Critical"]) },
      columns: [["incident_id", "ID", "number"], ["incident_type", "Incident"], ["severity", "Severity", "badge", "severity"], ["mission_type", "Mission"], ["expedition_title", "Expedition"], ["zone_name", "Zone"], ["time_reported", "Reported", "datetime"]] }
  ];
  let activeKey = "expeditions", requestVersion = 0, query = "", filterValue = "", rows = null, state = "loading", errorMessage = "";
  let panel = null;

  function reportByKey(key) { return reports.find((report) => report.key === key) || reports[0]; }
  function visibleRows(report, source, search, localValue) {
    const needle = search.trim().toLocaleLowerCase();
    return source.filter((row) => {
      if (report.localFilter && localValue && row[report.localFilter.name] !== localValue) return false;
      return !needle || report.columns.some((column) => String(row[column[0]] ?? "").toLocaleLowerCase().includes(needle));
    });
  }
  function canExport(currentState, currentRows) {
    return currentState === "success" && Array.isArray(currentRows) && currentRows.length > 0;
  }
  function node(tag, className, text, attributes) {
    return Ui.element(tag, { className, text, attributes });
  }
  function format(value, type, category) {
    if (type === "badge") return Ui.statusBadge(value, category);
    const output = type === "date" ? Ui.formatDate(value)
      : type === "datetime" ? Ui.formatDateTime(value)
      : type === "number" ? Ui.formatNumber(value) : Ui.nullableText(value);
    return node("span", type === "number" ? "report-number" : "", output);
  }
  function setRail(report) {
    const rail = document.getElementById("context-rail");
    Ui.clearElement(rail);
    const heading = node("div", "rail-heading");
    heading.append(node("p", "", "Report Context"), node("h2", "", report.title));
    const count = node("article", "rail-card");
    count.append(node("p", "rail-label", "Rows returned"),
      node("strong", "rail-value", state === "loading" ? "Loading" : state === "error" ? "Unavailable" : String(rows.length)),
      node("p", "rail-note", state === "loading" ? "Querying report" : state === "error" ? "Report request unavailable" : "Read-only result set"));
    const source = node("article", "rail-card rail-guidance");
    source.append(node("p", "rail-label", "SQL source"), node("p", "", report.view + " derives this report from normalized AquaFleet tables."));
    const available = node("article", "rail-card report-available");
    available.appendChild(node("p", "rail-label", "Available reports"));
    reports.forEach((entry) => {
      const button = node("button", "report-rail-link" + (entry.key === report.key ? " active" : ""), entry.title,
        { type: "button", "aria-label": "Open " + entry.title });
      button.addEventListener("click", () => select(entry.key));
      available.appendChild(button);
    });
    rail.append(heading, count, source, available, node("p", "report-rail-note", "Reports are read-only. Records are edited in their own workspaces."));
  }
  function renderRows(report, source) {
    const shown = visibleRows(report, source, query, filterValue);
    const summary = node("p", "report-shown", "Showing " + shown.length + " of " + source.length + " returned rows");
    const scroll = node("div", "report-scroll");
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", report.title + " results");
    scroll.tabIndex = 0;
    const table = node("table", "report-table");
    const head = node("thead"), headRow = node("tr");
    report.columns.forEach((column) => headRow.appendChild(node("th", "", column[1], { scope: "col" })));
    head.appendChild(headRow); table.appendChild(head);
    const body = node("tbody");
    shown.forEach((row) => {
      const tr = node("tr");
      report.columns.forEach((column) => {
        const td = node("td");
        td.appendChild(format(row[column[0]], column[2], column[3]));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body); scroll.appendChild(table);
    if (shown.length) return [scroll, summary];
    const empty = node("div", "report-state");
    empty.append(node("strong", "", source.length ? "No matching rows" : "No report rows"),
      node("p", "", source.length ? "Adjust search or the selected filter." : "The selected view and filters returned no records."));
    return [empty, summary];
  }
  function renderResult(report) {
    if (!panel) return;
    const result = panel.querySelector(".report-result");
    Ui.clearElement(result);
    result.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (state === "loading") {
      const loading = node("div", "report-state", "Querying " + report.view + "…");
      loading.setAttribute("role", "status"); result.appendChild(loading);
    } else if (state === "error") {
      const failure = node("div", "report-state report-state-error");
      failure.append(node("strong", "", "Unable to load report"), node("p", "", errorMessage || "The report request failed."));
      const retry = node("button", "report-retry", "Retry", { type: "button" });
      retry.addEventListener("click", () => load(report));
      failure.appendChild(retry); result.appendChild(failure);
    } else {
      const parts = renderRows(report, rows);
      parts.forEach((part) => result.appendChild(part));
    }
    const exportButton = panel.querySelector(".report-export");
    exportButton.disabled = !canExport(state, rows);
    setRail(report);
  }
  function renderControls(report) {
    if (!panel) return;
    panel.querySelector(".report-title").textContent = report.title;
    panel.querySelector(".report-description").textContent = report.description;
    document.querySelector(".report-source-name").textContent = report.view;
    const tabs = panel.querySelector(".report-tabs");
    tabs.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.report === report.key;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    const filters = panel.querySelector(".report-filters");
    Ui.clearElement(filters);
    const spec = report.filter || report.localFilter;
    if (spec) {
      filters.setAttribute("aria-label", spec.label);
      [{ value: "", label: "All" }, ...spec.choices].forEach((entry) => {
        const button = node("button", "report-filter" + (filterValue === entry.value ? " active" : ""), entry.label,
          { type: "button", "aria-pressed": String(filterValue === entry.value) });
        button.addEventListener("click", () => {
          filterValue = entry.value;
          renderControls(report);
          if (report.filter) load(report); else renderResult(report);
        });
        filters.appendChild(button);
      });
    }
    panel.querySelector(".report-filter-label").textContent = spec?.label || "Report results";
    document.querySelector(".report-refresh").onclick = () => load(report);
    panel.querySelector(".report-export").onclick = () => {
      if (canExport(state, rows)) Csv.download(report, rows);
    };
  }
  async function load(report) {
    const version = ++requestVersion;
    state = "loading"; rows = null; errorMessage = ""; renderResult(report);
    try {
      const params = report.filter && filterValue ? { [report.filter.name]: filterValue } : {};
      const response = await Api.get(report.path, params);
      if (version !== requestVersion || activeKey !== report.key) return;
      if (!Array.isArray(response.data)) throw new Error("The report response did not contain rows.");
      rows = response.data; state = "success";
    } catch (error) {
      if (version !== requestVersion || activeKey !== report.key) return;
      rows = null; state = "error"; errorMessage = error.message || "The reporting query failed.";
    }
    renderResult(report);
  }
  function select(key) {
    activeKey = reportByKey(key).key;
    filterValue = "";
    const report = reportByKey(activeKey);
    renderControls(report);
    load(report);
  }
  function setQuery(value) {
    query = value || "";
    if (state === "success") renderResult(reportByKey(activeKey));
  }
  function leave() {
    ++requestVersion; panel = null; rows = null; state = "loading"; query = ""; filterValue = "";
    const rail = document.getElementById("context-rail");
    const parent = document.querySelector(".workspace-shell");
    if (rail && parent && rail.parentElement !== parent) parent.appendChild(rail);
  }
  function render(container) {
    leave();
    panel = container;
    Ui.clearElement(container);
    const actions = document.getElementById("page-actions");
    const source = node("div", "report-header-source");
    source.append(node("span", "report-source-label", "SQL VIEW"), node("strong", "report-source-name", reportByKey(activeKey).view));
    const refresh = node("button", "report-refresh", "↻  Refresh Report", { type: "button" });
    actions.append(source, refresh);
    const shell = node("div", "report-workspace");
    const tabs = node("div", "report-tabs", undefined, { role: "tablist", "aria-label": "AquaFleet reports" });
    reports.forEach((report) => {
      const button = node("button", "report-tab", report.title,
        { type: "button", role: "tab", "data-report": report.key });
      button.addEventListener("click", () => select(report.key));
      tabs.appendChild(button);
    });
    const result = node("section", "report-result", undefined, { "aria-label": "Report results" });
    const heading = node("div", "report-result-head");
    heading.append(node("h2", "report-title"), node("p", "report-description"));
    const filterRow = node("div", "report-filter-row");
    filterRow.append(node("span", "report-filter-label"), node("div", "report-filters", undefined, { role: "group" }));
    const footer = node("div", "report-footer");
    footer.append(node("span", "", "CSV exports every row returned by the selected report request."),
      node("button", "report-export", "Export CSV", { type: "button" }));
    shell.append(heading, filterRow, result, footer);
    const main = node("div", "report-main");
    main.append(tabs, shell);
    const layout = node("div", "report-layout");
    layout.append(main, document.getElementById("context-rail"));
    container.appendChild(layout);
    select(activeKey);
  }
  global.AquaFleetReports = Object.freeze({
    all: Object.freeze(reports), render, setQuery, leave, reportByKey, visibleRows, canExport
  });
})(window);
