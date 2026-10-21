"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frontend = path.resolve(__dirname, "..");
class Node {
  constructor(tag = "div") {
    this.tag = tag; this.children = []; this.parentNode = null; this.attributes = {};
    this.className = ""; this.textContent = ""; this.dataset = {}; this.listeners = {};
    this.classList = { add: name => { this.className += " " + name; },
      remove: name => { this.className = this.className.replace(name, ""); },
      toggle: () => {}, contains: () => false };
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  prepend(child) { this.children.unshift(child); child.parentNode = this; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  get firstChild() { return this.children[0]; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector(selector) {
    const name = selector.slice(1);
    for (const child of this.children) {
      if (child.className.split(" ").includes(name)) return child;
      const match = child.querySelector(selector);
      if (match) return match;
    }
    return null;
  }
  replaceChild(next, previous) {
    const index = this.children.indexOf(previous);
    this.children[index] = next; next.parentNode = this; previous.parentNode = null;
  }
}
function elements(node, className) {
  const result = [];
  if (node.className.split(" ").includes(className)) result.push(node);
  node.children.forEach(child => result.push(...elements(child, className)));
  return result;
}
function content(node) { return node.textContent + node.children.map(content).join(" "); }
const ids = Object.fromEntries([
  "health-indicator", "health-indicator-text", "global-search", "search-clear",
  "page-title", "page-subtitle", "page-actions", "content-panel", "context-rail", "alert-region"
].map(id => [id, new Node()]));
const document = {
  body: new Node(),
  createElement: tag => new Node(tag),
  getElementById: id => ids[id],
  querySelectorAll: () => [],
  querySelector: selector => ids["page-actions"].querySelector(selector) || ids["content-panel"].querySelector(selector),
  addEventListener: () => {}
};
const sample = {
  vessels: [{ vessel_id: 1 }],
  vehicles: [{ vehicle_name: "ROV A", status: "Available" }, { vehicle_name: "ROV B", status: "Maintenance" }],
  expeditions: [{ title: "Reef survey", status: "Active", vessel_name: "RV One", mission_count: 1,
    start_date: "2026-01-01", end_date: "2026-02-01" }],
  missions: [{ mission_id: 7, mission_type: "Reef imaging", expedition_title: "Reef survey",
    zone_name: "Shelf", start_time: "2026-01-12 09:00:00", status: "In Progress" }],
  samples: [{ sample_id: 1 }],
  incidents: [{ severity: "High" }],
  "battery-packs": [{ health_status: "Fair" }],
  "inspection-tasks": [{ status: "Pending" }]
};
let failed = new Set();
let requests = [];
let opened = null;
const Ui = {
  element(tag, options = {}) {
    const node = new Node(tag);
    node.className = options.className || "";
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.attributes) Object.entries(options.attributes).forEach(([key, value]) => node.setAttribute(key, value));
    (options.children || []).forEach(child => node.appendChild(child));
    return node;
  },
  clearElement(node) { while (node.firstChild) node.removeChild(node.firstChild); },
  setPageHeader(title, subtitle) { ids["page-title"].textContent = title; ids["page-subtitle"].textContent = subtitle; },
  clearAlerts() {}, showAlert(type, message) { ids["alert-region"].textContent = type + ":" + message; }, renderLoading(node) { Ui.clearElement(node); },
  setButtonPending(node, pending) { node.disabled = pending; },
  nullableText(value, fallback = "—") { return value == null || value === "" ? fallback : String(value); },
  formatDate(value) { return value || "—"; }, formatDateTime(value) { return value || "—"; },
  statusBadge(value) { return Ui.element("span", { text: value }); },
  openModal(options) { opened = options; }
};
const Resources = { byKey: Object.fromEntries(Object.keys(sample).map(key =>
  [key, { key, path: "/api/" + key, keys: ["mission_id"], columns: [
    { field: "mission_type" }, { field: "expedition_title" }, { field: "zone_name" }
  ], details: [{ field: "status" }], title: "Mission" }])) };
const window = {
  AquaFleetApi: { get: async url => {
    requests.push(url);
    if (failed.has(url)) throw Error("API unavailable");
    if (url === "/api/health") return { payload: { success: true } };
    if (url === "/api/health/database") return { payload: { success: true, database: "aquafleet_db" } };
    return { data: sample[url.slice(5)], payload: { count: sample[url.slice(5)].length } };
  } },
  AquaFleetUi: Ui, AquaFleetResources: Resources,
  AquaFleetMasterData: { can: () => false },
  AquaFleetReports: {}, matchMedia: () => ({ matches: true })
};
const context = vm.createContext({ window, document, performance, setTimeout, requestAnimationFrame: callback => callback(performance.now()) });
vm.runInContext(fs.readFileSync(path.join(frontend, "js", "app.js"), "utf8"), context);

(async () => {
  await window.AquaFleetApp.renderDashboard();
  assert.equal(elements(ids["content-panel"], "dashboard-kpi").length, 4);
  assert.match(content(ids["content-panel"]), /Active Operations/);
  assert.match(content(ids["content-panel"]), /50%/);
  assert.match(content(ids["content-panel"]), /Recorded Incidents/);
  assert.doesNotMatch(content(ids["content-panel"]), /Open incidents|Live Alerts/);
  assert.match(content(ids["content-panel"]), /Database connected/);
  const view = elements(ids["content-panel"], "activity-action")[0];
  view.listeners.click();
  assert.equal(opened.title, "Mission Details");
  assert.equal(opened.footer, null);
  const missionRequests = requests.filter(url => url === "/api/missions").length;
  await window.AquaFleetApp.mutationComplete("missions", "Mission updated successfully");
  assert.equal(requests.filter(url => url === "/api/missions").length, missionRequests + 1);
  assert.match(ids["alert-region"].textContent, /Mission updated successfully/);
  const before = requests.length;
  window.AquaFleetApp.getState().searchQuery = "reef";
  assert.equal(requests.length, before);

  failed = new Set(["/api/missions", "/api/vehicles", "/api/health/database"]);
  await window.AquaFleetApp.renderDashboard();
  const kpis = elements(ids["content-panel"], "dashboard-kpi");
  assert.match(content(kpis[2]), /Unavailable/);
  assert.match(content(kpis[3]), /Unavailable/);
  assert.match(content(ids["content-panel"]), /Database unavailable/);
  assert.match(content(ids["content-panel"]), /Mission data unavailable/);
  assert.doesNotMatch(content(kpis[2]), /\b0\b/);
  console.log("Dashboard frontend checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
