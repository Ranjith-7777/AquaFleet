/* AquaFleet session authentication: login screen, boot gate and logout. */
(function initializeAquaFleetAuth(global) {
  "use strict";

  const Api = global.AquaFleetApi;
  const Ui = global.AquaFleetUi;

  /* The signed-in profile, held in memory only.
     Nothing goes to localStorage or sessionStorage: anything stored there
     survives the session, is readable by any script on the page, and would
     be a claim the browser makes about itself rather than a fact. The only
     authority on who is logged in is GET /api/auth/me. */
  const state = { user: null, checking: false, submitting: false, endingSession: false };

  /* ===================================================================
     View switching
     =================================================================== */

  function appShell() {
    return document.querySelector(".app-shell");
  }

  function showApplication() {
    document.body.classList.remove("auth-gate-active");
    const screen = document.getElementById("auth-screen");
    if (screen) screen.remove();
    const shell = appShell();
    if (shell) shell.removeAttribute("aria-hidden");
  }

  function hideApplication() {
    document.body.classList.add("auth-gate-active");
    const shell = appShell();
    /* aria-hidden as well as the CSS rule, so the dashboard behind the gate
       is not reachable by a screen reader or by tabbing into it. */
    if (shell) shell.setAttribute("aria-hidden", "true");
  }

  /* ===================================================================
     Neutral "checking your session" state
     =================================================================== */

  function renderChecking() {
    hideApplication();
    const existing = document.getElementById("auth-screen");
    if (existing) existing.remove();

    const panel = Ui.element("div", { className: "auth-checking", attributes: { role: "status" } });
    panel.appendChild(Ui.element("div", {
      className: "spinner-border text-primary", attributes: { "aria-hidden": "true" }
    }));
    panel.appendChild(Ui.element("p", { className: "mb-0", text: "Checking your session…" }));

    /* Presentation only: the landing ocean sits behind the boot state so the
       gate does not flash a white panel before the login screen arrives.
       landing.js fills this node; it stays empty if that file is absent. */
    const scene = Ui.element("div", {
      className: "af-scene", attributes: { "aria-hidden": "true" }
    });

    const screen = Ui.element("div", {
      className: "auth-screen landing auth-screen-checking",
      attributes: { id: "auth-screen" },
      children: [scene, panel]
    });
    document.body.appendChild(screen);
    if (global.AquaFleetLanding) global.AquaFleetLanding.mountChecking(screen);
  }

  /* ===================================================================
     Login screen
     =================================================================== */

  function fieldGroup(id, labelText, inputType, autoComplete) {
    const group = Ui.element("div", { className: "auth-field" });
    group.appendChild(Ui.element("label", {
      className: "auth-label", text: labelText, attributes: { for: id }
    }));
    const input = Ui.element("input", {
      className: "form-control auth-input",
      attributes: {
        id: id, name: id, type: inputType, autocomplete: autoComplete,
        required: "required", "aria-describedby": "auth-error"
      }
    });
    group.appendChild(input);
    return { group: group, input: input };
  }

  function setFormError(message) {
    const region = document.getElementById("auth-error");
    if (!region) return;
    Ui.clearElement(region);
    if (!message) { region.classList.remove("auth-error-visible"); return; }
    /* textContent, never innerHTML: the message can carry text from the API
       and must never be parsed as markup. */
    region.appendChild(Ui.element("span", { text: message }));
    region.classList.add("auth-error-visible");
  }

  /* The brand mark is an inline SVG so it inherits the landing palette and
     needs no extra asset request. Decorative only. */
  function brandMark() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "30");
    svg.setAttribute("height", "30");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", "16"); ring.setAttribute("cy", "16"); ring.setAttribute("r", "15");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "rgba(140,214,232,0.45)");
    ring.setAttribute("stroke-width", "1");
    svg.appendChild(ring);
    [["M6 19c3.2 0 3.2-4 6.4-4s3.2 4 6.4 4 3.2-4 6.4-4", "#7fd4e8"],
     ["M6 13c3.2 0 3.2-4 6.4-4s3.2 4 6.4 4 3.2-4 6.4-4", "rgba(226,244,249,0.85)"]]
      .forEach(function addWave(wave) {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", wave[0]);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", wave[1]);
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });
    return svg;
  }

  /* A block of instrumentation text: a dim caption above a value. */
  function capability(first, second) {
    return Ui.element("div", {
      children: [
        Ui.element("span", { text: first }),
        Ui.element("br"),
        Ui.element("span", { text: second })
      ]
    });
  }

  function renderLogin(initialMessage) {
    hideApplication();
    const existing = document.getElementById("auth-screen");
    if (existing) existing.remove();

    const username = fieldGroup("auth-username", "Username", "text", "username");
    username.group.className = "auth-field af-stagger-1";

    const password = fieldGroup("auth-password", "Password", "password", "current-password");
    password.group.className = "auth-field af-stagger-2";
    const reveal = Ui.element("button", {
      className: "auth-reveal", text: "Show",
      attributes: { type: "button", "aria-label": "Show password", "aria-pressed": "false" }
    });
    reveal.addEventListener("click", function togglePassword() {
      const hidden = password.input.getAttribute("type") === "password";
      password.input.setAttribute("type", hidden ? "text" : "password");
      reveal.textContent = hidden ? "Hide" : "Show";
      reveal.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
      reveal.setAttribute("aria-pressed", String(hidden));
      password.input.focus();
    });
    /* The toggle sits inside the field so it lines up with the input. */
    const passwordWrap = Ui.element("div", { className: "auth-password-wrap" });
    passwordWrap.appendChild(password.input);
    passwordWrap.appendChild(reveal);
    password.group.appendChild(passwordWrap);

    const errorRegion = Ui.element("p", {
      className: "auth-error",
      attributes: { id: "auth-error", role: "alert", "aria-live": "assertive" }
    });

    const submit = Ui.element("button", {
      className: "btn btn-primary auth-submit", text: "Sign In",
      attributes: { type: "submit" }
    });

    /* A real <form> means Enter submits from either field with no extra
       key handling, and the browser's own required-field semantics apply. */
    const form = Ui.element("form", {
      className: "auth-form",
      attributes: { id: "auth-form", novalidate: "novalidate" },
      children: [
        /* h2, not h1: the landing wordmark is the page's h1. */
        Ui.element("h2", { className: "auth-title", text: "Welcome to AquaFleet" }),
        Ui.element("p", { className: "auth-subtitle",
          text: "Access your marine research operations workspace." }),
        username.group, password.group, errorRegion, submit,
        Ui.element("div", {
          className: "af-support",
          children: [
            Ui.element("strong", { text: "Need access?" }),
            Ui.element("span", { text: "Contact your administrator." })
          ]
        })
      ]
    });
    form.addEventListener("submit", function onSubmit(event) {
      event.preventDefault();
      submitLogin(username.input, password.input, submit);
    });

    const card = Ui.element("div", { className: "auth-card", children: [form] });

    const panel = Ui.element("div", {
      className: "af-panel",
      children: [
        card,
        Ui.element("div", {
          className: "af-panel-note", attributes: { "aria-hidden": "true" },
          text: "INSTRUMENTATION SHOWN IS ILLUSTRATIVE / NON-LIVE"
        })
      ]
    });

    const wordmark = Ui.element("h1", { className: "af-wordmark" });
    const wordmarkInner = Ui.element("span");
    wordmarkInner.appendChild(document.createTextNode("Aqua"));
    wordmarkInner.appendChild(Ui.element("em", { text: "Fleet" }));
    wordmark.appendChild(wordmarkInner);

    const hero = Ui.element("div", {
      className: "af-hero",
      children: [
        Ui.element("p", {
          className: "af-eyebrow",
          children: [
            Ui.element("span", { text: "OCEAN INTELLIGENCE" }),
            Ui.element("br"),
            Ui.element("span", { text: "FOR MARINE RESEARCH" })
          ]
        }),
        wordmark,
        Ui.element("p", {
          className: "af-tagline",
          children: [
            Ui.element("span", { text: "Marine Research Fleet" }),
            Ui.element("br"),
            Ui.element("span", { text: "Management Platform" })
          ]
        }),
        Ui.element("p", { className: "af-hero-copy",
          text: "Vessels, missions, expeditions and marine zones — coordinated in one operational workspace." }),
        Ui.element("div", { className: "af-rule", attributes: { "aria-hidden": "true" } }),
        Ui.element("div", {
          className: "af-capabilities", attributes: { "aria-hidden": "true" },
          children: [
            capability("FLEET", "MANAGEMENT"),
            capability("MISSION", "PLANNING"),
            capability("EXPEDITION", "OPERATIONS")
          ]
        })
      ]
    });

    const brandbar = Ui.element("div", {
      className: "af-brandbar",
      children: [
        Ui.element("div", {
          className: "af-brand",
          children: [brandMark(), Ui.element("span", { className: "af-brand-name", text: "AquaFleet" })]
        }),
        Ui.element("div", { className: "af-brandbar-meta", text: "MARINE RESEARCH OPERATIONS" })
      ]
    });

    const landing = Ui.element("div", {
      className: "af-landing",
      children: [
        brandbar,
        Ui.element("div", {
          className: "af-grid",
          children: [hero, Ui.element("div", { className: "af-spacer" }), panel]
        }),
        Ui.element("div", {
          className: "af-footer", attributes: { "aria-hidden": "true" },
          children: [
            Ui.element("span", { text: "AQUAFLEET / MARINE RESEARCH FLEET MANAGEMENT" }),
            Ui.element("span", { text: "INTERNAL OPERATIONS ACCESS ONLY" })
          ]
        })
      ]
    });

    const screen = Ui.element("div", {
      className: "auth-screen landing", attributes: { id: "auth-screen" },
      children: [
        Ui.element("div", { className: "af-scene", attributes: { "aria-hidden": "true" } }),
        landing
      ]
    });
    document.body.appendChild(screen);

    /* Decorative scene + parallax. Guarded: if landing.js is missing or
       failed to parse, the form above is already complete and usable. */
    if (global.AquaFleetLanding) global.AquaFleetLanding.mount(screen);

    if (initialMessage) setFormError(initialMessage);
    username.input.focus();
  }

  /* ===================================================================
     Login submission
     =================================================================== */

  async function submitLogin(usernameInput, passwordInput, submitButton) {
    if (state.submitting) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    /* Client-side checks are a convenience only. The backend repeats every
       one of them, because a browser check can be skipped entirely. */
    if (!username && !password) { setFormError("Enter your username and password."); usernameInput.focus(); return; }
    if (!username) { setFormError("Enter your username."); usernameInput.focus(); return; }
    if (!password) { setFormError("Enter your password."); passwordInput.focus(); return; }

    state.submitting = true;
    setFormError("");
    Ui.setButtonPending(submitButton, true, "Signing in…");

    try {
      const response = await Api.post("/api/auth/login", {
        username: username, password: password
      });
      state.user = response.data || null;
      /* A new session exists, so the next loss of authentication must be
         able to switch screens again. */
      state.endingSession = false;
      /* Clear the field so the password does not sit in the DOM afterwards. */
      passwordInput.value = "";
      showApplication();
      renderUserControl();
      /* Only now does any dashboard or resource request happen. */
      if (global.AquaFleetApp) global.AquaFleetApp.renderDashboard();
    } catch (error) {
      state.user = null;
      setFormError(loginErrorMessage(error));
      passwordInput.focus();
      passwordInput.select();
    } finally {
      state.submitting = false;
      Ui.setButtonPending(submitButton, false);
    }
  }

  function loginErrorMessage(error) {
    if (!error) return "Sign in failed. Try again.";
    if (error.network) return "Could not reach the AquaFleet API. Is the backend running?";
    if (error.status === 401) return error.message || "Invalid username or password";
    if (error.status === 403) return error.message || "This account is inactive.";
    if (error.status === 400) {
      /* Surface the first field-level message so the person knows what to
         correct, without dumping the whole error object into the page. */
      const fields = error.errors && typeof error.errors === "object"
        ? Object.values(error.errors) : [];
      return fields.length ? String(fields[0]) : (error.message || "Check the details you entered.");
    }
    if (error.status >= 500) return "The server could not process the sign in. Try again shortly.";
    return error.message || "Sign in failed. Try again.";
  }

  /* ===================================================================
     Signed-in user control in the sidebar
     =================================================================== */

  function initialsOf(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderUserControl() {
    const mount = document.getElementById("user-control");
    if (!mount) return;
    Ui.clearElement(mount);
    if (!state.user) { mount.setAttribute("hidden", "hidden"); return; }
    mount.removeAttribute("hidden");

    /* The sidebar is 78px wide, so the trigger shows initials only and the
       full identity lives in the same flyout pattern the nav groups use. */
    const trigger = Ui.element("button", {
      className: "user-trigger", text: initialsOf(state.user.full_name),
      attributes: {
        type: "button", "aria-expanded": "false",
        "aria-label": "Account: " + state.user.full_name,
        "data-tooltip": state.user.full_name
      }
    });

    const details = Ui.element("div", {
      className: "user-details",
      children: [
        Ui.element("strong", { text: state.user.full_name }),
        Ui.element("small", { text: "@" + state.user.username }),
        Ui.element("span", { className: "user-role", text: state.user.role })
      ]
    });

    const logout = Ui.element("button", {
      className: "btn btn-outline-danger btn-sm user-logout", text: "Log out",
      attributes: { type: "button" }
    });
    logout.addEventListener("click", function onLogout() { performLogout(logout); });

    const flyout = Ui.element("div", {
      className: "user-flyout", children: [details, logout]
    });

    trigger.addEventListener("click", function toggle(event) {
      event.stopPropagation();
      const open = mount.classList.toggle("user-open");
      trigger.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", function outside(event) {
      if (!event.target.closest("#user-control")) {
        mount.classList.remove("user-open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function escape(event) {
      if (event.key === "Escape") {
        mount.classList.remove("user-open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    mount.appendChild(trigger);
    mount.appendChild(flyout);
  }

  /* ===================================================================
     Logout
     =================================================================== */

  async function performLogout(button) {
    Ui.setButtonPending(button, true, "Signing out…");
    let networkFailure = false;

    try {
      await Api.post("/api/auth/logout", {});
    } catch (error) {
      /* The server could not be told. Local state is cleared regardless -
         leaving a signed-in-looking dashboard on screen would be worse - but
         the person is told the truth: the server may still hold the session. */
      networkFailure = Boolean(error && error.network);
    } finally {
      Ui.setButtonPending(button, false);
    }

    clearLocalSession();
    renderLogin(networkFailure
      ? "Signed out on this device, but the server could not be reached to end the session."
      : "You have been signed out.");
  }

  function clearLocalSession() {
    state.user = null;
    /* Drop the header search query and the rows it was filtering, so no part
       of the previous session's data or intent reaches the next one. */
    if (global.AquaFleetApp && global.AquaFleetApp.clearSearch) {
      global.AquaFleetApp.clearSearch();
    }
    const mount = document.getElementById("user-control");
    if (mount) { Ui.clearElement(mount); mount.setAttribute("hidden", "hidden"); }
    /* Blank the dashboard and rail so no protected content is left painted
       behind the login screen - including after a browser Back. */
    const panel = document.getElementById("content-panel");
    const rail = document.getElementById("context-rail");
    const actions = document.getElementById("page-actions");
    if (panel) Ui.clearElement(panel);
    if (rail) Ui.clearElement(rail);
    if (actions) Ui.clearElement(actions);
    Ui.clearAlerts();
  }

  /* Called by api.js when a protected endpoint reports that authentication
     is gone - either 401, or 403 with error_code ACCOUNT_INACTIVE.

     The dashboard fires eight metric requests in parallel, so this can be
     invoked eight times in the same tick. The `endingSession` latch means
     the switch to the login screen happens exactly once: without it the
     login form would be torn down and rebuilt per failed request, throwing
     away focus and any message already shown. The latch is released by
     renderLogin's caller below, once the screen is in place. */
  function handleUnauthorized(reason) {
    if (state.endingSession) return;
    if (!state.user && document.getElementById("auth-screen")) return;

    /* Held until the next successful sign-in or boot, NOT released at the
       end of this function: the parallel rejections arrive in separate
       microtasks, so a latch released synchronously here would not stop
       them. */
    state.endingSession = true;

    /* Protected content is removed before anything else, so nothing from the
       previous session stays painted while the login screen mounts. */
    clearLocalSession();
    renderLogin(reason === "inactive"
      ? "This account is inactive. Contact an administrator."
      : "Your session has ended. Sign in again to continue.");
  }

  /* ===================================================================
     Boot gate
     =================================================================== */

  async function boot() {
    if (state.checking) return;
    state.checking = true;
    state.endingSession = false;
    renderChecking();

    try {
      const response = await Api.get("/api/auth/me");
      state.user = response.data || null;
      showApplication();
      renderUserControl();
      if (global.AquaFleetApp) global.AquaFleetApp.renderDashboard();
    } catch (error) {
      state.user = null;
      /* 401 here is the ordinary "not signed in yet" answer, so it gets a
         clean form rather than an error. A network failure is different and
         is worth saying out loud. */
      renderLogin(error && error.network
        ? "Could not reach the AquaFleet API. Is the backend running?"
        : "");
    } finally {
      state.checking = false;
    }
  }

  Api.setUnauthorizedHandler(handleUnauthorized);

  global.AquaFleetAuth = Object.freeze({
    boot: boot,
    currentUser: function currentUser() {
      return state.user ? Object.assign({}, state.user) : null;
    },
    isAuthenticated: function isAuthenticated() { return Boolean(state.user); },
    handleUnauthorized: handleUnauthorized
  });
})(window);
