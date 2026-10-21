/* Safe, reusable DOM and formatting helpers for AquaFleet. */
(function exposeAquaFleetUi(global) {
  "use strict";

  const STATUS_CLASSES = {
    generic: { Active: "success", Inactive: "secondary" },
    mission: { Planned: "info", "In Progress": "primary", Completed: "success", Aborted: "danger" },
    expedition: { Planned: "info", Active: "primary", Completed: "success", Cancelled: "secondary" },
    vehicle: { Available: "success", Deployed: "primary", Maintenance: "warning", Retired: "secondary" },
    battery: { Excellent: "success", Good: "primary", Fair: "warning", Poor: "danger", Replace: "dark" },
    custody: { Collected: "info", Sealed: "primary", "In Transit": "warning", Received: "primary", Stored: "success", Released: "secondary", Disposed: "dark" },
    severity: { Low: "success", Moderate: "warning", High: "danger", Critical: "dark" },
    priority: { Low: "secondary", Medium: "info", High: "warning", Urgent: "danger" },
    inspection: { Pending: "info", "In Progress": "primary", Completed: "success", Cancelled: "secondary" }
  };

  function element(tagName, options) {
    const node = document.createElement(tagName);
    const settings = options || {};
    if (settings.className) node.className = settings.className;
    if (settings.text !== undefined && settings.text !== null) {
      node.textContent = String(settings.text);
    }
    if (settings.attributes) {
      Object.entries(settings.attributes).forEach(function setAttribute(entry) {
        node.setAttribute(entry[0], String(entry[1]));
      });
    }
    if (settings.children) {
      settings.children.forEach(function appendChild(child) {
        if (child) node.appendChild(child);
      });
    }
    return node;
  }

  function clearElement(target) {
    if (!target) return;
    while (target.firstChild) target.removeChild(target.firstChild);
  }

  function setPageHeader(title, subtitle) {
    document.getElementById("page-title").textContent = title || "AquaFleet";
    document.getElementById("page-subtitle").textContent = subtitle || "";
  }

  function clearAlerts() {
    clearElement(document.getElementById("alert-region"));
  }

  function showAlert(type, message) {
    const region = document.getElementById("alert-region");
    clearElement(region);
    const alert = element("div", {
      className: "alert alert-" + (type || "info") + " alert-dismissible fade show",
      attributes: { role: "alert" }
    });
    alert.appendChild(element("span", { text: message }));
    alert.appendChild(element("button", {
      className: "btn-close",
      attributes: {
        type: "button",
        "data-bs-dismiss": "alert",
        "aria-label": "Close"
      }
    }));
    region.appendChild(alert);
    if (global.AquaFleetMotion) global.AquaFleetMotion.autoDismiss(alert);   // success toasts leave on their own
    return alert;
  }

  function renderState(container, className, title, message, spinner) {
    clearElement(container);
    container.setAttribute("aria-busy", spinner ? "true" : "false");
    const panel = element("div", {
      className: "state-panel " + className,
      attributes: { role: spinner ? "status" : "region" }
    });
    if (spinner) {
      panel.appendChild(element("div", {
        className: "spinner-border text-primary",
        attributes: { "aria-hidden": "true" }
      }));
    }
    if (title) panel.appendChild(element("h2", { className: "h5 mb-2", text: title }));
    if (message) panel.appendChild(element("p", { className: "text-secondary mb-0", text: message }));
    container.appendChild(panel);
    return panel;
  }

  function setButtonPending(button, pending, pendingText) {
    if (!button) return;
    if (pending) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = pendingText || "Working…";
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function appendContent(target, content) {
    if (content === undefined || content === null) return;
    if (content instanceof Node) target.appendChild(content);
    else target.appendChild(element("p", { text: content }));
  }

  function openModal(options) {
    const settings = options || {};
    const modalElement = document.getElementById("app-modal");
    const title = document.getElementById("app-modal-title");
    const body = document.getElementById("app-modal-body");
    const footer = document.getElementById("app-modal-footer");
    title.textContent = settings.title || "AquaFleet";
    clearElement(body);
    clearElement(footer);
    appendContent(body, settings.body);
    appendContent(footer, settings.footer);
    footer.hidden = !settings.footer;
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
  }

  function closeModal() {
    const modalElement = document.getElementById("app-modal");
    const instance = bootstrap.Modal.getInstance(modalElement);
    if (instance) instance.hide();
  }

  function formatDate(value) {
    if (value === null || value === undefined || value === "") return "—";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match[3] + "/" + match[2] + "/" + match[1] : String(value);
  }

  function formatDateTime(value) {
    if (value === null || value === undefined || value === "") return "—";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return String(value);
    return match[3] + "/" + match[2] + "/" + match[1] + " " + match[4] + ":" + match[5] + ":" + (match[6] || "00");
  }

  function toDateTimeLocal(apiValue) {
    if (apiValue === null || apiValue === undefined || apiValue === "") return "";
    const value = String(apiValue);
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? value.replace(" ", "T") : value;
  }

  function fromDateTimeLocal(inputValue) {
    if (inputValue === null || inputValue === undefined || inputValue === "") return null;
    const value = String(inputValue);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value.replace("T", " ") + ":00";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return value.replace("T", " ");
    return value;
  }

  function nullableText(value, fallback) {
    return value === null || value === undefined || value === ""
      ? (fallback === undefined ? "—" : fallback)
      : String(value);
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(value);
  }

  function statusBadge(value, category) {
    const map = STATUS_CLASSES[category] || STATUS_CLASSES.generic;
    const color = map[value] || "secondary";
    return element("span", {
      className: "badge rounded-pill text-bg-" + color + " status-badge",
      text: nullableText(value, "Unknown")
    });
  }

  global.AquaFleetUi = Object.freeze({
    element: element,
    clearElement: clearElement,
    setPageHeader: setPageHeader,
    showAlert: showAlert,
    clearAlerts: clearAlerts,
    renderLoading: function renderLoading(container, message) { return renderState(container, "loading-state", "Loading", message || "Loading AquaFleet data…", true); },
    renderEmpty: function renderEmpty(container, title, message) { return renderState(container, "empty-state", title || "Nothing here yet", message || "No records are available.", false); },
    renderError: function renderError(container, title, message) { return renderState(container, "error-state", title || "Something went wrong", message || "The content could not be loaded.", false); },
    renderPlaceholder: function renderPlaceholder(container, title, message) { return renderState(container, "placeholder-state", title || "Coming soon", message || "This view will be added in the next phase.", false); },
    setButtonPending: setButtonPending,
    openModal: openModal,
    closeModal: closeModal,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    toDateTimeLocal: toDateTimeLocal,
    fromDateTimeLocal: fromDateTimeLocal,
    nullableText: nullableText,
    formatNumber: formatNumber,
    statusBadge: statusBadge
  });
})(window);
