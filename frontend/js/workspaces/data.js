/* Pure helpers shared by database-backed register workspaces. */
(function exposeWorkspaceData(global) {
  "use strict";

  function normalize(value) { return String(value == null ? "" : value).trim().toLocaleLowerCase(); }
  function matches(row, fields, query) {
    const needle = normalize(query);
    return !needle || fields.some(function field(name) { return normalize(row[name]).includes(needle); });
  }
  function groupBy(rows, field) {
    const groups = new Map();
    rows.forEach(function add(row) {
      const key = String(row[field]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return groups;
  }
  function pageOf(rows, page, size) {
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const current = Math.min(Math.max(1, page), pages);
    return { rows: rows.slice((current - 1) * size, current * size), page: current, pages: pages };
  }
  global.AquaFleetWorkspaceData = Object.freeze({ normalize: normalize, matches: matches, groupBy: groupBy, pageOf: pageOf });
})(window);
