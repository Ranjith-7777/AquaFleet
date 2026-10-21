/* Client-side CSV for the rows returned by an existing report endpoint. */
(function exposeAquaFleetReportCsv(global) {
  "use strict";

  function valueText(value) {
    if (value === null || value === undefined) return "";
    const text = String(value);
    // Spreadsheet programs may evaluate cells that begin with formula markers.
    return typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
  }

  function cell(value) {
    const text = valueText(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function serialize(columns, rows) {
    const lines = [columns.map((column) => cell(column[1])).join(",")];
    rows.forEach((row) => lines.push(columns.map((column) => cell(row[column[0]])).join(",")));
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  function filename(reportKey) {
    return "aquafleet-" + reportKey + "-report.csv";
  }

  function download(report, rows) {
    const csv = serialize(report.columns, rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename(report.key);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  global.AquaFleetReportCsv = Object.freeze({ serialize, filename, download });
})(window);
