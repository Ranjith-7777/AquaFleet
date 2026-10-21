/* DOM building blocks for register/detail workspaces. */
(function exposeWorkspaceComponents(global) {
  "use strict";
  const Ui = global.AquaFleetUi;
  function el(tag, className, text) { return Ui.element(tag, { className: className, text: text }); }
  function button(label, className, handler, disabled) {
    const node = Ui.element("button", { className: className, text: label, attributes: { type: "button" } });
    node.disabled = Boolean(disabled);
    if (handler) node.addEventListener("click", handler);
    return node;
  }
  function pill(value, tone) { const node = el("span", "ws-pill ws-pill-" + (tone || "grey"), value == null ? "—" : String(value)); node.title = node.textContent; return node; }
  function metric(item) {
    const card = el("article", "ws-kpi ws-kpi-" + item.tone);
    card.appendChild(el("span", "ws-kpi-icon", item.icon));
    const content = el("div", "ws-kpi-content");
    const label = el("p", "ws-kpi-label", item.label), note = el("p", "ws-kpi-note", item.note);
    label.title = String(item.label); note.title = String(item.note == null ? "" : item.note);
    content.append(label, el("strong", "ws-kpi-value", item.value), note);
    const track = el("div", "ws-kpi-track");
    const fill = el("i", "ws-kpi-fill");
    fill.style.width = Math.max(0, Math.min(100, Number(item.ratio) || 0)) + "%";
    track.appendChild(fill); content.appendChild(track); card.appendChild(content);
    return card;
  }
  function state(target, kind, title, message, retry) {
    Ui.clearElement(target);
    const block = el("div", "ws-state ws-state-" + kind);
    block.append(el("span", "ws-state-icon", kind === "error" ? "!" : kind === "loading" ? "◌" : "⌕"), el("strong", "ws-state-title", title), el("small", "ws-state-copy", message));
    if (retry) block.appendChild(button("Retry", "ws-state-retry", retry));
    target.appendChild(block);
  }
  function fact(label, value, wide) {
    const card = el("div", "ws-fact" + (wide ? " ws-fact-wide" : ""));
    card.append(el("span", "ws-fact-label", label), el("strong", "ws-fact-value", value));
    return card;
  }
  function action(label, tone, handler) { return button(label, "ws-link ws-link-" + tone, handler); }
  function detailCard(options) {
    const card = el("article", "ws-card ws-detail"), header = el("div", "ws-detail-head");
    header.append(el("h2", "", options.title), el("span", "ws-detail-ref", options.row ? "#" + String(options.id).padStart(2, "0") : "—")); card.appendChild(header);
    const body = el("div", "ws-detail-body");
    if (!options.row) { state(body, "empty", "No record selected", "Select a record from the register."); card.appendChild(body); return card; }
    body.append(el("strong", "ws-detail-title", options.name), el("p", "ws-detail-sub", options.subtitle), pill(options.status, options.tone));
    const facts = el("div", "ws-facts"); options.facts.forEach(function (item) { facts.appendChild(fact(item[0], item[1])); }); body.appendChild(facts);
    options.fields.forEach(function (item) { body.appendChild(fact(item[0], item[1], true)); });
    body.appendChild(el("p", "ws-section-label", options.linkedLabel));
    const list = el("div", "ws-linked");
    if (options.linked === null) {
      list.append(el("p", "ws-linked-empty", "Related data unavailable."), button("Retry", "ws-state-retry", function () { global.AquaFleetWorkspace.refresh(); }));
    } else if (!options.linked.length) list.appendChild(el("p", "ws-linked-empty", options.emptyLinked));
    else options.linked.forEach(function (item) {
      const row = el("div", "ws-linked-row"), copy = el("div", "ws-linked-copy");
      copy.append(el("strong", "", item.title), el("small", "", item.meta)); row.appendChild(copy);
      if (item.status) row.appendChild(pill(item.status, item.tone)); list.appendChild(row);
    });
    body.appendChild(list); card.appendChild(body);
    const master = global.AquaFleetMasterData, key = options.key;
    if (master.can(key, "update") || master.can(key, "delete")) {
      const footer = el("div", "ws-detail-footer"), actions = el("div", "ws-detail-actions");
      if (master.can(key, "update")) actions.appendChild(button(options.editLabel, "ws-primary", function () { master.openEdit(key, options.row); }));
      if (master.can(key, "delete")) actions.appendChild(button("Delete", "ws-danger", function () { master.openDelete(key, options.row); }));
      footer.append(actions, el("p", "ws-detail-note", options.note)); card.appendChild(footer);
    }
    return card;
  }
  /* One tab strip for every page of a sidebar group. It is read from the
     sidebar itself, so the strip and the navigation can never disagree and
     every page in a group shows the same complete set of sibling pages. */
  function sectionTabs(currentKey) {
    const current = document.querySelector('.nav-flyout [data-view="' + currentKey + '"]');
    const group = current && current.closest(".nav-flyout");
    if (!group) return null;
    const tabs = el("nav", "ws-tabs"); tabs.setAttribute("aria-label", "Section pages");
    group.querySelectorAll("[data-view]").forEach(function tab(link) {
      const key = link.dataset.view, active = key === currentKey;
      const node = button(link.dataset.title || link.textContent.trim(), "ws-tab" + (active ? " active" : ""), function () {
        if (!active) global.AquaFleetApp.navigate(key);
      });
      if (active) node.setAttribute("aria-current", "page");
      tabs.appendChild(node);
    });
    return tabs;
  }
  global.AquaFleetWorkspaceComponents = Object.freeze({ el: el, button: button, pill: pill, metric: metric, state: state, fact: fact, action: action, detailCard: detailCard, sectionTabs: sectionTabs });
})(window);
