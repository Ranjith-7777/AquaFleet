/* AquaFleet read-only SPA coordinator for dashboard and resource views. */
(function initializeAquaFleetApp(global) {
  "use strict";

  const Api = global.AquaFleetApi;
  const Ui = global.AquaFleetUi;
  const Resources = global.AquaFleetResources;
  const Master = global.AquaFleetMasterData;
  const dashboardMetrics = [
    ["vessels", "Research Vessels"], ["vehicles", "AUV/ROV Vehicles"],
    ["expeditions", "Expeditions"], ["missions", "Missions"],
    ["samples", "Samples"], ["incidents", "Incidents"], ["battery-packs", "Battery Packs"],
    ["inspection-tasks", "Inspection Tasks"]
  ];

  const state = {
    currentView: "dashboard", currentResource: null, rows: [], loading: false,
    requestSequence: 0, health: "checking", databaseHealth: "checking",
    databaseName: null, mysqlVersion: null, lastRefreshed: null
  };

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
    if (Master.isCrud(config.key)) {
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
    state.health = results[0].status === "fulfilled" ? "ok" : "offline";
    state.databaseHealth = results[1].status === "fulfilled" ? "ok" : "error";
    if (results[1].status === "fulfilled") {
      state.databaseName = results[1].value.payload.database || null;
      state.mysqlVersion = results[1].value.payload.mysql_version || null;
    } else { state.databaseName = null; state.mysqlVersion = null; }
    setHealthIndicator(healthSummary());
  }

  function metricCard(label, result) {
    const card = Ui.element("article", { className: "metric-card" + (result.ok ? "" : " metric-unavailable") });
    card.appendChild(Ui.element("p", { className: "metric-label", text: label }));
    card.appendChild(Ui.element("p", { className: "metric-value", text: result.ok ? result.count : "Unavailable" }));
    card.appendChild(Ui.element("p", { className: "metric-note", text: result.ok ? "Current records" : "Could not load this count" }));
    return card;
  }

  function healthDetail(label, value) {
    const item = Ui.element("div", { className: "health-detail" });
    item.appendChild(Ui.element("dt", { text: label }));
    item.appendChild(Ui.element("dd", { text: Ui.nullableText(value) }));
    return item;
  }

  async function renderDashboard(button) {
    const sequence = ++state.requestSequence;
    state.currentView = "dashboard"; state.currentResource = null; state.rows = []; state.loading = true;
    Ui.setPageHeader("Dashboard", "Read-only operational summary from existing AquaFleet APIs.");
    Ui.clearAlerts(); updateActiveNavigation("dashboard");
    const refresh = makeRefreshButton("Refresh Dashboard", renderDashboard);
    const pendingButton = button || refresh;
    setActions(refresh); Ui.setButtonPending(pendingButton, true, "Refreshing…");
    Ui.renderLoading(document.getElementById("content-panel"), "Loading system health and operational counts…");

    const work = [loadHealth()].concat(dashboardMetrics.map(function loadMetric(item) {
      return Api.get(Resources.byKey[item[0]].path);
    }));
    const results = await Promise.allSettled(work);
    if (sequence !== state.requestSequence || state.currentView !== "dashboard") return;

    state.loading = false; state.lastRefreshed = new Date();
    const payloads = {}; dashboardMetrics.forEach(function map(item, index) { payloads[item[0]] = results[index + 1].status === "fulfilled" ? results[index + 1].value : { data: [], payload: { count: 0 } }; });
    const missions = payloads.missions.data || [], vehicles = payloads.vehicles.data || [];
    const panel = document.getElementById("content-panel"); Ui.clearElement(panel); panel.setAttribute("aria-busy", "false");
    const top = Ui.element("div", { className: "dashboard-top" });
    const active = countBy(missions, "status", "In Progress");
    const primary = Ui.element("article", { className: "operations-card", children: [Ui.element("p", { className: "card-kicker", text: "Active Marine Operations" }), Ui.element("strong", { className: "operations-value", text: "0" }), Ui.element("p", { className: "operations-caption", text: "Missions currently underway" }), Ui.element("div", { className: "wave-motif", attributes: { "aria-hidden": "true" } }), Ui.element("div", { className: "operations-breakdown", children: [Ui.element("span", { children: [Ui.element("small", { text: "Planned" }), Ui.element("b", { text: countBy(missions, "status", "Planned") })] }), Ui.element("span", { children: [Ui.element("small", { text: "Completed" }), Ui.element("b", { text: countBy(missions, "status", "Completed") })] }), Ui.element("span", { children: [Ui.element("small", { text: "Total" }), Ui.element("b", { text: missions.length })] })] })] });
    animateNumber(primary.querySelector(".operations-value"), active); top.appendChild(primary);
    const available = countBy(vehicles, "status", "Available"), deployed = countBy(vehicles, "status", "Deployed"), maintenance = countBy(vehicles, "status", "Maintenance"), retired = countBy(vehicles, "status", "Retired");
    const readiness = vehicles.length ? Math.round(available / vehicles.length * 100) : 0;
    const fleet = Ui.element("article", { className: "fleet-card", children: [Ui.element("div", { className: "card-heading", children: [Ui.element("div", { children: [Ui.element("p", { className: "card-kicker", text: "Fleet readiness" }), Ui.element("h2", { text: "Vehicle status" })] }), Ui.element("span", { text: "Live" })] }), Ui.element("div", { className: "fleet-body", children: [Ui.element("div", { className: "readiness-ring", attributes: { style: "--ready:" + readiness * 3.6 + "deg" }, children: [Ui.element("strong", { text: readiness + "%" }), Ui.element("small", { text: "available" })] }), Ui.element("div", { className: "fleet-legend", children: [["Available", available], ["Deployed", deployed], ["Maintenance", maintenance], ["Retired", retired]].map(function legend(item) { return Ui.element("div", { children: [Ui.element("i"), Ui.element("span", { text: item[0] }), Ui.element("b", { text: item[1] })] }); }) })] })] }); top.appendChild(fleet); panel.appendChild(top);
    const activity = Ui.element("section", { className: "activity-panel", children: [Ui.element("div", { className: "activity-heading", children: [Ui.element("h2", { text: "Mission Activity" }), Ui.element("span", { text: missions.length + " missions" })] })] });
    missions.slice(0, 8).forEach(function mission(row, index) { const view = Ui.element("button", { className: "activity-action", text: "View", attributes: { type: "button", "aria-label": "View mission " + row.mission_id } }); view.addEventListener("click", function () { showDetails(Resources.byKey.missions, row); }); activity.appendChild(Ui.element("div", { className: "activity-row", children: [Ui.element("span", { className: "activity-tile", text: String(index + 1).padStart(2, "0") }), Ui.element("div", { className: "activity-copy", children: [Ui.element("strong", { text: row.mission_type }), Ui.element("small", { text: (row.expedition_title || "Expedition") + " · " + (row.zone_name || "Marine zone") })] }), Ui.statusBadge(row.status, "mission"), Ui.element("span", { className: "activity-time", text: Ui.formatDateTime(row.start_time) }), view] })); }); panel.appendChild(activity);
    const rail = document.getElementById("context-rail"); Ui.clearElement(rail); rail.appendChild(Ui.element("div", { className: "rail-heading", children: [Ui.element("p", { text: "Operational pulse" }), Ui.element("h2", { text: "Live summary" })] }));
    rail.appendChild(summaryCard("Open incidents", payloads.incidents.payload.count, "Reported records", "coral")); rail.appendChild(summaryCard("Inspection tasks", payloads["inspection-tasks"].payload.count, "Current workload", "yellow")); rail.appendChild(summaryCard("Samples collected", payloads.samples.payload.count, "Scientific records", "aqua")); rail.appendChild(summaryCard("Battery packs", payloads["battery-packs"] ? payloads["battery-packs"].payload.count : 0, "Fleet energy", "blue"));
    rail.appendChild(Ui.element("article", { className: "rail-card connection-card", children: [Ui.element("span", { className: "health-dot" }), Ui.element("div", { children: [Ui.element("strong", { text: "Database connected" }), Ui.element("small", { text: state.databaseName || "AquaFleet DB" })] })] }));
    Ui.setButtonPending(pendingButton, false);
  }

  function keyDisplay(config, row) {
    const container = Ui.element("div", { className: "composite-key" });
    config.keys.forEach(function addKey(field) {
      container.appendChild(Ui.element("span", { text: field + ": " + Ui.nullableText(row[field]) }));
    });
    return container;
  }

  function renderTable(config, rows, count) {
    const panel = document.getElementById("content-panel"); Ui.clearElement(panel); panel.setAttribute("aria-busy", "false");
    const summary = Ui.element("div", { className: "resource-summary" });
    summary.appendChild(Ui.element("p", { className: "mb-0", text: count + (count === 1 ? " record" : " records") }));
    panel.appendChild(summary);
    if (!rows.length) { Ui.renderEmpty(panel, "No " + config.title.toLowerCase(), "This resource currently contains no records."); return; }

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
      if(Master.isCrud(config.key)){
        const edit=Ui.element("button",{className:"btn btn-sm btn-outline-secondary",text:"Edit",attributes:{type:"button","aria-label":"Edit "+Master.label(config.key,row)}});
        const del=Ui.element("button",{className:"btn btn-sm btn-outline-danger",text:"Delete",attributes:{type:"button","aria-label":"Delete "+Master.label(config.key,row)}});
        edit.addEventListener("click",()=>Master.openEdit(config.key,row));del.addEventListener("click",()=>Master.openDelete(config.key,row));actions.append(edit,del);
      }
      tr.appendChild(actions); body.appendChild(tr);
    });
    table.appendChild(body); wrapper.appendChild(table); panel.appendChild(wrapper);
    renderContextRail(config.title, rows);
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
    if(Master.isCrud(config.key)){footer=Ui.element("div",{className:"modal-actions"});const close=Ui.element("button",{className:"btn btn-light",text:"Close",attributes:{type:"button","data-bs-dismiss":"modal"}});const edit=Ui.element("button",{className:"btn btn-primary",text:"Edit",attributes:{type:"button"}});edit.addEventListener("click",()=>{Ui.closeModal();setTimeout(()=>Master.openEdit(config.key,row),180);});footer.append(close,edit);}
    Ui.openModal({ title: config.title + " Details", body: body,footer:footer });
  }

  function normalizedError(error) {
    if (error && error.network) return "The AquaFleet API could not be reached. Navigation remains available.";
    return error && error.message ? error.message : "The resource could not be loaded.";
  }

  async function renderResource(key, button) {
    const config = Resources.byKey[key];
    if (!config) { renderDashboard(); return; }
    const sequence = ++state.requestSequence;
    state.currentView = key; state.currentResource = key; state.rows = []; state.loading = true;
    Ui.setPageHeader(config.title, config.subtitle); Ui.clearAlerts(); updateActiveNavigation(key);
    const refresh = makeRefreshButton("Refresh", function refreshResource(clicked) { renderResource(key, clicked); });
    const pendingButton = button || refresh;
    setResourceActions(config,refresh); Ui.setButtonPending(pendingButton, true, "Refreshing…");
    Ui.renderLoading(document.getElementById("content-panel"), "Loading " + config.title.toLowerCase() + "…");
    try {
      const response = await Api.get(config.path);
      if (sequence !== state.requestSequence || state.currentResource !== key) return;
      state.rows = Array.isArray(response.data) ? response.data : [];
      renderTable(config, state.rows, response.payload.count ?? state.rows.length);
    } catch (error) {
      if (sequence !== state.requestSequence || state.currentResource !== key) return;
      Ui.renderError(document.getElementById("content-panel"), "Unable to load " + config.title, normalizedError(error));
    } finally {
      if (sequence === state.requestSequence) state.loading = false;
      Ui.setButtonPending(pendingButton, false);
    }
  }

  function navigate(view) {
    closeMobileNavigation();
    if (view === "dashboard") renderDashboard(); else renderResource(view);
  }

  async function mutationComplete(key,message){if(state.currentResource===key){await renderResource(key);Ui.showAlert("success",message||"Operation completed successfully");}}
  async function refreshIfCurrent(key){if(state.currentResource===key)await renderResource(key);}

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
  }

  document.addEventListener("DOMContentLoaded", function start() {
    initializeNavigation(); renderDashboard();
  }, { once: true });

  global.AquaFleetApp = Object.freeze({
    getState: function getState() { return Object.assign({}, state); },
    navigate: navigate, renderDashboard: renderDashboard, renderResource: renderResource,
    mutationComplete:mutationComplete,refreshIfCurrent:refreshIfCurrent
  });
})(window);
