/* AquaFleet SPA coordinator for dashboard, resources and role-aware CRUD. */
(function initializeAquaFleetApp(global) {
  "use strict";

  const Api = global.AquaFleetApi;
  const Ui = global.AquaFleetUi;
  const Resources = global.AquaFleetResources;
  const Master = global.AquaFleetMasterData;
  const Reports = global.AquaFleetReports;
  const Workspace = global.AquaFleetWorkspace;
  const dashboardMetrics = [
    ["vessels", "Research Vessels"], ["vehicles", "AUV/ROV Vehicles"],
    ["expeditions", "Expeditions"], ["missions", "Missions"],
    ["samples", "Samples"], ["incidents", "Incidents"], ["battery-packs", "Battery Packs"],
    ["inspection-tasks", "Inspection Tasks"]
  ];

  const state = {
    currentView: "dashboard", currentResource: null, rows: [], loading: false,
    requestSequence: 0, health: "checking", databaseHealth: "checking",
    databaseName: null, mysqlVersion: null, lastRefreshed: null,
    /* One search query for the whole SPA. Every screen reads this same
       field, so there is no per-resource search implementation. */
    searchQuery: "",
    /* The dashboard's mission list, kept so the Mission Activity panel can
       be re-filtered on keystroke without another API call. KPI cards are
       computed from this same full list and never from the filtered view. */
    missions: [], missionsAvailable: true
  };

  /* =====================================================================
     Search: one normalizer, one value extractor, one matcher, one filter.
     Filtering is entirely client-side over rows already fetched - typing
     never issues a request.
     ===================================================================== */

  function normalizeText(value) {
    return String(value === null || value === undefined ? "" : value)
      .trim().toLowerCase();
  }

  /* Collect the strings a row should be searchable by.

     Only CONFIGURED fields are read - keys, table columns and detail
     fields - so search never wanders into prototype properties or
     stringifies an object blindly. Dates and datetimes contribute both the
     raw API value and the displayed form, so "2026-01" matches the stored
     value while "15/01" matches what the table shows. */
  function searchableValues(config, row) {
    if (!row || typeof row !== "object") return [];

    const fields = new Map();
    (config.keys || []).forEach(function addKey(field) {
      if (!fields.has(field)) fields.set(field, { field: field, type: "text" });
    });
    (config.columns || []).concat(config.details || []).forEach(function addField(descriptor) {
      if (descriptor && descriptor.field && !fields.has(descriptor.field)) {
        fields.set(descriptor.field, descriptor);
      }
    });

    const values = [];
    fields.forEach(function collect(descriptor, field) {
      const raw = row[field];
      if (raw === null || raw === undefined || raw === "") return;

      if (Array.isArray(raw)) {
        /* Operator contact numbers and any other list field. */
        raw.forEach(function addItem(item) {
          if (item !== null && item !== undefined && item !== "") values.push(String(item));
        });
        return;
      }
      if (typeof raw === "object") return;

      values.push(String(raw));
      if (descriptor.type === "date") values.push(Ui.formatDate(raw));
      else if (descriptor.type === "datetime") values.push(Ui.formatDateTime(raw));
    });
    return values;
  }

  function rowMatches(config, row, normalizedQuery) {
    if (!normalizedQuery) return true;
    return searchableValues(config, row).some(function contains(value) {
      return value.toLowerCase().includes(normalizedQuery);
    });
  }

  /* Returns a NEW array. state.rows is never sorted or spliced in place, so
     the stored data and the API count remain authoritative. */
  function filterRows(config, rows, query) {
    const normalized = normalizeText(query);
    if (!normalized) return rows;
    return rows.filter(function keep(row) { return rowMatches(config, row, normalized); });
  }

  function searchInput() { return document.getElementById("global-search"); }
  function searchClearButton() { return document.getElementById("search-clear"); }

  function setSearchPlaceholder(text) {
    const input = searchInput();
    if (input) input.setAttribute("placeholder", text);
  }

  function syncClearButton() {
    const button = searchClearButton();
    if (!button) return;
    if (state.searchQuery) button.removeAttribute("hidden");
    else button.setAttribute("hidden", "hidden");
  }

  /* Clears the query AND the visible input. Used by navigation, by the
     clear control, by Escape, and by auth.js on logout. */
  function clearSearch(rerender) {
    state.searchQuery = "";
    const input = searchInput();
    if (input) input.value = "";
    syncClearButton();
    if (rerender) reapplySearch();
  }

  /* Re-render the current screen from data already in state. Never fetches. */
  function reapplySearch() {
    if (state.currentView === "dashboard") { renderMissionActivity(); return; }
    if (state.currentView === "reports") { Reports.setQuery(state.searchQuery); return; }
    if (Workspace.has(state.currentView)) { Workspace.setQuery(state.searchQuery); return; }
    if (state.currentView === "vessels") {
      if (!state.loading) { vesselState.page = 1; renderVesselWorkspace(); }
      return;
    }
    const config = Resources.byKey[state.currentResource];
    if (config && !state.loading) renderTable(config, state.rows, state.totalCount);
  }

  /* A "nothing matched" panel that is clearly different from the
     database-is-empty panel, plus a way back out. */
  function renderNoMatches(container, noun) {
    /* Built by hand rather than through Ui.renderEmpty, because that helper
       clears its container - which would delete the "0 of 7 records" line
       appended just above. The panel is appended instead, so the count and
       the explanation are visible together. */
    const panel = Ui.element("div", {
      className: "state-panel empty-state", attributes: { role: "region" }
    });
    panel.appendChild(Ui.element("h2", { className: "h5 mb-2", text: "No matches" }));
    panel.appendChild(Ui.element("p", {
      className: "text-secondary mb-0",
      text: "No " + noun + " match “" + state.searchQuery + "”."
    }));
    const clear = Ui.element("button", {
      className: "btn btn-outline-primary btn-sm mt-3", text: "Clear Search",
      attributes: { type: "button" }
    });
    clear.addEventListener("click", function onClear() {
      clearSearch(true);
      const input = searchInput();
      if (input) input.focus();
    });
    panel.appendChild(clear);
    container.appendChild(panel);
    container.setAttribute("aria-busy", "false");
    return panel;
  }

  function formatValue(value, descriptor) {
    if (descriptor.type === "badge") return Ui.statusBadge(value, descriptor.category);
    let text;
    if (descriptor.type === "date") text = Ui.formatDate(value);
    else if (descriptor.type === "datetime") text = Ui.formatDateTime(value);
    else if (descriptor.type === "number") text = Ui.formatNumber(value);
    else text = Ui.nullableText(value);
    return Ui.element("span", { text: text });
  }

  function setHealthIndicator(mode) {
    const indicator = document.getElementById("health-indicator");
    indicator.className = "health-indicator health-" + mode;
    document.getElementById("health-indicator-text").textContent =
      ({ checking: "Checking", connected: "Connected", degraded: "Degraded", offline: "Offline" })[mode] || "Unknown";
  }

  function healthSummary() {
    if (state.health === "offline") return "offline";
    if (state.health === "ok" && state.databaseHealth === "ok") return "connected";
    if (state.health === "checking" || state.databaseHealth === "checking") return "checking";
    return "degraded";
  }

  function updateActiveNavigation(view) {
    document.querySelectorAll("[data-view]").forEach(function update(link) {
      const active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    /* A group button (e.g. Master Data) is active while a page inside its
       flyout is showing. */
    document.querySelectorAll("[data-nav-group]").forEach(function group(button) {
      const menu = button.closest(".nav-group");
      button.classList.toggle("active", Boolean(menu && menu.querySelector('[data-view="' + view + '"]')));
    });
  }

  function closeMobileNavigation() {
    const node = document.getElementById("primary-navigation");
    if (global.innerWidth < 992 && node.classList.contains("show")) {
      bootstrap.Collapse.getOrCreateInstance(node, { toggle: false }).hide();
    }
  }

  function setActions(button) {
    const actions = document.getElementById("page-actions");
    Ui.clearElement(actions);
    if (button) actions.appendChild(button);
  }

  function countBy(rows, field, value) {
    return rows.filter(function match(row) { return String(row[field] || "").toLowerCase() === String(value).toLowerCase(); }).length;
  }

  function animateNumber(node, value) {
    if (!Number.isInteger(value) || global.matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = value; return; }
    const start = performance.now();
    function frame(now) { const progress = Math.min(1, (now - start) / 520); node.textContent = Math.round(value * (1 - Math.pow(1 - progress, 3))); if (progress < 1) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }

  function summaryCard(label, value, note, tone) {
    const card = Ui.element("article", { className: "rail-card rail-" + (tone || "blue") });
    card.appendChild(Ui.element("p", { className: "rail-label", text: label }));
    const number = Ui.element("strong", { className: "rail-value", text: "0" }); card.appendChild(number);
    card.appendChild(Ui.element("p", { className: "rail-note", text: note }));
    card.appendChild(Ui.element("div", { className: "rail-progress", children: [Ui.element("span", { attributes: { style: "width:" + Math.min(100, Math.max(12, Number(value) * 9)) + "%" } })] }));
    animateNumber(number, Number(value)); return card;
  }

  function renderContextRail(title, rows) {
    const rail = document.getElementById("context-rail"); Ui.clearElement(rail);
    rail.appendChild(Ui.element("div", { className: "rail-heading", children: [Ui.element("p", { text: "Live context" }), Ui.element("h2", { text: title })] }));
    if (!rows) return;
    rail.appendChild(summaryCard("Records loaded", rows.length, "Current list", "blue"));
    const statusField = ["status", "health_status", "risk_level", "severity", "priority"].find(function find(field) { return rows.some(function some(row) { return row[field] != null; }); });
    if (statusField) {
      const totals = {}; rows.forEach(function each(row) { const key = row[statusField] || "Unknown"; totals[key] = (totals[key] || 0) + 1; });
      const card = Ui.element("article", { className: "rail-card" }); card.appendChild(Ui.element("p", { className: "rail-label", text: statusField.replaceAll("_", " ") }));
      Object.entries(totals).slice(0, 5).forEach(function entry(item) { card.appendChild(Ui.element("div", { className: "rail-stat-row", children: [Ui.element("span", { text: item[0] }), Ui.element("strong", { text: item[1] })] })); }); rail.appendChild(card);
    } else rail.appendChild(Ui.element("article", { className: "rail-card rail-guidance", children: [Ui.element("p", { className: "rail-label", text: "Resource guidance" }), Ui.element("p", { text: "Select View for the complete record. Table values remain sourced from the live API." })] }));
    rail.appendChild(Ui.element("article", { className: "rail-card connection-card", children: [Ui.element("span", { className: "health-dot", attributes: { "aria-hidden": "true" } }), Ui.element("div", { children: [Ui.element("strong", { text: healthSummary() === "connected" ? "Database connected" : "Connection degraded" }), Ui.element("small", { text: state.databaseName || "AquaFleet API" })] })] }));
  }

  function setResourceActions(config, refresh) {
    const actions = document.getElementById("page-actions"); Ui.clearElement(actions);
    if (Master.can(config.key, "create")) {
      const add = Ui.element("button", {className:"btn btn-primary btn-sm primary-action",text:"Add "+config.form.label,attributes:{type:"button"}});
      add.addEventListener("click",()=>Master.openCreate(config.key)); actions.appendChild(add);
    }
    actions.appendChild(refresh);
  }

  function makeRefreshButton(label, handler) {
    const button = Ui.element("button", {
      className: "btn btn-outline-primary btn-sm refresh-button", text: label,
      attributes: { type: "button" }
    });
    button.addEventListener("click", function refresh() { handler(button); });
    return button;
  }

  async function loadHealth() {
    state.health = "checking"; state.databaseHealth = "checking";
    setHealthIndicator("checking");
    const results = await Promise.allSettled([Api.get("/api/health"), Api.get("/api/health/database")]);
    state.health = results[0].status === "fulfilled" && results[0].value.payload.success !== false ? "ok" : "offline";
    state.databaseHealth = results[1].status === "fulfilled" && results[1].value.payload.success !== false ? "ok" : "error";
    if (results[1].status === "fulfilled") {
      state.databaseName = results[1].value.payload.database || null;
      state.mysqlVersion = results[1].value.payload.mysql_version || null;
    } else { state.databaseName = null; state.mysqlVersion = null; }
    setHealthIndicator(healthSummary());
  }

  function dashboardRows(results, key) {
    const result = results[key];
    return result && result.status === "fulfilled" && Array.isArray(result.value.data)
      ? result.value.data : null;
  }

  function dashboardCount(rows, predicate) {
    return rows === null ? null : (predicate ? rows.filter(predicate).length : rows.length);
  }

  function dashboardMetric(label, value, note, icon, ratio) {
    const card = Ui.element("article", { className: "dashboard-kpi" + (value === null ? " dashboard-unavailable" : "") });
    card.appendChild(Ui.element("span", { className: "dashboard-kpi-icon", text: icon, attributes: { "aria-hidden": "true" } }));
    const copy = Ui.element("div", { className: "dashboard-kpi-copy" });
    copy.appendChild(Ui.element("p", { className: "dashboard-kpi-label", text: label }));
    const number = Ui.element("strong", { className: "dashboard-kpi-value", text: value === null ? "Unavailable" : "0" });
    copy.appendChild(number);
    copy.appendChild(Ui.element("p", { className: "dashboard-kpi-note", text: value === null ? "Data could not be loaded" : note }));
    copy.appendChild(Ui.element("div", { className: "dashboard-kpi-track", children: [
      Ui.element("span", { attributes: { style: "--progress:" + (ratio === null ? 0 : Math.round(ratio * 100)) + "%" } })
    ] }));
    card.appendChild(copy);
    if (value !== null) animateNumber(number, value);
    return card;
  }

  function dashboardHeading(title, meta) {
    return Ui.element("div", { className: "dashboard-panel-heading", children: [
      Ui.element("h2", { text: title }),
      Ui.element("span", { className: "dashboard-panel-meta", text: meta })
    ] });
  }

  function dashboardUnavailable(message) {
    return Ui.element("p", { className: "dashboard-empty", text: message || "Data unavailable. Refresh to try again." });
  }

  function dashboardBadge(value, category) {
    return Ui.element("span", { className: "dashboard-badge dashboard-badge-" + category + "-" + String(value || "unknown").toLowerCase().replace(/\s+/g, "-"), text: value || "Unknown" });
  }

  function healthDetail(label, value) {
    const item = Ui.element("div", { className: "health-detail" });
    item.appendChild(Ui.element("dt", { text: label }));
    item.appendChild(Ui.element("dd", { text: Ui.nullableText(value) }));
    return item;
  }

  /* Search replaces this panel only; counts always use the complete API response. */
  function buildMissionActivity() {
    const all = state.missions;
    const rows = filterRows(Resources.byKey.missions, all, state.searchQuery);
    const filtering = Boolean(normalizeText(state.searchQuery));
    const activity = Ui.element("section", { className: "dashboard-panel dashboard-operations activity-panel" });
    activity.appendChild(dashboardHeading("Active Operations",
      state.missionsAvailable ? (filtering ? rows.length + " of " + all.length + " missions" : all.length + " missions") : "Unavailable"));
    const list = Ui.element("div", { className: "dashboard-mission-list" });
    if (!state.missionsAvailable) list.appendChild(dashboardUnavailable("Mission data unavailable. Refresh to try again."));
    else if (!all.length) list.appendChild(Ui.element("p", { className: "dashboard-empty", text: "No missions recorded." }));
    else if (!rows.length) {
      const empty = Ui.element("div", { className: "activity-no-match" });
      empty.appendChild(Ui.element("p", { text: "No missions match “" + state.searchQuery + "”." }));
      const clear = Ui.element("button", { className: "btn btn-outline-primary btn-sm", text: "Clear Search", attributes: { type: "button" } });
      clear.addEventListener("click", function () { clearSearch(true); searchInput().focus(); });
      empty.appendChild(clear); list.appendChild(empty);
    } else {
      rows.forEach(function mission(row, index) {
        const view = Ui.element("button", { className: "activity-action", text: "View",
          attributes: { type: "button", "aria-label": "View mission " + row.mission_id } });
        view.addEventListener("click", function () { showDetails(Resources.byKey.missions, row); });
        const item = Ui.element("div", { className: "dashboard-mission-row" + (row.status === "In Progress" ? " dashboard-mission-active" : "") });
        item.appendChild(Ui.element("span", { className: "dashboard-mission-index", text: "#" + (index + 1) }));
        item.appendChild(Ui.element("div", { className: "dashboard-mission-name", children: [
          Ui.element("strong", { text: Ui.nullableText(row.mission_type) }),
          Ui.element("small", { text: Ui.nullableText(row.expedition_title, "Expedition unavailable") })
        ] }));
        item.appendChild(Ui.element("span", { className: "dashboard-mission-zone", text: Ui.nullableText(row.zone_name) }));
        item.appendChild(Ui.element("time", { className: "dashboard-mission-time", text: Ui.formatDateTime(row.start_time) }));
        item.appendChild(dashboardBadge(row.status, "mission"));
        item.appendChild(view); list.appendChild(item);
      });
    }
    activity.appendChild(list);
    return activity;
  }

  function renderMissionActivity() {
    const existing = document.querySelector(".activity-panel");
    if (existing && existing.parentNode) existing.parentNode.replaceChild(buildMissionActivity(), existing);
  }

  function buildFleetPanel(vehicles) {
    const fleet = Ui.element("section", { className: "dashboard-panel dashboard-fleet" });
    fleet.appendChild(dashboardHeading("Fleet Availability", vehicles === null ? "Unavailable" :
      Math.min(3, vehicles.length) + " of " + vehicles.length + " vehicles shown"));
    if (vehicles === null) { fleet.appendChild(dashboardUnavailable("Vehicle data unavailable.")); return fleet; }
    const total = vehicles.length;
    const statuses = [["Available", "#64b8d5"], ["Deployed", "#4988ba"], ["Maintenance", "#cba56c"], ["Retired", "#becbd3"]];
    const counts = statuses.map(function (entry) { return countBy(vehicles, "status", entry[0]); });
    const percent = total ? Math.round(counts[0] / total * 100) : 0;
    let offset = 0;
    const stops = statuses.map(function (entry, index) {
      const start = offset; offset += total ? counts[index] / total * 100 : 0;
      return entry[1] + " " + start + "% " + offset + "%";
    }).join(", ");
    const visual = Ui.element("div", { className: "dashboard-fleet-visual" });
    const ring = Ui.element("div", { className: "dashboard-donut", attributes: {
      style: "--donut-colors:" + (total ? "conic-gradient(" + stops + ")" : "conic-gradient(#e3ebef 0 100%)"),
      "aria-label": percent + "% of vehicles available"
    }, children: [Ui.element("div", { children: [
      Ui.element("strong", { text: percent + "%" }), Ui.element("small", { text: "available" })
    ] })] });
    visual.appendChild(ring);
    const distribution = Ui.element("div", { className: "dashboard-distribution" });
    const segments = Ui.element("div", { className: "dashboard-segments", attributes: { "aria-hidden": "true" } });
    statuses.forEach(function (entry, index) {
      if (counts[index]) segments.appendChild(Ui.element("span", { attributes: {
        style: "width:" + (counts[index] / total * 100) + "%;background:" + entry[1]
      } }));
    });
    distribution.appendChild(segments);
    const legend = Ui.element("div", { className: "dashboard-fleet-legend" });
    statuses.forEach(function (entry, index) {
      legend.appendChild(Ui.element("div", { children: [
        Ui.element("i", { attributes: { style: "background:" + entry[1], "aria-hidden": "true" } }),
        Ui.element("span", { text: entry[0] }), Ui.element("b", { text: counts[index] })
      ] }));
    });
    distribution.appendChild(legend); visual.appendChild(distribution); fleet.appendChild(visual);
    const roster = Ui.element("div", { className: "dashboard-vehicle-list" });
    vehicles.slice(0, 3).forEach(function (row) {
      roster.appendChild(Ui.element("div", { className: "dashboard-vehicle-row", children: [
        Ui.element("div", { children: [
          Ui.element("strong", { text: Ui.nullableText(row.vehicle_name) }),
          Ui.element("small", { text: [row.vehicle_type, row.model].filter(Boolean).join(" · ") || "Vehicle" })
        ] }), dashboardBadge(row.status, "vehicle")
      ] }));
    });
    if (!total) roster.appendChild(Ui.element("p", { className: "dashboard-empty", text: "No vehicles recorded." }));
    fleet.appendChild(roster); return fleet;
  }

  function buildExpeditionPanel(expeditions) {
    const panel = Ui.element("section", { className: "dashboard-panel dashboard-expeditions" });
    panel.appendChild(dashboardHeading("Expedition Programme", "Active and planned"));
    if (expeditions === null) { panel.appendChild(dashboardUnavailable("Expedition data unavailable.")); return panel; }
    const list = Ui.element("div", { className: "dashboard-expedition-list" });
    const current = expeditions.filter(function (row) { return row.status === "Active" || row.status === "Planned"; });
    current.forEach(function (row) {
      const item = Ui.element("div", { className: "dashboard-expedition-row" });
      item.appendChild(Ui.element("div", { className: "dashboard-expedition-name", children: [
        Ui.element("strong", { text: Ui.nullableText(row.title) }),
        Ui.element("small", { text: Ui.nullableText(row.vessel_name, "Vessel unavailable") })
      ] }));
      const timeline = Ui.element("div", { className: "dashboard-timeline" });
      timeline.appendChild(Ui.element("div", { className: "dashboard-timeline-line", attributes: { "aria-hidden": "true" } }));
      timeline.appendChild(Ui.element("div", { className: "dashboard-timeline-dates", children: [
        Ui.element("time", { text: Ui.formatDate(row.start_date) }),
        Ui.element("time", { text: Ui.formatDate(row.end_date) })
      ] }));
      item.appendChild(timeline);
      item.appendChild(Ui.element("span", { className: "dashboard-expedition-count", text:
        row.mission_count == null ? "— missions" : row.mission_count + " missions" }));
      item.appendChild(dashboardBadge(row.status, "expedition"));
      list.appendChild(item);
    });
    if (!current.length) list.appendChild(Ui.element("p", { className: "dashboard-empty", text: "No active or planned expeditions." }));
    panel.appendChild(list); return panel;
  }

  function buildAttentionPanel(data) {
    const panel = Ui.element("section", { className: "dashboard-panel dashboard-attention" });
    panel.appendChild(dashboardHeading("Operational Attention", "Recorded conditions"));
    const groups = [
      ["High / critical incidents", "Recorded incident severity", "!", data.incidents, row => ["high", "critical"].includes(normalizeText(row.severity)), "incident"],
      ["Pending / active inspections", "Inspection workflow", "✓", data["inspection-tasks"], row => ["pending", "in progress"].includes(normalizeText(row.status)), "inspection"],
      ["Vehicles in maintenance", "Current vehicle status", "⚙", data.vehicles, row => normalizeText(row.status) === "maintenance", "maintenance"],
      ["Battery condition review", "Fair, poor or replace", "▣", data["battery-packs"], row => ["fair", "poor", "replace"].includes(normalizeText(row.health_status)), "battery"]
    ];
    const list = Ui.element("div", { className: "dashboard-attention-list" });
    groups.forEach(function (group) {
      const value = dashboardCount(group[3], group[4]);
      list.appendChild(Ui.element("div", { className: "dashboard-attention-row dashboard-attention-" + group[5], children: [
        Ui.element("span", { className: "dashboard-attention-icon", text: group[2], attributes: { "aria-hidden": "true" } }),
        Ui.element("div", { children: [Ui.element("strong", { text: group[0] }), Ui.element("small", { text: group[1] })] }),
        Ui.element("b", { text: value === null ? "—" : value, attributes: { "aria-label": value === null ? group[0] + " unavailable" : group[0] + ": " + value } })
      ] }));
    });
    panel.appendChild(list);
    const summary = Ui.element("div", { className: "dashboard-system-summary" });
    const health = healthSummary();
    summary.appendChild(Ui.element("span", { className: "dashboard-db dashboard-db-" + health,
      text: health === "connected" ? "Database connected" : state.databaseHealth === "error" || health === "offline" ? "Database unavailable" : "Database degraded" }));
    summary.appendChild(Ui.element("span", { className: "dashboard-db-name", text: state.databaseName || "AquaFleet database" }));
    summary.appendChild(Ui.element("span", { text: "Recorded Incidents  " + (data.incidents === null ? "Unavailable" : data.incidents.length) }));
    summary.appendChild(Ui.element("span", { text: "Scientific Samples  " + (data.samples === null ? "Unavailable" : data.samples.length) }));
    panel.appendChild(summary); return panel;
  }

  async function renderDashboard(button) {
    const sequence = ++state.requestSequence;
    state.currentView = "dashboard"; state.currentResource = null; state.rows = []; state.loading = true;
    document.body.classList.add("af-auth-shell", "dashboard-view");
    document.body.classList.remove("vessels-view"); setEyebrow();
    const search = searchInput(); if (search) search.disabled = false;
    Ui.setPageHeader("Dashboard", "Fleet, mission and expedition readiness from the current AquaFleet database state.");
    setSearchPlaceholder("Search missions");
    Ui.clearAlerts(); updateActiveNavigation("dashboard");
    const refresh = makeRefreshButton("Refresh Dashboard", renderDashboard);
    setActions(refresh);
    const refreshed = Ui.element("div", { className: "dashboard-refresh-meta", children: [
      Ui.element("span", { text: "LAST REFRESHED" }),
      Ui.element("strong", { className: "dashboard-refreshed", text: state.lastRefreshed ? state.lastRefreshed.toLocaleTimeString() : "—" })
    ] });
    document.getElementById("page-actions").prepend(refreshed);
    Ui.setButtonPending(refresh, true, "Refreshing…");
    Ui.renderLoading(document.getElementById("content-panel"), "Loading AquaFleet operations…");
    const work = [loadHealth()].concat(dashboardMetrics.map(function (item) { return Api.get(Resources.byKey[item[0]].path); }));
    const results = await Promise.allSettled(work);
    if (sequence !== state.requestSequence || state.currentView !== "dashboard") return;
    state.loading = false; state.lastRefreshed = new Date();
    const data = {};
    dashboardMetrics.forEach(function (item, index) { data[item[0]] = dashboardRows(results, index + 1); });
    state.missionsAvailable = data.missions !== null;
    state.missions = data.missions || [];
    const panel = document.getElementById("content-panel");
    Ui.clearElement(panel); panel.setAttribute("aria-busy", "false");
    const stamp = document.querySelector(".dashboard-refreshed");
    if (stamp) stamp.textContent = state.lastRefreshed.toLocaleTimeString();
    const kpis = Ui.element("div", { className: "dashboard-kpis" });
    const ratio = function (count, total) { return count === null || total === null ? null : total ? count / total : 0; };
    const vesselCount = dashboardCount(data.vessels);
    const expeditionCount = dashboardCount(data.expeditions, row => normalizeText(row.status) === "active");
    const missionCount = dashboardCount(data.missions, row => normalizeText(row.status) === "in progress");
    const vehicleCount = dashboardCount(data.vehicles, row => normalizeText(row.status) === "available");
    kpis.appendChild(dashboardMetric("Research Vessels", vesselCount, "Registered fleet platforms", "⚓", vesselCount === null ? null : 1));
    kpis.appendChild(dashboardMetric("Active Expeditions", expeditionCount,
      expeditionCount + " of " + data.expeditions?.length + " programmes active", "✧", ratio(expeditionCount, data.expeditions?.length ?? null)));
    kpis.appendChild(dashboardMetric("Active Missions", missionCount,
      missionCount + " of " + data.missions?.length + " missions in progress", "◎", ratio(missionCount, data.missions?.length ?? null)));
    kpis.appendChild(dashboardMetric("Available Vehicles", vehicleCount,
      "of " + data.vehicles?.length + " vehicles", "▣", ratio(vehicleCount, data.vehicles?.length ?? null)));
    const grid = Ui.element("div", { className: "dashboard-grid", children: [
      buildMissionActivity(), buildFleetPanel(data.vehicles),
      buildExpeditionPanel(data.expeditions), buildAttentionPanel(data)
    ] });
    panel.append(kpis, grid);
    Ui.clearElement(document.getElementById("context-rail"));
    Ui.setButtonPending(refresh, false);
  }

  /* =====================================================================
     Research Vessels workspace (approved Vessels design).
     Data comes from the existing /api/vessels and /api/expeditions routes;
     deployment status, KPIs and the detail panel are all derived from those
     two responses. Search reuses the shared header field and filterRows().
     ===================================================================== */

  const VESSEL_PAGE_SIZE = 8;
  const VESSEL_FILTERS = [["all", "All"], ["at-sea", "At Sea"], ["in-port", "In Port"], ["unassigned", "Unassigned"]];
  const vesselState = { rows: [], expeditions: null, selectedId: null, filter: "all", page: 1 };

  function resetVesselState() {
    vesselState.rows = []; vesselState.expeditions = null;
    vesselState.selectedId = null; vesselState.filter = "all"; vesselState.page = 1;
  }

  function setEyebrow(text) {
    const node = document.querySelector(".page-eyebrow");
    if (node) node.textContent = text || "AquaFleet Command";
  }

  function vesselExpeditions(vesselId) {
    if (vesselState.expeditions === null) return null;
    return vesselState.expeditions.filter(function match(row) { return Number(row.vessel_id) === Number(vesselId); });
  }

  /* Deployment is derived, never stored: an Active expedition means At Sea,
     a Planned one means Scheduled, past-only history means In Port and no
     expedition at all means Unassigned. */
  function vesselDeployment(vessel) {
    const list = vesselExpeditions(vessel.vessel_id);
    if (list === null) return { label: "Unknown", group: null, tone: "unknown" };
    if (list.some(function active(row) { return normalizeText(row.status) === "active"; })) return { label: "At Sea", group: "at-sea", tone: "sea" };
    if (list.some(function planned(row) { return normalizeText(row.status) === "planned"; })) return { label: "Scheduled", group: "in-port", tone: "scheduled" };
    if (list.length) return { label: "In Port", group: "in-port", tone: "port" };
    return { label: "Unassigned", group: "unassigned", tone: "unassigned" };
  }

  function vesselIsDeepSea(vessel) { return /ocean|deep[\s-]?sea/i.test(String(vessel.vessel_type || "")); }
  function vesselPad(id) { return String(id).padStart(2, "0"); }

  function visibleVessels() {
    const config = Resources.byKey.vessels;
    return filterRows(config, vesselState.rows, state.searchQuery).filter(function inFilter(row) {
      return vesselState.filter === "all" || vesselDeployment(row).group === vesselState.filter;
    });
  }

  function vesselSelected() {
    return vesselState.rows.find(function find(row) { return row.vessel_id === vesselState.selectedId; }) || null;
  }

  function selectVessel(id, scrollDetail) {
    vesselState.selectedId = id;
    renderVesselWorkspace();
    if (scrollDetail && global.innerWidth < 1100) {
      const detail = document.querySelector(".vessel-detail");
      if (detail) detail.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function vesselPill(deployment) {
    return Ui.element("span", { className: "vessel-pill vessel-pill-" + deployment.tone, text: deployment.label });
  }

  function vesselLink(label, tone, handler, aria) {
    const button = Ui.element("button", { className: "vessel-link vessel-link-" + tone, text: label, attributes: { type: "button", "aria-label": aria } });
    button.addEventListener("click", function onClick(event) { event.stopPropagation(); handler(); });
    return button;
  }

  function buildVesselRegister(visible) {
    const total = vesselState.rows.length;
    const panel = Ui.element("section", { className: "dashboard-panel vessel-panel vessel-register" });
    const tabs = Ui.element("div", { className: "vessel-tabs", attributes: { role: "group", "aria-label": "Filter vessels by deployment" } });
    VESSEL_FILTERS.forEach(function tab(entry) {
      const button = Ui.element("button", {
        className: "vessel-tab" + (vesselState.filter === entry[0] ? " active" : ""), text: entry[1],
        attributes: { type: "button", "aria-pressed": String(vesselState.filter === entry[0]) }
      });
      button.addEventListener("click", function onTab() {
        vesselState.filter = entry[0]; vesselState.page = 1;
        const next = visibleVessels();
        if (next.length && !next.some(function has(row) { return row.vessel_id === vesselState.selectedId; })) vesselState.selectedId = next[0].vessel_id;
        renderVesselWorkspace();
      });
      tabs.appendChild(button);
    });
    panel.appendChild(Ui.element("div", { className: "vessel-register-head", children: [
      Ui.element("h2", { text: "Vessel Register" }), tabs,
      Ui.element("span", { className: "dashboard-panel-meta", attributes: { role: "status", "aria-live": "polite" }, text: visible.length + " of " + total + " shown" })
    ] }));

    const scroll = Ui.element("div", { className: "vessel-table-scroll" });
    if (!total) {
      scroll.appendChild(Ui.element("p", { className: "dashboard-empty", text: "No research vessels recorded." }));
    } else if (!visible.length) {
      const empty = Ui.element("div", { className: "activity-no-match" });
      empty.appendChild(Ui.element("p", { text: normalizeText(state.searchQuery)
        ? "No vessels match “" + state.searchQuery + "”." : "No vessels in this deployment group." }));
      const clear = Ui.element("button", { className: "btn btn-outline-primary btn-sm", text: normalizeText(state.searchQuery) ? "Clear Search" : "Show All", attributes: { type: "button" } });
      clear.addEventListener("click", function onClear() {
        vesselState.filter = "all"; vesselState.page = 1; clearSearch(false); renderVesselWorkspace();
        const input = searchInput(); if (input) input.focus();
      });
      empty.appendChild(clear); scroll.appendChild(empty);
    } else {
      const pages = Math.max(1, Math.ceil(visible.length / VESSEL_PAGE_SIZE));
      vesselState.page = Math.min(Math.max(1, vesselState.page), pages);
      const start = (vesselState.page - 1) * VESSEL_PAGE_SIZE;
      const pageRows = visible.slice(start, start + VESSEL_PAGE_SIZE);
      const table = Ui.element("table", { className: "vessel-table" });
      table.appendChild(Ui.element("caption", { className: "visually-hidden", text: "Research vessels" }));
      const headRow = Ui.element("tr");
      [["ID", ""], ["Vessel", ""], ["Home Port", ""], ["Capacity", "num"], ["Deployment", ""], ["Actions", "act"]].forEach(function heading(entry) {
        headRow.appendChild(Ui.element("th", { className: entry[1], text: entry[0], attributes: { scope: "col" } }));
      });
      table.appendChild(Ui.element("thead", { children: [headRow] }));
      const body = Ui.element("tbody");
      pageRows.forEach(function vessel(row) {
        const selected = row.vessel_id === vesselState.selectedId;
        const tr = Ui.element("tr", { className: selected ? "selected" : "", attributes: { tabindex: "0", "aria-selected": String(selected) } });
        tr.addEventListener("click", function onRow() { selectVessel(row.vessel_id, false); });
        tr.addEventListener("keydown", function onKey(event) {
          if ((event.key === "Enter" || event.key === " ") && event.target === tr) { event.preventDefault(); selectVessel(row.vessel_id, false); }
        });
        tr.appendChild(Ui.element("td", { className: "vessel-id", text: vesselPad(row.vessel_id) }));
        tr.appendChild(Ui.element("td", { children: [Ui.element("div", { className: "vessel-name", children: [
          Ui.element("strong", { text: Ui.nullableText(row.vessel_name) }), Ui.element("small", { text: Ui.nullableText(row.vessel_type) })
        ] })] }));
        tr.appendChild(Ui.element("td", { className: "vessel-port", text: Ui.nullableText(row.home_port) }));
        tr.appendChild(Ui.element("td", { className: "num", text: Ui.formatNumber(row.capacity) }));
        tr.appendChild(Ui.element("td", { children: [vesselPill(vesselDeployment(row))] }));
        const actions = Ui.element("td", { className: "act" });
        const label = Master.label("vessels", row);
        actions.appendChild(vesselLink("View", "view", function view() { selectVessel(row.vessel_id, true); }, "View " + label));
        if (Master.can("vessels", "update")) actions.appendChild(vesselLink("Edit", "edit", function edit() { Master.openEdit("vessels", row); }, "Edit " + label));
        if (Master.can("vessels", "delete")) actions.appendChild(vesselLink("Delete", "delete", function del() { Master.openDelete("vessels", row); }, "Delete " + label));
        tr.appendChild(actions); body.appendChild(tr);
      });
      table.appendChild(body); scroll.appendChild(table);
      panel.appendChild(scroll);

      const pager = Ui.element("nav", { className: "vessel-pager", attributes: { "aria-label": "Vessel pages" } });
      const step = function stepButton(text, label, target, disabled, current) {
        const button = Ui.element("button", { className: "vessel-page-button" + (current ? " current" : ""), text: text, attributes: { type: "button", "aria-label": label } });
        if (current) button.setAttribute("aria-current", "page");
        button.disabled = disabled;
        button.addEventListener("click", function onPage() { vesselState.page = target; renderVesselWorkspace(); });
        return button;
      };
      const controls = Ui.element("div", { className: "vessel-page-controls" });
      controls.appendChild(step("‹", "Previous page", vesselState.page - 1, vesselState.page <= 1, false));
      for (let page = 1; page <= pages; page += 1) controls.appendChild(step(String(page), "Page " + page, page, false, page === vesselState.page));
      controls.appendChild(step("›", "Next page", vesselState.page + 1, vesselState.page >= pages, false));
      pager.append(Ui.element("span", { className: "dashboard-panel-meta", text:
        "Showing " + (start + 1) + "–" + (start + pageRows.length) + " of " + visible.length + " records" }), controls);
      panel.appendChild(pager);
      return panel;
    }
    panel.appendChild(scroll);
    return panel;
  }

  function buildVesselDetail(vessel) {
    const panel = Ui.element("aside", { className: "dashboard-panel vessel-panel vessel-detail", attributes: { "aria-label": "Vessel detail" } });
    panel.appendChild(Ui.element("div", { className: "vessel-detail-head", children: [
      Ui.element("h2", { text: "Vessel Detail" }),
      Ui.element("span", { className: "dashboard-panel-meta", text: vessel ? "#" + vesselPad(vessel.vessel_id) : "" })
    ] }));
    if (!vessel) {
      panel.appendChild(Ui.element("p", { className: "dashboard-empty", text: "Select a vessel to see its details." }));
      return panel;
    }
    const expeditions = vesselExpeditions(vessel.vessel_id);
    panel.appendChild(Ui.element("h3", { className: "vessel-detail-name", text: Ui.nullableText(vessel.vessel_name) }));
    panel.appendChild(Ui.element("p", { className: "vessel-detail-type", text: Ui.nullableText(vessel.vessel_type) }));
    panel.appendChild(vesselPill(vesselDeployment(vessel)));
    const fact = function factCard(label, value, wide) {
      return Ui.element("div", { className: "vessel-fact" + (wide ? " vessel-fact-wide" : ""), children: [
        Ui.element("span", { text: label }), Ui.element("strong", { text: value })
      ] });
    };
    panel.appendChild(Ui.element("div", { className: "vessel-facts", children: [
      fact("Capacity", Ui.formatNumber(vessel.capacity)),
      fact("Expeditions", expeditions === null ? "—" : String(expeditions.length)),
      fact("Home Port", Ui.nullableText(vessel.home_port), true)
    ] }));
    panel.appendChild(Ui.element("p", { className: "vessel-section-label", text: "Linked Expeditions" }));
    const linked = Ui.element("div", { className: "vessel-linked" });
    if (expeditions === null) {
      linked.appendChild(Ui.element("p", { className: "dashboard-empty", text: "Expedition data unavailable." }));
    } else if (!expeditions.length) {
      linked.appendChild(Ui.element("div", { className: "vessel-linked-row", children: [Ui.element("div", { children: [
        Ui.element("strong", { text: "No expeditions assigned" }), Ui.element("small", { text: "Vessel is free for scheduling" })
      ] })] }));
    } else {
      expeditions.slice().sort(function newest(a, b) { return String(b.start_date).localeCompare(String(a.start_date)); }).forEach(function each(row) {
        linked.appendChild(Ui.element("div", { className: "vessel-linked-row", children: [
          Ui.element("div", { children: [
            Ui.element("strong", { text: Ui.nullableText(row.title), attributes: { title: Ui.nullableText(row.title) } }),
            Ui.element("small", { text: Ui.formatDate(row.start_date) + " – " + Ui.formatDate(row.end_date) })
          ] }), dashboardBadge(row.status, "expedition")
        ] }));
      });
    }
    panel.appendChild(linked);
    const actions = Ui.element("div", { className: "vessel-detail-actions" });
    if (Master.can("vessels", "update")) {
      const edit = Ui.element("button", { className: "vessel-edit-button", text: "Edit Vessel", attributes: { type: "button" } });
      edit.addEventListener("click", function onEdit() { Master.openEdit("vessels", vessel); });
      actions.appendChild(edit);
    }
    if (Master.can("vessels", "delete")) {
      const del = Ui.element("button", { className: "vessel-delete-button", text: "Delete", attributes: { type: "button" } });
      del.addEventListener("click", function onDelete() { Master.openDelete("vessels", vessel); });
      actions.appendChild(del);
    }
    if (actions.children.length) panel.appendChild(actions);
    panel.appendChild(Ui.element("p", { className: "vessel-note", text: "Vessels assigned to an expedition cannot be deleted." }));
    return panel;
  }

  /* Rebuilds only the register + detail panels from data already in memory.
     Search, filters, paging and selection never fetch and never re-run the
     KPI count-up. */
  function renderVesselWorkspace() {
    const grid = document.querySelector(".vessels-grid");
    if (!grid) return;
    const visible = visibleVessels();
    if (vesselState.selectedId === null || !vesselSelected()) {
      vesselState.selectedId = vesselState.rows.length ? vesselState.rows[0].vessel_id : null;
    }
    const previous = grid.querySelector(".vessel-table-scroll");
    const scrollTop = previous ? previous.scrollTop : 0;
    Ui.clearElement(grid);
    grid.append(buildVesselRegister(visible), buildVesselDetail(vesselSelected()));
    const next = grid.querySelector(".vessel-table-scroll");
    if (next) next.scrollTop = scrollTop;
  }

  function buildVesselKpis() {
    const rows = vesselState.rows, total = rows.length;
    const ports = new Set(rows.map(function port(row) { return normalizeText(row.home_port); }).filter(Boolean)).size;
    const capacities = rows.map(function cap(row) { return Number(row.capacity) || 0; });
    const capacity = capacities.reduce(function sum(a, b) { return a + b; }, 0);
    const mean = total ? Math.round(capacity / total) : 0;
    const largest = capacities.length ? Math.max.apply(null, capacities) : 0;
    const deep = rows.filter(vesselIsDeepSea).length;
    const committed = vesselState.expeditions === null ? null : rows.filter(function busy(row) {
      const tone = vesselDeployment(row).tone; return tone === "sea" || tone === "scheduled";
    }).length;
    const kpis = Ui.element("div", { className: "dashboard-kpis" });
    kpis.appendChild(dashboardMetric("Registered Vessels", total, "Across " + ports + " home " + (ports === 1 ? "port" : "ports"), "⚓", total ? 1 : 0));
    kpis.appendChild(dashboardMetric("Assigned to Expeditions", committed,
      committed + " of " + total + " vessels committed", "⌖", committed === null ? null : total ? committed / total : 0));
    kpis.appendChild(dashboardMetric("Total Berth Capacity", capacity, "Mean " + mean + " berths per vessel", "◫", largest ? mean / largest : 0));
    kpis.appendChild(dashboardMetric("Deep Sea Class", deep, "Ocean and deep-sea platforms", "▣", total ? deep / total : 0));
    return kpis;
  }

  async function renderVessels() {
    const config = Resources.byKey.vessels;
    const sequence = ++state.requestSequence;
    state.currentView = "vessels"; state.currentResource = "vessels"; state.rows = []; state.loading = true;
    document.body.classList.add("dashboard-view", "vessels-view");
    const search = searchInput(); if (search) search.disabled = false;
    Ui.setPageHeader("Research Vessels", "Registered fleet platforms, berth capacity and home-port assignment from the AquaFleet database.");
    setEyebrow("AquaFleet Command · Fleet");
    setSearchPlaceholder("Search vessels or ports");
    Ui.clearAlerts(); updateActiveNavigation("vessels");

    const meta = Ui.element("div", { className: "vessels-record-meta", children: [
      Ui.element("span", { text: "RECORDS" }), Ui.element("strong", { className: "vessels-record-count", text: "— VESSELS" })
    ] });
    const actions = document.getElementById("page-actions"); Ui.clearElement(actions);
    actions.appendChild(meta);
    /* Always present, as in the approved header. Creating is still governed by
       the existing RBAC check inside Master.openCreate, so a role without the
       permission gets a disabled control instead of a missing one. */
    const canCreate = Master.can("vessels", "create");
    const add = Ui.element("button", { className: "vessel-add-button", attributes: { type: "button" }, children: [
      Ui.element("span", { text: "+", attributes: { "aria-hidden": "true" } }), Ui.element("span", { text: "Add Vessel" })
    ] });
    if (canCreate) add.addEventListener("click", function onAdd() { Master.openCreate("vessels"); });
    else { add.disabled = true; add.title = "Your role cannot add vessels"; }
    actions.appendChild(add);
    const panel = document.getElementById("content-panel");
    Ui.renderLoading(panel, "Loading research vessels…");

    const results = await Promise.allSettled([Api.get(config.path), Api.get(Resources.byKey.expeditions.path)]);
    if (sequence !== state.requestSequence || state.currentResource !== "vessels") return;
    state.loading = false;
    if (results[0].status !== "fulfilled") {
      Ui.renderError(panel, "Unable to load " + config.title, normalizedError(results[0].reason));
      return;
    }
    vesselState.rows = Array.isArray(results[0].value.data) ? results[0].value.data : [];
    state.rows = vesselState.rows;
    state.totalCount = results[0].value.payload.count ?? vesselState.rows.length;
    vesselState.expeditions = results[1].status === "fulfilled" && Array.isArray(results[1].value.data) ? results[1].value.data : null;

    const count = meta.querySelector(".vessels-record-count");
    count.textContent = vesselState.rows.length + (vesselState.rows.length === 1 ? " VESSEL" : " VESSELS");
    Ui.clearElement(panel); panel.setAttribute("aria-busy", "false");
    Ui.clearElement(document.getElementById("context-rail"));
    panel.append(buildVesselKpis(), Ui.element("div", { className: "vessels-grid" }));
    renderVesselWorkspace();
  }

  function keyDisplay(config, row) {
    const container = Ui.element("div", { className: "composite-key" });
    config.keys.forEach(function addKey(field) {
      container.appendChild(Ui.element("span", { text: field + ": " + Ui.nullableText(row[field]) }));
    });
    return container;
  }

  function renderTable(config, allRows, count) {
    const panel = document.getElementById("content-panel"); Ui.clearElement(panel); panel.setAttribute("aria-busy", "false");
    const totalCount = count === undefined || count === null ? allRows.length : count;

    /* One filter pass, one renderer. `rows` below is a filtered VIEW; the
       stored allRows array is untouched, so View/Edit/Delete still hand the
       original row object to their handlers. */
    const rows = filterRows(config, allRows, state.searchQuery);
    const filtering = Boolean(normalizeText(state.searchQuery));

    const summary = Ui.element("div", { className: "resource-summary" });
    summary.appendChild(Ui.element("p", {
      className: "mb-0",
      /* Politely announced so a screen reader hears the count change
         without the assertive interruption the alert region would cause. */
      attributes: { role: "status", "aria-live": "polite" },
      text: filtering
        ? rows.length + " of " + totalCount + (totalCount === 1 ? " record" : " records")
        : totalCount + (totalCount === 1 ? " record" : " records")
    }));
    panel.appendChild(summary);

    /* The resource genuinely holds nothing. */
    if (!allRows.length) {
      Ui.renderEmpty(panel, "No " + config.title.toLowerCase(), "This resource currently contains no records.");
      return;
    }
    /* The resource holds rows but the query excluded them all - a different
       situation, so a different message and a way to recover. */
    if (!rows.length) {
      renderNoMatches(panel, config.title.toLowerCase());
      renderContextRail(config.title, allRows);
      return;
    }

    const wrapper = Ui.element("div", { className: "table-responsive resource-table-wrapper" });
    const table = Ui.element("table", { className: "table resource-table align-middle mb-0" });
    table.appendChild(Ui.element("caption", { className: "visually-hidden", text: config.title + " records" }));
    const head = Ui.element("thead"); const headRow = Ui.element("tr");
    config.columns.forEach(function heading(column) { headRow.appendChild(Ui.element("th", { text: column.label, attributes: { scope: "col" } })); });
    headRow.appendChild(Ui.element("th", { text: "Actions", attributes: { scope: "col" } })); head.appendChild(headRow); table.appendChild(head);
    const body = Ui.element("tbody");
    rows.forEach(function rowRenderer(row, index) {
      const tr = Ui.element("tr", { attributes: { tabindex: "0" } });
      config.columns.forEach(function cellRenderer(column) {
        const td = Ui.element("td"); const value = formatValue(row[column.field], column);
        if (column.truncate) value.classList.add("truncate-text"); td.appendChild(value); tr.appendChild(td);
      });
      const actions = Ui.element("td",{className:"row-actions"}); const view = Ui.element("button", {
        className: "btn btn-sm btn-outline-primary", text: "View",
        attributes: { type: "button", "aria-label": "View " + config.title + " record " + (index + 1) }
      });
      view.addEventListener("click", function openDetails() { showDetails(config, row); });
      actions.appendChild(view);
      if(Master.can(config.key,"update")||Master.can(config.key,"delete")){
        if(Master.can(config.key,"update")){
        const edit=Ui.element("button",{className:"btn btn-sm btn-outline-secondary",text:"Edit",attributes:{type:"button","aria-label":"Edit "+Master.label(config.key,row)}});
        edit.addEventListener("click",()=>Master.openEdit(config.key,row));actions.appendChild(edit);
        }
        if(Master.can(config.key,"delete")){
          const del=Ui.element("button",{className:"btn btn-sm btn-outline-danger",text:"Delete",attributes:{type:"button","aria-label":"Delete "+Master.label(config.key,row)}});
          del.addEventListener("click",()=>Master.openDelete(config.key,row));actions.appendChild(del);
        }
      }
      tr.appendChild(actions); body.appendChild(tr);
    });
    table.appendChild(body); wrapper.appendChild(table); panel.appendChild(wrapper);
    /* The rail reports what was loaded from the API, so it stays on the full
       set and is unaffected by the client-side filter. */
    renderContextRail(config.title, allRows);
  }

  function showDetails(config, row) {
    const body = Ui.element("div");
    body.appendChild(Ui.element("p", { className: "detail-key-label", text: "Record identity" }));
    body.appendChild(keyDisplay(config, row));
    const list = Ui.element("dl", { className: "detail-list" });
    config.details.forEach(function detail(item) {
      const group = Ui.element("div", { className: item.long ? "detail-item detail-wide" : "detail-item" });
      group.appendChild(Ui.element("dt", { text: item.label }));
      const dd = Ui.element("dd");
      if (item.type === "list") {
        if (Array.isArray(row[item.field]) && row[item.field].length) {
          const ul = Ui.element("ul", { className: "mb-0 ps-3" });
          row[item.field].forEach(function contact(value) { ul.appendChild(Ui.element("li", { text: value })); }); dd.appendChild(ul);
        } else dd.appendChild(Ui.element("span", { text: "—" }));
      } else dd.appendChild(formatValue(row[item.field], item));
      group.appendChild(dd); list.appendChild(group);
    });
    body.appendChild(list);
    let footer=null;
    if(Master.can(config.key,"update")){footer=Ui.element("div",{className:"modal-actions"});const close=Ui.element("button",{className:"btn btn-light",text:"Close",attributes:{type:"button","data-bs-dismiss":"modal"}});const edit=Ui.element("button",{className:"btn btn-primary",text:"Edit",attributes:{type:"button"}});edit.addEventListener("click",()=>{Ui.closeModal();setTimeout(()=>Master.openEdit(config.key,row),180);});footer.append(close,edit);}
    Ui.openModal({ title: config.title + " Details", body: body,footer:footer });
  }

  function normalizedError(error) {
    if (error && error.network) return "The AquaFleet API could not be reached. Navigation remains available.";
    return error && error.message ? error.message : "The resource could not be loaded.";
  }

  async function renderResource(key, button) {
    const config = Resources.byKey[key];
    if (!config) { renderDashboard(); return; }
    if (key === "vessels") return renderVessels();
    if (Workspace.has(key)) return renderWorkspaceResource(key);
    const sequence = ++state.requestSequence;
    state.currentView = key; state.currentResource = key; state.rows = []; state.loading = true;
    document.body.classList.remove("dashboard-view", "vessels-view"); setEyebrow();
    const search = searchInput(); if (search) search.disabled = false;
    Ui.setPageHeader(config.title, config.subtitle); Ui.clearAlerts(); updateActiveNavigation(key);
    /* Refresh and post-CRUD reloads land here with the query intact, so the
       placeholder is set but the query is deliberately NOT cleared. Clearing
       happens in navigate(), which is the only screen change. */
    setSearchPlaceholder("Search " + config.title.toLowerCase());
    const refresh = makeRefreshButton("Refresh", function refreshResource(clicked) { renderResource(key, clicked); });
    const pendingButton = button || refresh;
    setResourceActions(config,refresh); Ui.setButtonPending(pendingButton, true, "Refreshing…");
    Ui.renderLoading(document.getElementById("content-panel"), "Loading " + config.title.toLowerCase() + "…");
    try {
      const response = await Api.get(config.path);
      if (sequence !== state.requestSequence || state.currentResource !== key) return;
      state.rows = Array.isArray(response.data) ? response.data : [];
      state.totalCount = response.payload.count ?? state.rows.length;
      renderTable(config, state.rows, state.totalCount);
    } catch (error) {
      if (sequence !== state.requestSequence || state.currentResource !== key) return;
      Ui.renderError(document.getElementById("content-panel"), "Unable to load " + config.title, normalizedError(error));
    } finally {
      if (sequence === state.requestSequence) state.loading = false;
      Ui.setButtonPending(pendingButton, false);
    }
  }

  function renderWorkspaceResource(key) {
    const page = Workspace.describe(key);
    ++state.requestSequence;
    state.currentView = key; state.currentResource = key; state.rows = []; state.loading = false;
    document.body.classList.add("dashboard-view", "workspace-view");
    document.body.classList.remove("vessels-view");
    document.body.setAttribute("data-workspace", key);
    const search = searchInput(); if (search) search.disabled = false;
    Ui.setPageHeader(page.title, page.subtitle);
    setEyebrow(page.eyebrow || "AquaFleet Command · Fleet & Crew"); setSearchPlaceholder(page.searchPlaceholder);
    Ui.clearAlerts(); updateActiveNavigation(key);
    document.querySelectorAll("[data-nav-group]").forEach(function closeFlyout(button) {
      button.setAttribute("aria-expanded", "false");
      button.closest(".nav-group").classList.remove("flyout-open");
    });
    const actions = document.getElementById("page-actions"); Ui.clearElement(actions);
    const meta = Ui.element("div", { className: "ws-record-meta", children: [Ui.element("span", { text: "RECORDS" }), Ui.element("strong", { className: "ws-record-count", text: "— RECORDS" })] });
    actions.appendChild(meta);
    if (Master.can(key, "create")) {
      const add = Ui.element("button", { className: "ws-add-button", attributes: { type: "button" }, children: [Ui.element("span", { text: "＋", attributes: { "aria-hidden": "true" } }), Ui.element("span", { text: page.addLabel })] });
      add.addEventListener("click", function () { Master.openCreate(key); }); actions.appendChild(add);
    }
    Ui.clearElement(document.getElementById("context-rail"));
    Workspace.open(key, state.searchQuery);
  }

  function renderReports() {
    ++state.requestSequence;
    state.currentView = "reports"; state.currentResource = null; state.rows = []; state.loading = false;
    document.body.classList.add("workspace-view", "reports-view");
    document.body.classList.remove("dashboard-view", "vessels-view");
    setEyebrow("AquaFleet Command · Reporting");
    Ui.setPageHeader("Reports", "Read-only results from the AquaFleet SQL reporting views. No derived data is stored.");
    Ui.clearAlerts(); updateActiveNavigation("reports"); setActions(null);
    clearSearch(false); setSearchPlaceholder("Search returned report rows");
    const search = searchInput(); if (search) search.disabled = false;
    Reports.render(document.getElementById("content-panel"));
  }

  function navigate(view) {
    document.body.classList.add("af-auth-shell");
    if (state.currentView === "reports" && view !== "reports") Reports.leave();
    if (view !== "reports") document.body.classList.remove("reports-view");
    if (Workspace.has(state.currentView) && view !== state.currentView) Workspace.leave();
    if (!Workspace.has(view)) { document.body.classList.remove("workspace-view"); document.body.removeAttribute("data-workspace"); }
    closeMobileNavigation();
    /* A screen change starts clean: a vessel search must not silently carry
       into missions. Refresh and post-CRUD reloads do NOT come through here,
       which is exactly why they keep the query. */
    clearSearch(false);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelector(".app-main").scrollTop = 0;
    if (view === "dashboard") renderDashboard();
    else if (view === "reports") renderReports();
    else renderResource(view);
  }

  async function mutationComplete(key,message){if(state.currentResource===key){if(Workspace.has(key))await Workspace.refresh();else await renderResource(key);Ui.showAlert("success",message||"Operation completed successfully");}}
  async function refreshIfCurrent(key){if(state.currentResource===key){if(Workspace.has(key))await Workspace.refresh();else await renderResource(key);}}

  function initializeNavigation() {
    document.querySelectorAll("[data-view]").forEach(function register(link) {
      link.addEventListener("click", function selected(event) { event.preventDefault(); navigate(link.dataset.view); });
    });
    const groups = document.querySelectorAll("[data-nav-group]");
    function closeFlyouts() { groups.forEach(function close(button) { button.setAttribute("aria-expanded", "false"); button.closest(".nav-group").classList.remove("flyout-open"); }); }
    groups.forEach(function group(button) { button.addEventListener("click", function toggle(event) { event.stopPropagation(); const open = button.getAttribute("aria-expanded") === "true"; closeFlyouts(); if (!open) { button.setAttribute("aria-expanded", "true"); button.closest(".nav-group").classList.add("flyout-open"); } }); });
    document.addEventListener("click", function outside(event) { if (!event.target.closest(".nav-group")) closeFlyouts(); });
    document.addEventListener("keydown", function escape(event) { if (event.key === "Escape") closeFlyouts(); });
    const mobile = document.querySelector(".mobile-menu-button"); mobile.addEventListener("click", function () { const nav = document.getElementById("primary-navigation"); const open = nav.classList.toggle("show"); mobile.setAttribute("aria-expanded", String(open)); });
    initializeSearch();
  }

  function initializeSearch() {
    const input = searchInput();
    const clear = searchClearButton();
    if (!input) return;

    /* A short debounce keeps typing smooth and, just as importantly, stops
       the polite live region announcing a new count on every keystroke.
       No request is involved either way - filtering is over loaded rows. */
    let timer = null;
    input.addEventListener("input", function onInput() {
      state.searchQuery = input.value;
      syncClearButton();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function run() { timer = null; reapplySearch(); }, 140);
    });

    input.addEventListener("keydown", function onKeydown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      /* Only meaningful when there is something to clear; otherwise let the
         keypress do nothing rather than re-rendering for no reason. */
      if (!state.searchQuery) return;
      if (timer) { clearTimeout(timer); timer = null; }
      clearSearch(true);
    });

    clear.addEventListener("click", function onClear() {
      if (timer) { clearTimeout(timer); timer = null; }
      clearSearch(true);
      /* Focus returns to the field so typing can continue immediately. */
      input.focus();
    });
  }

  document.addEventListener("DOMContentLoaded", function start() {
    initializeNavigation();
    /* The dashboard is NOT rendered here any more. auth.js checks
       GET /api/auth/me first and calls renderDashboard() only once the
       session is confirmed, so no protected data is ever requested by an
       anonymous visitor. The fallback keeps the app usable if auth.js is
       ever removed. */
    if (global.AquaFleetAuth) global.AquaFleetAuth.boot();
    else renderDashboard();
  }, { once: true });

  global.AquaFleetApp = Object.freeze({
    getState: function getState() { return Object.assign({}, state); },
    navigate: navigate, renderDashboard: renderDashboard, renderResource: renderResource,
    renderReports: renderReports,
    mutationComplete:mutationComplete,refreshIfCurrent:refreshIfCurrent,
    clearCurrentSearch: function clearCurrentSearch() { clearSearch(true); },
    /* auth.js calls this so a query never survives a logout or a session
       loss into the next person's session. */
    clearSearch: function clearSearchState() {
      state.searchQuery = "";
      state.rows = [];
      state.missions = [];
      resetVesselState();
      Workspace.leave();
      const input = searchInput();
      if (input) input.value = "";
      syncClearButton();
      setSearchPlaceholder("Search");
    }
  });
})(window);
