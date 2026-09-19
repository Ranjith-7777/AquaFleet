/* Small controller for the first database-backed register workspace. */
(function exposeWorkspace(global) {
  "use strict";
  const Api = global.AquaFleetApi, Ui = global.AquaFleetUi;
  const Data = global.AquaFleetWorkspaceData, C = global.AquaFleetWorkspaceComponents;
  const Master = global.AquaFleetMasterData, Resources = global.AquaFleetResources.byKey;
  const pages = Object.create(null);
  const view = { key: null, rows: [], relation: null, query: "", filter: "All", page: 1, selectedId: null, version: 0, loading: false };
  const panel = function () { return document.getElementById("content-panel"); };

  function register(config) { pages[config.key] = config; }
  function active() { return Boolean(pages[view.key]); }
  function isCurrent(key) { return view.key === key && global.AquaFleetApp.getState().currentResource === key; }
  function filtered(config) {
    return view.rows.filter(function keep(row) {
      return (view.filter === "All" || row[config.filterField] === view.filter) && Data.matches(row, config.searchFields, view.query);
    });
  }
  function choose(rows, config) {
    if (rows.length && !rows.some(function selected(row) { return String(row[config.idField]) === String(view.selectedId); })) view.selectedId = rows[0][config.idField];
    if (!rows.length) view.selectedId = null;
  }
  function select(id, scroll) {
    view.selectedId = id; render();
    if (scroll && window.matchMedia("(max-width: 1100px)").matches) document.querySelector(".ws-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderTable(config, list, pageData, context) {
    const card = C.el("article", "ws-card ws-register");
    const head = C.el("div", "ws-register-top");
    head.appendChild(C.el("h2", "", config.registerTitle));
    const filters = C.el("div", "ws-filters"); filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "Filter " + config.title);
    config.filters.forEach(function addFilter(label) {
      const tab = C.button(label, "ws-filter" + (view.filter === label ? " active" : ""), function () { view.filter = label; view.page = 1; render(); });
      tab.setAttribute("aria-pressed", String(view.filter === label)); filters.appendChild(tab);
    });
    head.append(filters, C.el("span", "ws-shown", list.length + " of " + view.rows.length + " shown")); card.appendChild(head);
    const scroller = C.el("div", "ws-register-scroll");
    const grid = C.el("div", "ws-table"); grid.setAttribute("role", "table");
    grid.style.setProperty("--ws-columns", config.columnsTemplate);
    const header = C.el("div", "ws-table-head"); header.setAttribute("role", "row");
    config.columns.forEach(function column(col) {
      const node = C.el("span", "ws-col-" + col.type, col.label); node.setAttribute("role", "columnheader"); header.appendChild(node);
    });
    header.appendChild(C.el("span", "ws-col-actions", "Actions")); grid.appendChild(header);
    const body = C.el("div", "ws-table-body"); body.setAttribute("role", "rowgroup");
    if (!view.rows.length) C.state(body, "empty", "No zones recorded", "Add a zone to begin.");
    else if (!list.length) {
      C.state(body, "empty", "No matching records", "Adjust the search or filter to see zones.");
      body.querySelector(".ws-state").appendChild(C.button("Clear filters", "ws-state-retry", function () {
        view.filter = "All"; view.query = ""; const input = document.getElementById("global-search"); if (input) input.value = "";
        global.AquaFleetApp.clearCurrentSearch(); render();
      }));
    } else pageData.rows.forEach(function row(item) {
      const row = C.el("div", "ws-table-row" + (String(item[config.idField]) === String(view.selectedId) ? " selected" : ""));
      row.setAttribute("role", "row"); row.setAttribute("tabindex", "0"); row.setAttribute("aria-selected", String(String(item[config.idField]) === String(view.selectedId)));
      row.addEventListener("click", function () { select(item[config.idField], false); });
      row.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item[config.idField], false); } });
      config.columns.forEach(function column(col) {
        const cell = C.el("span", "ws-cell ws-col-" + col.type); cell.setAttribute("role", "cell");
        if (col.type === "primary") cell.append(C.el("strong", "", item[col.field]), C.el("small", "", item[col.subField]));
        else if (col.type === "pill") cell.appendChild(C.pill(item[col.field], config.tone(item[col.field])));
        else cell.textContent = String(col.value ? col.value(item, context) : item[col.field] ?? "—");
        row.appendChild(cell);
      });
      const actions = C.el("span", "ws-row-actions"); actions.setAttribute("role", "cell");
      function addAction(label, tone, handler) { const node = C.action(label, tone, function (event) { event.stopPropagation(); handler(); }); actions.appendChild(node); }
      addAction("View", "view", function () { select(item[config.idField], true); });
      if (Master.can(config.key, "update")) addAction("Edit", "view", function () { Master.openEdit(config.key, item); });
      if (Master.can(config.key, "delete")) addAction("Delete", "delete", function () { Master.openDelete(config.key, item); });
      row.appendChild(actions); body.appendChild(row);
    });
    grid.appendChild(body); scroller.appendChild(grid); card.appendChild(scroller);
    const footer = C.el("div", "ws-register-footer");
    const from = list.length ? (pageData.page - 1) * config.pageSize + 1 : 0, to = list.length ? from + pageData.rows.length - 1 : 0;
    footer.appendChild(C.el("span", "", list.length ? "Showing " + from + "–" + to + " of " + list.length + " records" : "No records to display"));
    const pager = C.el("div", "ws-pager");
    pager.append(C.button("‹", "ws-page-button", function () { view.page--; render(); }, pageData.page === 1), C.el("span", "ws-page-current", String(pageData.page)), C.button("›", "ws-page-button", function () { view.page++; render(); }, pageData.page === pageData.pages));
    footer.appendChild(pager); card.appendChild(footer); return card;
  }
  function render() {
    const config = pages[view.key]; if (!config || !isCurrent(config.key) || view.loading) return;
    const context = config.context(view.rows, view.relation), list = filtered(config);
    choose(list, config);
    const pageData = Data.pageOf(list, view.page, config.pageSize); view.page = pageData.page;
    Ui.clearElement(panel()); panel().setAttribute("aria-busy", "false");
    const tabs = C.el("nav", "ws-tabs"); tabs.setAttribute("aria-label", "Section pages");
    config.tabs.forEach(function tab(item) {
      const node = C.button(item.label, "ws-tab" + (item.key === config.key ? " active" : ""), function () { if (item.key !== config.key) global.AquaFleetApp.navigate(item.key); });
      if (item.key === config.key) node.setAttribute("aria-current", "page"); tabs.appendChild(node);
    });
    const metrics = C.el("section", "ws-kpis"); metrics.setAttribute("aria-label", "Summary"); config.metrics(view.rows, context).forEach(function (item) { metrics.appendChild(C.metric(item)); });
    const layout = C.el("section", "ws-layout"); layout.appendChild(renderTable(config, list, pageData, context));
    const selected = view.rows.find(function (row) { return String(row[config.idField]) === String(view.selectedId); });
    layout.appendChild(config.detail(selected, context, select)); panel().append(tabs, metrics, layout);
  }
  async function fetch(config) {
    const version = ++view.version; view.loading = true;
    panel().setAttribute("aria-busy", "true");
    C.state(panel(), "loading", "Loading marine zones", "Querying aquafleet_db…");
    const results = await Promise.allSettled([Api.get(Resources[config.key].path), Api.get(Resources[config.relationKey].path)]);
    if (version !== view.version || !isCurrent(config.key)) return;
    view.loading = false;
    panel().setAttribute("aria-busy", "false");
    if (results[0].status !== "fulfilled") {
      const error = results[0].reason;
      C.state(panel(), error && error.status === 403 ? "restricted" : "error", "Unable to load Marine Zones", error && error.message || "The zones could not be loaded. No data was changed.", function () { fetch(config); });
      return;
    }
    view.rows = Array.isArray(results[0].value.data) ? results[0].value.data : [];
    view.relation = results[1].status === "fulfilled" && Array.isArray(results[1].value.data) ? results[1].value.data : null;
    const meta = document.querySelector(".ws-record-count"); if (meta) meta.textContent = view.rows.length + (view.rows.length === 1 ? " RECORD" : " RECORDS");
    render();
  }
  function open(key, query) {
    const config = pages[key]; if (!config) return false;
    view.key = key; view.query = query || ""; view.filter = "All"; view.page = 1; view.selectedId = null; view.rows = []; view.relation = null;
    fetch(config); return true;
  }
  function refresh() { if (active()) return fetch(pages[view.key]); }
  function setQuery(query) { if (!active()) return; view.query = query; view.page = 1; render(); }
  function leave() { ++view.version; view.key = null; view.rows = []; view.relation = null; }
  global.AquaFleetWorkspace = Object.freeze({ register: register, open: open, refresh: refresh, setQuery: setQuery, leave: leave, isCurrent: isCurrent });
})(window);
