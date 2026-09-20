"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tag, options = {}) {
    this.tag = tag; this.children = []; this.className = options.className || "";
    this.ownText = options.text == null ? "" : String(options.text);
    this.attributes = {}; this.dataset = {}; this.listeners = {}; this.disabled = false;
    this.classList = { toggle: (name, on) => {
      const values = new Set(this.className.split(/\s+/).filter(Boolean));
      if (on) values.add(name); else values.delete(name);
      this.className = [...values].join(" ");
    } };
    for (const [name, value] of Object.entries(options.attributes || {})) this.setAttribute(name, value);
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(""); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) this.dataset[name.slice(5)] = String(value);
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelector(selector) { return this.descendants().find((child) => selector.startsWith(".") && child.className.split(" ").includes(selector.slice(1))); }
  querySelectorAll(selector) { return this.descendants().filter((child) => child.tag === selector); }
}
const root = path.join(__dirname, "..");
let mode = "success";
const pending = [];
const rail = new Element("aside");
const window = {
  AquaFleetApi: { async get() {
    if (mode === "race") return new Promise((resolve) => pending.push(resolve));
    if (mode === "error") throw new Error("Report API failed");
    return { data: mode === "empty" ? [] : [{ expedition_id: 9, title: "<b>Literal report</b>", vessel_name: "Research Ship", status: "Active", mission_count: 0 }] };
  } },
  AquaFleetUi: {
    element: (tag, options) => new Element(tag, options),
    clearElement: (node) => { node.children = []; node.ownText = ""; },
    statusBadge: (value) => new Element("span", { text: value }),
    formatDate: (value) => value || "—",
    formatDateTime: (value) => value || "—",
    formatNumber: (value) => value == null ? "—" : String(value),
    nullableText: (value) => value == null ? "—" : String(value)
  },
  AquaFleetReportCsv: { download() {} }
};
const document = { getElementById: (id) => id === "context-rail" ? rail : null };
const context = vm.createContext({ window, document });
vm.runInContext(fs.readFileSync(path.join(root, "js", "reporting.js"), "utf8"), context);
const R = window.AquaFleetReports;
const settle = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  let host = new Element("main");
  R.render(host); await settle();
  assert.equal(host.querySelector(".report-table").querySelectorAll("tr").length, 2);
  assert.match(host.textContent, /<b>Literal report<\/b>/);
  assert.equal(host.descendants().some((node) => node.tag === "b"), false);
  assert.match(host.textContent, /Showing 1 of 1 returned rows/);
  assert.equal(host.querySelector(".report-export").disabled, false);
  R.setQuery("absent");
  assert.match(host.textContent, /No matching rows/);
  assert.match(host.textContent, /Showing 0 of 1 returned rows/);
  assert.equal(host.querySelector(".report-export").disabled, false);

  mode = "empty"; host = new Element("main");
  R.render(host); await settle();
  assert.match(host.textContent, /No report rows/);
  assert.match(host.textContent, /Showing 0 of 0 returned rows/);
  assert.equal(host.querySelector(".report-export").disabled, true);

  mode = "error"; host = new Element("main");
  R.render(host); await settle();
  assert.match(host.textContent, /Unable to load report/);
  assert.match(host.textContent, /Report API failed/);
  assert.doesNotMatch(host.textContent, /No report rows|Showing 0 of 0 returned rows/);
  assert.equal(host.querySelector(".report-export").disabled, true);

  mode = "race"; host = new Element("main");
  R.render(host);
  host.querySelector(".report-tabs").querySelectorAll("button")[1].listeners.click();
  pending[1]({ data: [{ mission_id: 55, mission_type: "New mission", status: "Planned" }] });
  await settle();
  pending[0]({ data: [{ expedition_id: 99, title: "Stale expedition" }] });
  await settle();
  assert.match(host.textContent, /Mission Operations/);
  assert.match(host.textContent, /New mission/);
  assert.doesNotMatch(host.textContent, /Stale expedition/);
  assert.equal(host.querySelector(".report-export").disabled, false);
  console.log("Batch 7 report loading, data, empty, error, race and safe rendering checks passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
