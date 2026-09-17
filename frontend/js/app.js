/* AquaFleet SPA coordinator for dashboard, resources and role-aware CRUD. */
(function initializeAquaFleetApp(global) {
  "use strict";

  const Api = global.AquaFleetApi;
  const Ui = global.AquaFleetUi;
  const Resources = global.AquaFleetResources;
  const Master = global.AquaFleetMasterData;
  const Reports = global.AquaFleetReports;
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
    missions: []
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
    if (state.currentView === "reports") return;
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

  /* Builds the Mission Activity panel from state.missions, honouring the
     current query. The KPI cards above it and the summary rail beside it are
     built from the SAME full state.missions / vehicle list, so a search never
     moves a headline number. */
  function buildMissionActivity() {
    const config = Resources.byKey.missions;
    const all = state.missions;
    const rows = filterRows(config, all, state.searchQuery);
    const filtering = Boolean(normalizeText(state.searchQuery));

    const activity = Ui.element("section", {
      className: "activity-panel",
      children: [Ui.element("div", {
        className: "activity-heading",
        children: [
          Ui.element("h2", { text: "Mission Activity" }),
          Ui.element("span", {
            attributes: { role: "status", "aria-live": "polite" },
            text: filtering
              ? rows.length + " of " + all.length + " missions"
              : all.length + " missions"
          })
        ]
      })]
    });

    if (all.length && !rows.length) {
      const empty = Ui.element("div", { className: "activity-no-match" });
      empty.appendChild(Ui.element("p", {
        className: "mb-2", text: "No missions match “" + state.searchQuery + "”."
      }));
      const clear = Ui.element("button", {
        className: "btn btn-outline-primary btn-sm", text: "Clear Search",
        attributes: { type: "button" }
      });
      clear.addEventListener("click", function onClear() {
        clearSearch(true);
        const input = searchInput();
        if (input) input.focus();
      });
      empty.appendChild(clear);
      activity.appendChild(empty);
      return activity;
    }

    rows.slice(0, 8).forEach(function mission(row, index) {
      const view = Ui.element("button", {
        className: "activity-action", text: "View",
        attributes: { type: "button", "aria-label": "View mission " + row.mission_id }
      });
      view.addEventListener("click", function () { showDetails(config, row); });
      activity.appendChild(Ui.element("div", {
        className: "activity-row",
        children: [
          Ui.element("span", { className: "activity-tile", text: String(index + 1).padStart(2, "0") }),
          Ui.element("div", {
            className: "activity-copy",
            children: [
              Ui.element("strong", { text: row.mission_type }),
              Ui.element("small", { text: (row.expedition_title || "Expedition") + " · " + (row.zone_name || "Marine zone") })
            ]
          }),
          Ui.statusBadge(row.status, "mission"),
          Ui.element("span", { className: "activity-time", text: Ui.formatDateTime(row.start_time) }),
          view
        ]
      }));
    });
    return activity;
  }

  /* Swap only the activity panel, leaving the KPI cards untouched. */
  function renderMissionActivity() {
    const existing = document.querySelector(".activity-panel");
    if (!existing || !existing.parentNode) return;
    existing.parentNode.replaceChild(buildMissionActivity(), existing);
  }

  async function renderDashboard(button) {
    const sequence = ++state.requestSequence;
    state.currentView = "dashboard"; state.currentResource = null; state.rows = []; state.loading = true;
    const search = searchInput(); if (search) search.disabled = false;
    Ui.setPageHeader("Dashboard", "Read-only operational summary from existing AquaFleet APIs.");
    setSearchPlaceholder("Search missions");
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
    /* Stored so a keystroke can re-filter the activity list with no refetch. */
    state.missions = missions;
    const panel = document.getElementById("content-panel"); Ui.clearElement(panel); panel.setAttribute("aria-busy", "false");
    const top = Ui.element("div", { className: "dashboard-top" });
    const active = countBy(missions, "status", "In Progress");
    const primary = Ui.element("article", { className: "operations-card", children: [Ui.element("p", { className: "card-kicker", text: "Active Marine Operations" }), Ui.element("strong", { className: "operations-value", text: "0" }), Ui.element("p", { className: "operations-caption", text: "Missions currently underway" }), Ui.element("div", { className: "wave-motif", attributes: { "aria-hidden": "true" } }), Ui.element("div", { className: "operations-breakdown", children: [Ui.element("span", { children: [Ui.element("small", { text: "Planned" }), Ui.element("b", { text: countBy(missions, "status", "Planned") })] }), Ui.element("span", { children: [Ui.element("small", { text: "Completed" }), Ui.element("b", { text: countBy(missions, "status", "Completed") })] }), Ui.element("span", { children: [Ui.element("small", { text: "Total" }), Ui.element("b", { text: missions.length })] })] })] });
    animateNumber(primary.querySelector(".operations-value"), active); top.appendChild(primary);
    const available = countBy(vehicles, "status", "Available"), deployed = countBy(vehicles, "status", "Deployed"), maintenance = countBy(vehicles, "status", "Maintenance"), retired = countBy(vehicles, "status", "Retired");
    const readiness = vehicles.length ? Math.round(available / vehicles.length * 100) : 0;
    const fleet = Ui.element("article", { className: "fleet-card", children: [Ui.element("div", { className: "card-heading", children: [Ui.element("div", { children: [Ui.element("p", { className: "card-kicker", text: "Fleet readiness" }), Ui.element("h2", { text: "Vehicle status" })] }), Ui.element("span", { text: "Live" })] }), Ui.element("div", { className: "fleet-body", children: [Ui.element("div", { className: "readiness-ring", attributes: { style: "--ready:" + readiness * 3.6 + "deg" }, children: [Ui.element("strong", { text: readiness + "%" }), Ui.element("small", { text: "available" })] }), Ui.element("div", { className: "fleet-legend", children: [["Available", available], ["Deployed", deployed], ["Maintenance", maintenance], ["Retired", retired]].map(function legend(item) { return Ui.element("div", { children: [Ui.element("i"), Ui.element("span", { text: item[0] }), Ui.element("b", { text: item[1] })] }); }) })] })] }); top.appendChild(fleet); panel.appendChild(top);
    panel.appendChild(buildMissionActivity());
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
    const sequence = ++state.requestSequence;
    state.currentView = key; state.currentResource = key; state.rows = []; state.loading = true;
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

  function renderReports() {
    ++state.requestSequence;
    state.currentView = "reports"; state.currentResource = null; state.rows = []; state.loading = false;
    Ui.setPageHeader("Reports", "Read-only database views expose joined and derived AquaFleet information.");
    Ui.clearAlerts(); updateActiveNavigation("reports"); setActions(null);
    clearSearch(false); setSearchPlaceholder("Report filters are shown below");
    const search = searchInput(); if (search) search.disabled = true;
    Reports.render(document.getElementById("content-panel"));
  }

  function navigate(view) {
    closeMobileNavigation();
    /* A screen change starts clean: a vessel search must not silently carry
       into missions. Refresh and post-CRUD reloads do NOT come through here,
       which is exactly why they keep the query. */
    clearSearch(false);
    if (view === "dashboard") renderDashboard();
    else if (view === "reports") renderReports();
    else renderResource(view);
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
    /* auth.js calls this so a query never survives a logout or a session
       loss into the next person's session. */
    clearSearch: function clearSearchState() {
      state.searchQuery = "";
      state.rows = [];
      state.missions = [];
      const input = searchInput();
      if (input) input.value = "";
      syncClearButton();
      setSearchPlaceholder("Search");
    }
  });
})(window);
