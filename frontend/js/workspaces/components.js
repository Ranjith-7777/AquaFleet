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
  function pill(value, tone) { return el("span", "ws-pill ws-pill-" + (tone || "grey"), value == null ? "—" : String(value)); }
  function metric(item) {
    const card = el("article", "ws-kpi ws-kpi-" + item.tone);
    card.appendChild(el("span", "ws-kpi-icon", item.icon));
    const content = el("div", "ws-kpi-content");
    content.append(el("p", "ws-kpi-label", item.label), el("strong", "ws-kpi-value", item.value), el("p", "ws-kpi-note", item.note));
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
  global.AquaFleetWorkspaceComponents = Object.freeze({ el: el, button: button, pill: pill, metric: metric, state: state, fact: fact, action: action });
})(window);
