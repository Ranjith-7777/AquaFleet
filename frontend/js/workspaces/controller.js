/* Shared controller for database-backed register workspaces. */
(function exposeWorkspace(global) {
  "use strict";
  const Api = global.AquaFleetApi, Ui = global.AquaFleetUi;
  const Data = global.AquaFleetWorkspaceData, C = global.AquaFleetWorkspaceComponents;
  const Master = global.AquaFleetMasterData, Resources = global.AquaFleetResources.byKey;
  const pages = Object.create(null);
  const view = { key: null, rows: [], relation: null, query: "", filter: "All", page: 1, selectedId: null, version: 0, loading: false, cause: null };
  const panel = function () { return document.getElementById("content-panel"); };

  function register(config) { pages[config.key] = config; }
  function has(key) { return Boolean(pages[key]); }
  function describe(key) { return pages[key]; }
  function identity(config, row) { return String(config.identity ? config.identity(row) : row[config.idField]); }
  function active() { return Boolean(pages[view.key]); }
  function isCurrent(key) { return view.key === key && global.AquaFleetApp.getState().currentResource === key; }
  function filtered(config, context) {
    return view.rows.filter(function keep(row) {
      const status = config.filterValue ? config.filterValue(row, context) : row[config.filterField];
      const searchable = config.searchValues ? config.searchValues(row, context) : config.searchFields.map(function (field) { return row[field]; });
      return (view.filter === "All" || status === view.filter) && Data.matches(searchable, searchable.map(function (_, index) { return index; }), view.query);
    });
  }
  function choose(rows, config) {
    if (rows.length && !rows.some(function selected(row) { return identity(config, row) === view.selectedId; })) view.selectedId = identity(config, rows[0]);
    if (!rows.length) view.selectedId = null;
  }
  function select(id, scroll) {
    view.selectedId = id; view.cause = "select"; render();
    if (scroll && window.matchMedia("(max-width: 1100px)").matches) document.querySelector(".ws-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  /* Column widths are measured from the data, not guessed per page.
     Each track is as wide as the widest value or header actually present (in
     the real fonts), unusually long text is capped, name columns share the
     leftover space, and the Actions track always fits "View  Edit  Delete".
     If the data genuinely cannot fit, the register scrolls sideways inside its
     card with the Actions column pinned, and full values remain on hover. */
  const measureContext = document.createElement("canvas").getContext("2d");
  const FONTS = { body: '"Manrope", ui-sans-serif, sans-serif', mono: '"IBM Plex Mono", ui-monospace, monospace' };
  const CAP = { id: 96, num: 140, pill: 190, mono: 190, text: 210, primary: 270 };
  const ACTIONS_MIN = 120, COLUMN_GAP = 8, TABLE_PADDING = 36, SAMPLE_LIMIT = 300;
  function textWidth(text, font) { measureContext.font = font; return measureContext.measureText(String(text)).width; }
  function cellText(value) { return value === null || value === undefined || value === "" ? "—" : String(value); }
  function measuredColumns(config, rows, context, capScale) {
    const caps = Object.keys(CAP).reduce(function (all, key) { all[key] = CAP[key] * (capScale || 1); return all; }, {});
    const sample = rows.slice(0, SAMPLE_LIMIT);
    const tracks = config.columns.map(function (col) {
      const label = String(col.label || "");
      let width = textWidth(label.toUpperCase(), "700 12.5px " + FONTS.body) + label.length * 0.65 + 4;   // header label
      sample.forEach(function (item) {
        const value = cellText(col.value ? col.value(item, context) : item[col.field]);
        if (col.type === "primary") {
          const sub = cellText(col.subValue ? col.subValue(item, context) : item[col.subField]);
          /* The name sizes the column; its secondary line may run a little
             longer but never dictates the width (it truncates, full text on hover). */
          const name = textWidth(value, "700 14.5px " + FONTS.body);
          width = Math.max(width, name, Math.min(textWidth(sub, "500 12.5px " + FONTS.body), name + 36));
        } else if (col.type === "pill") width = Math.max(width, textWidth(value, "700 12.5px " + FONTS.body) + 28);
        else if (col.type === "id") width = Math.max(width, textWidth(value, "500 13px " + FONTS.mono));
        else if (col.type === "mono") width = Math.max(width, textWidth(value, "500 13.5px " + FONTS.body));
        else if (col.type === "num") width = Math.max(width, textWidth(value, "600 14px " + FONTS.body));
        else width = Math.max(width, textWidth(value, "500 14px " + FONTS.body));
      });
      const type = CAP[col.type] ? col.type : "text";
      /* Cells use tabular digits, slightly wider than the canvas measures: add a 4% margin to data text. */
      const px = Math.ceil(Math.min(width * (type === "primary" || type === "pill" ? 1.01 : 1.04) + 2, Math.max(caps[type], Math.ceil(textWidth(label.toUpperCase(), "700 12.5px " + FONTS.body) + label.length * 0.65 + 6))));
      return { type: type, px: px };
    });
    let minimum = ACTIONS_MIN;
    const template = tracks.map(function (track) {
      minimum += track.px;
      if (track.type === "primary") return "minmax(" + track.px + "px, 3fr)";
      if (track.type === "text" || track.type === "mono") return "minmax(" + track.px + "px, " + (track.px >= 120 ? 2 : 1) + "fr)";
      return track.px + "px";                                                                            // id, num, pill
    });
    template.push(ACTIONS_MIN + "px");
    return { template: template.join(" "), minWidth: minimum + COLUMN_GAP * tracks.length + TABLE_PADDING };
  }
  function renderTable(config, list, pageData, context) {
    const card = C.el("article", "ws-card ws-register");
    const head = C.el("div", "ws-register-top");
    head.appendChild(C.el("h2", "", config.registerTitle));
    const filters = C.el("div", "ws-filters"); filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "Filter " + config.title);
    config.filters.forEach(function addFilter(label) {
      const tab = C.button(label, "ws-filter" + (view.filter === label ? " active" : ""), function () { view.filter = label; view.page = 1; view.cause = "filter"; render(); });
      tab.setAttribute("aria-pressed", String(view.filter === label)); filters.appendChild(tab);
    });
    if (config.filters.length > 1) head.appendChild(filters);
    head.appendChild(C.el("span", "ws-shown", list.length + " of " + view.rows.length + " shown")); card.appendChild(head);
    const scroller = C.el("div", "ws-register-scroll");
    const grid = C.el("div", "ws-table"); grid.setAttribute("role", "table");
    const columns = measuredColumns(config, view.rows, context);
    grid.style.setProperty("--ws-columns", columns.template); grid.style.setProperty("--ws-min", columns.minWidth + "px");
    grid.dataset.wsColumns = columns.template; grid.dataset.wsMin = columns.minWidth;
    const header = C.el("div", "ws-table-head"); header.setAttribute("role", "row");
    config.columns.forEach(function column(col) {
      const node = C.el("span", "ws-col-" + col.type, col.label); node.setAttribute("role", "columnheader"); header.appendChild(node);
    });
    header.appendChild(C.el("span", "ws-col-actions", "Actions")); grid.appendChild(header);
    const body = C.el("div", "ws-table-body"); body.setAttribute("role", "rowgroup");
    if (!view.rows.length) C.state(body, "empty", "No " + config.title.toLowerCase() + " recorded", "Add a record to begin.");
    else if (!list.length) {
      C.state(body, "empty", "No matching records", "Adjust the search or filter to see " + config.title.toLowerCase() + ".");
      body.querySelector(".ws-state").appendChild(C.button("Clear filters", "ws-state-retry", function () {
        view.filter = "All"; view.query = ""; const input = document.getElementById("global-search"); if (input) input.value = "";
        global.AquaFleetApp.clearCurrentSearch(); view.cause = "filter"; render();
      }));
    } else pageData.rows.forEach(function row(item) {
      const rowId = identity(config, item);
      const row = C.el("div", "ws-table-row" + (rowId === view.selectedId ? " selected" : ""));
      row.setAttribute("role", "row"); row.setAttribute("tabindex", "0"); row.setAttribute("aria-selected", String(rowId === view.selectedId));
      row.addEventListener("click", function () { select(rowId, false); });
      row.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(rowId, false); } });
      config.columns.forEach(function column(col) {
        const cell = C.el("span", "ws-cell ws-col-" + col.type); cell.setAttribute("role", "cell");
        if (col.type === "primary") cell.append(C.el("strong", "", col.value ? col.value(item, context) : item[col.field]), C.el("small", "", col.subValue ? col.subValue(item, context) : item[col.subField]));
        else if (col.type === "pill") { const value = col.value ? col.value(item, context) : item[col.field]; cell.appendChild(C.pill(value, config.tone(value))); }
        else cell.textContent = String(col.value ? col.value(item, context) : item[col.field] ?? "—");
        /* A truncated value must never be unreadable: expose it in full on hover. */
        if (col.type !== "pill") cell.title = cell.textContent;
        row.appendChild(cell);
      });
      const actions = C.el("span", "ws-row-actions"); actions.setAttribute("role", "cell");
      function addAction(label, tone, handler) { const node = C.action(label, tone, function (event) { event.stopPropagation(); handler(); }); actions.appendChild(node); }
      addAction("View", "view", function () { select(rowId, true); });
      if (Master.can(config.key, "update")) addAction("Edit", "view", function () { Master.openEdit(config.key, item); });
      if (Master.can(config.key, "delete")) addAction("Delete", "delete", function () { Master.openDelete(config.key, item); });
      row.appendChild(actions); body.appendChild(row);
    });
    grid.appendChild(body); scroller.appendChild(grid); card.appendChild(scroller);
    const footer = C.el("div", "ws-register-footer");
    const from = list.length ? (pageData.page - 1) * config.pageSize + 1 : 0, to = list.length ? from + pageData.rows.length - 1 : 0;
    footer.appendChild(C.el("span", "", list.length ? "Showing " + from + "–" + to + " of " + list.length + " records" : "No records to display"));
    const pager = C.el("div", "ws-pager");
    pager.append(C.button("‹", "ws-page-button", function () { view.page--; view.cause = "page"; render(); }, pageData.page === 1), C.el("span", "ws-page-current", String(pageData.page)), C.button("›", "ws-page-button", function () { view.page++; view.cause = "page"; render(); }, pageData.page === pageData.pages));
    footer.appendChild(pager); card.appendChild(footer); return card;
  }
  function render() {
    const cause = view.cause; view.cause = null;
    const config = pages[view.key]; if (!config || !isCurrent(config.key) || view.loading) return;
    const context = config.context(view.rows, view.relation), list = filtered(config, context);
    choose(list, config);
    const pageData = Data.pageOf(list, view.page, config.pageSize); view.page = pageData.page;
    Ui.clearElement(panel()); panel().setAttribute("aria-busy", "false");
    const tabs = C.sectionTabs(config.key);
    const metrics = C.el("section", "ws-kpis"); metrics.setAttribute("aria-label", "Summary"); config.metrics(view.rows, context).forEach(function (item) { metrics.appendChild(C.metric(item)); });
    const layout = C.el("section", "ws-layout"); layout.appendChild(renderTable(config, list, pageData, context));
    const selected = view.rows.find(function (row) { return identity(config, row) === view.selectedId; });
    layout.appendChild(config.detail(selected, context, select)); panel().append.apply(panel(), [tabs, metrics, layout].filter(Boolean));
    /* Pinning the Actions column hides a column's worth of data beneath it, so
       do it only when the register overflows by more than that. */
    const scroller = layout.querySelector(".ws-register-scroll"), grid = layout.querySelector(".ws-table");
    if (scroller && grid && view.rows.length) {
      const overflow = function () { return scroller.scrollWidth > scroller.clientWidth + 1; };
      const valuesCut = function () {
        return Array.from(grid.querySelectorAll(".ws-table-row .ws-cell:not(.ws-col-primary), .ws-table-row .ws-col-primary strong"))
          .some(function (node) { return node.scrollWidth > node.clientWidth + 1; });
      };
      /* Spare room and a clipped value: lift the width caps; keep that only if it still fits. */
      if (!overflow() && valuesCut()) {
        const roomy = measuredColumns(config, view.rows, context, 1.7);
        grid.style.setProperty("--ws-columns", roomy.template); grid.style.setProperty("--ws-min", roomy.minWidth + "px");
        if (overflow()) { grid.style.setProperty("--ws-columns", grid.dataset.wsColumns); grid.style.setProperty("--ws-min", grid.dataset.wsMin + "px"); }
      }
      scroller.classList.toggle("ws-scrolls", overflow());
      scroller.classList.toggle("ws-pinned", scroller.scrollWidth - scroller.clientWidth > ACTIONS_MIN);
    }
    /* Motion: the page entrance on navigation; otherwise only the region whose
       context actually changed (see js/motion.js). */
    const motion = global.AquaFleetMotion;
    if (motion) {
      const entered = motion.content(panel());
      if (!entered) {
        if (cause === "filter" || cause === "search" || cause === "page" || cause === "refresh") motion.results(layout.querySelector(".ws-table-body"));
        if (cause === "filter") motion.filter(layout.querySelector(".ws-filters"));
      }
      motion.detail(layout.querySelector(".ws-detail"), config.key + ":" + view.selectedId, entered);
    }
  }
  async function fetch(config) {
    const version = ++view.version; view.loading = true;
    panel().setAttribute("aria-busy", "true");
    C.state(panel(), "loading", "Loading " + config.title.toLowerCase(), "Querying aquafleet_db…");
    const relationKeys = config.relationKeys || [config.relationKey];
    const results = await Promise.allSettled([Api.get(Resources[config.key].path)].concat(relationKeys.map(function (key) { return Api.get(Resources[key].path); })));
    if (version !== view.version || !isCurrent(config.key)) return;
    view.loading = false;
    panel().setAttribute("aria-busy", "false");
    if (results[0].status !== "fulfilled") {
      const error = results[0].reason;
      C.state(panel(), error && error.status === 403 ? "restricted" : "error", "Unable to load " + config.title, error && error.message || "The records could not be loaded. No data was changed.", function () { fetch(config); });
      return;
    }
    view.rows = Array.isArray(results[0].value.data) ? results[0].value.data : [];
    if (config.relationKeys) {
      view.relation = Object.fromEntries(relationKeys.map(function (key, index) {
        const result = results[index + 1];
        return [key, result.status === "fulfilled" && Array.isArray(result.value.data) ? result.value.data : null];
      }));
    } else view.relation = results[1].status === "fulfilled" && Array.isArray(results[1].value.data) ? results[1].value.data : null;
    const meta = document.querySelector(".ws-record-count"); if (meta) meta.textContent = view.rows.length + (view.rows.length === 1 ? " RECORD" : " RECORDS");
    render();
  }
  function open(key, query) {
    const config = pages[key]; if (!config) return false;
    view.key = key; view.query = query || ""; view.filter = "All"; view.page = 1; view.selectedId = null; view.rows = []; view.relation = null;
    fetch(config); return true;
  }
  function refresh() { if (active()) { view.cause = "refresh"; return fetch(pages[view.key]); } }
  function setQuery(query) { if (!active()) return; view.query = query; view.page = 1; view.cause = "search"; render(); }
  function leave() { ++view.version; view.key = null; view.rows = []; view.relation = null; }
  global.AquaFleetWorkspace = Object.freeze({ register: register, has: has, describe: describe, open: open, refresh: refresh, setQuery: setQuery, leave: leave, isCurrent: isCurrent });
})(window);
