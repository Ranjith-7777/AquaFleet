/* Sidebar notification bell. Rows are written by database triggers; this file
   only reads them and marks them read through /api/notifications. */
(function exposeAquaFleetNotifications(global) {
  "use strict";
  const Api = global.AquaFleetApi, Ui = global.AquaFleetUi, P = global.AquaFleetPermissions;
  const state = { rows: [], unread: 0, open: false, loaded: false, busy: false, failed: false };

  function mount() { return document.getElementById("notification-control"); }
  function canMark() { return P.can("notifications", "update"); }

  function badgeLabel(count) { return count > 99 ? "99+" : String(count); }

  function itemNode(row) {
    const item = Ui.element("li", { className: "notif-item notif-" + String(row.severity).toLowerCase() + (row.is_read ? " notif-read" : "") });
    item.appendChild(Ui.element("span", { className: "notif-dot", attributes: { "aria-hidden": "true" } }));
    const copy = Ui.element("div", { className: "notif-copy" });
    copy.append(
      Ui.element("strong", { text: row.title }),
      Ui.element("span", { text: row.message }),
      Ui.element("small", { text: row.category + " · " + Ui.formatDateTime(row.created_at) })
    );
    item.appendChild(copy);
    if (!row.is_read && canMark()) {
      const button = Ui.element("button", { className: "notif-mark", text: "Mark read", attributes: { type: "button", "aria-label": "Mark notification read: " + row.title } });
      button.addEventListener("click", function onMark() { markRead(row.notification_id); });
      item.appendChild(button);
    }
    return item;
  }

  function render() {
    const host = mount();
    if (!host) return;
    Ui.clearElement(host);
    if (!state.loaded && !state.failed) { host.setAttribute("hidden", "hidden"); return; }
    host.removeAttribute("hidden");
    host.classList.toggle("notif-open", state.open);

    const trigger = Ui.element("button", {
      className: "notif-trigger", attributes: {
        type: "button", "aria-expanded": String(state.open), "aria-haspopup": "true",
        "aria-label": "Notifications, " + state.unread + " unread", "data-tooltip": "Notifications"
      }
    });
    trigger.appendChild(Ui.element("span", { className: "notif-bell", text: "🔔", attributes: { "aria-hidden": "true" } }));
    if (state.unread > 0) trigger.appendChild(Ui.element("span", { className: "notif-badge", text: badgeLabel(state.unread) }));
    trigger.addEventListener("click", function onToggle(event) {
      event.stopPropagation(); state.open = !state.open; render();
      if (state.open) refresh();
    });

    const flyout = Ui.element("div", { className: "notif-flyout", attributes: { role: "region", "aria-label": "Notifications" } });
    const head = Ui.element("div", { className: "notif-head" });
    head.appendChild(Ui.element("strong", { text: "Notifications" }));
    if (state.unread > 0 && canMark()) {
      const all = Ui.element("button", { className: "notif-mark", text: "Mark all read", attributes: { type: "button" } });
      all.addEventListener("click", markAllRead); head.appendChild(all);
    }
    flyout.appendChild(head);
    if (state.failed) {
      flyout.appendChild(Ui.element("p", { className: "notif-empty", text: "Notifications could not be loaded." }));
    } else if (!state.rows.length) {
      flyout.appendChild(Ui.element("p", { className: "notif-empty", text: "No notifications. High or critical incidents, poor batteries and due maintenance appear here." }));
    } else {
      const list = Ui.element("ul", { className: "notif-list" });
      state.rows.forEach(function add(row) { list.appendChild(itemNode(row)); });
      flyout.appendChild(list);
    }
    host.append(trigger, flyout);
  }

  async function refresh() {
    if (state.busy) return;
    state.busy = true;
    try {
      const response = await Api.get("/api/notifications");
      state.rows = Array.isArray(response.data) ? response.data : [];
      state.unread = Number(response.payload.unread_count) || 0;
      state.loaded = true; state.failed = false;
    } catch (error) {
      /* A missing table or an outage must not disturb the rest of the app. */
      if (!state.loaded) state.failed = true;
    } finally { state.busy = false; render(); }
  }

  async function markRead(id) {
    try { await Api.request("/api/notifications/" + id + "/read", { method: "PATCH" }); } catch (error) { /* list is re-read below */ }
    await refresh();
  }
  async function markAllRead() {
    try { await Api.request("/api/notifications/read-all", { method: "PATCH" }); } catch (error) { /* list is re-read below */ }
    await refresh();
  }

  function reset() { state.rows = []; state.unread = 0; state.open = false; state.loaded = false; state.failed = false; render(); }

  document.addEventListener("click", function outside(event) {
    if (state.open && !event.target.closest("#notification-control")) { state.open = false; render(); }
  });
  document.addEventListener("keydown", function escape(event) {
    if (event.key === "Escape" && state.open) { state.open = false; render(); }
  });
  global.setInterval(function poll() { if (state.loaded && document.visibilityState === "visible") refresh(); }, 60000);

  global.AquaFleetNotifications = Object.freeze({ refresh: refresh, reset: reset });
})(window);
