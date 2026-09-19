/* AquaFleet landing scene: decorative ocean/vessel/HUD layer, ambient motion
   and desktop parallax for the unauthenticated login screen.

   This file is PRESENTATION ONLY and entirely optional. auth.js calls
   AquaFleetLanding.mount(screen) behind an existence guard, every public
   method swallows its own errors, and the entrance choreography lives in
   landing.css. If this script is missing, blocked or throws, the login form
   still renders, still validates and still submits — it simply loses the
   ocean, the vessel and the radar.

   It touches no application state, no API, no session and no authenticated
   DOM. */
(function initializeAquaFleetLanding(global) {
  "use strict";

  var ASSETS = "assets/landing/";

  /* First mount gets the full 2.3-2.7s entrance. renderLogin() is also called
     on logout and on session expiry; replaying the entrance there would delay
     an error message the person needs immediately, so later mounts render in
     their final state. */
  var hasEnteredOnce = false;

  function prefersReducedMotion() {
    try {
      return global.matchMedia
        && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (error) {
      return false;
    }
  }

  /* ===================================================================
     Scene markup

     Built as a string and assigned to innerHTML. This is safe here and
     only here: the markup is a static literal in this file with no
     interpolation of any kind — no API data, no user input, nothing from
     the URL. auth.js continues to build every text-bearing node with
     Ui.element/textContent.
     =================================================================== */

  function oceanMarkup() {
    return '' +
      '<div class="af-ocean">' +
        '<svg viewBox="0 0 1440 820" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
          '<defs>' +
            '<filter id="afSeaSwell" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
              '<feTurbulence type="fractalNoise" baseFrequency="0.0035 0.009" numOctaves="4" seed="11" result="t"></feTurbulence>' +
              '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.19  0 0 0 0 0.51  0 0 0 0 0.58  0.9 0.5 0 0 -0.22" result="c"></feColorMatrix>' +
              '<feGaussianBlur in="c" stdDeviation="1.2"></feGaussianBlur>' +
            '</filter>' +
            '<filter id="afSeaGrain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
              '<feTurbulence type="fractalNoise" baseFrequency="0.42 0.16" numOctaves="4" seed="4" result="t"></feTurbulence>' +
              '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.83  0 0 0 0 0.88  1.1 0.4 0 0 -0.55"></feColorMatrix>' +
            '</filter>' +
            '<filter id="afSeaStreak" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
              '<feTurbulence type="fractalNoise" baseFrequency="0.013 0.026" numOctaves="3" seed="19" result="t"></feTurbulence>' +
              '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.79  0 0 0 0 0.85  1.3 0.3 0 0 -0.86"></feColorMatrix>' +
              '<feGaussianBlur stdDeviation="0.6"></feGaussianBlur>' +
            '</filter>' +
            '<radialGradient id="afSunGlint" cx="0.5" cy="0.36" r="0.52">' +
              '<stop offset="0" stop-color="rgba(120,214,238,0.17)"></stop>' +
              '<stop offset="0.55" stop-color="rgba(74,164,190,0.06)"></stop>' +
              '<stop offset="1" stop-color="rgba(74,164,190,0)"></stop>' +
            '</radialGradient>' +
            '<radialGradient id="afVign" cx="0.5" cy="0.42" r="0.78">' +
              '<stop offset="0.35" stop-color="rgba(2,13,20,0)"></stop>' +
              '<stop offset="0.78" stop-color="rgba(2,13,20,0.55)"></stop>' +
              '<stop offset="1" stop-color="rgba(1,9,14,0.9)"></stop>' +
            '</radialGradient>' +
          '</defs>' +
          '<rect width="1440" height="820" fill="#06222f"></rect>' +
          '<rect width="1440" height="820" fill="url(#afSunGlint)"></rect>' +
          '<g style="animation:af-swell 32s ease-in-out infinite alternate;transform-origin:50% 50%;">' +
            '<rect x="-80" y="-80" width="1600" height="980" filter="url(#afSeaSwell)" opacity="0.62"></rect>' +
          '</g>' +
          '<g style="animation:af-swell2 36s ease-in-out infinite alternate;">' +
            '<rect x="-80" y="-80" width="1600" height="980" filter="url(#afSeaStreak)" opacity="0.42" style="mix-blend-mode:screen;" transform="rotate(-8 720 410)"></rect>' +
          '</g>' +
          '<rect width="1440" height="820" filter="url(#afSeaGrain)" opacity="0.3" style="mix-blend-mode:soft-light;"></rect>' +
          '<g style="animation:af-caustic 34s ease-in-out infinite;">' +
            '<ellipse cx="720" cy="330" rx="520" ry="300" fill="url(#afSunGlint)"></ellipse>' +
          '</g>' +
          '<rect width="1440" height="820" fill="rgba(3,18,27,0.34)"></rect>' +
          '<rect width="1440" height="820" fill="url(#afVign)"></rect>' +
        '</svg>' +
        '<div class="af-ocean-scrim-x"></div>' +
        '<div class="af-ocean-scrim-y"></div>' +
      '</div>';
  }

  function vesselMarkup() {
    return '' +
      '<div class="af-vessel" data-parallax="vessel">' +
        '<picture>' +
          '<source srcset="' + ASSETS + 'vessel.webp" type="image/webp">' +
          '<img src="' + ASSETS + 'vessel.png" alt="" aria-hidden="true" draggable="false" decoding="async" fetchpriority="low">' +
        '</picture>' +
      '</div>';
  }

  /* The radar is its own square, vessel-centred layer. It deliberately does
     NOT live inside the 1440x820 slice-scaled HUD svg: under
     preserveAspectRatio="slice" a fixed cx/cy drifts away from the vessel as
     the viewport ratio changes, so the rings would sit off the hull. */
  function radarMarkup() {
    return '' +
      '<div class="af-radar" data-parallax="radar" aria-hidden="true">' +
        '<svg viewBox="0 0 640 640" preserveAspectRatio="xMidYMid meet" focusable="false">' +
          '<defs>' +
            '<radialGradient id="afSweep" cx="0.5" cy="0.5" r="0.5">' +
              '<stop offset="0" stop-color="rgba(120,214,236,0.30)"></stop>' +
              '<stop offset="1" stop-color="rgba(120,214,236,0)"></stop>' +
            '</radialGradient>' +
          '</defs>' +
          '<g stroke="rgba(140,214,232,0.26)" fill="none" stroke-width="1">' +
            '<circle class="af-ring af-ring-1" cx="320" cy="320" r="132"></circle>' +
            '<circle class="af-ring af-ring-2" cx="320" cy="320" r="218" stroke="rgba(140,214,232,0.18)"></circle>' +
            '<circle class="af-ring af-ring-3" cx="320" cy="320" r="304" stroke="rgba(140,214,232,0.13)" stroke-dasharray="3 9"></circle>' +
          '</g>' +
          '<g class="af-hud-cross" stroke="rgba(140,214,232,0.15)" stroke-width="1" fill="none">' +
            '<path d="M320 6 L320 42 M6 320 L56 320 M584 320 L634 320"></path>' +
            '<path d="M106 106 L134 134 M534 106 L506 134" stroke="rgba(140,214,232,0.1)"></path>' +
          '</g>' +
          '<g class="af-sweep">' +
            '<path d="M320 320 L320 16 A304 304 0 0 1 476 62 Z" fill="url(#afSweep)"></path>' +
            '<path d="M320 320 L320 16" stroke="rgba(150,224,244,0.42)" stroke-width="1.2"></path>' +
          '</g>' +
          '<g class="af-hud-ticks" stroke="rgba(140,214,232,0.42)" fill="none" stroke-width="1.2">' +
            '<path d="M166 230 h-10 v-10 M474 230 h10 v-10 M166 410 h-10 v10 M474 410 h10 v10"></path>' +
          '</g>' +
        '</svg>' +
      '</div>';
  }

  function hudMarkup() {
    return '' +
      '<div class="af-hud" data-parallax="hud" aria-hidden="true">' +
        '<svg viewBox="0 0 1440 820" preserveAspectRatio="xMidYMid slice" focusable="false">' +
          '<g class="af-hud-extra" stroke="rgba(140,214,232,0.14)" fill="none" stroke-width="1">' +
            '<path d="M1090 150 h230 M1090 150 v-14 M1320 150 v-14"></path>' +
            '<path d="M120 660 h180 M120 660 v14"></path>' +
            '<path d="M1040 640 q70 -30 150 -18 t180 6" stroke-dasharray="2 8"></path>' +
            '<path d="M1010 690 q80 -26 170 -12 t190 10" stroke-dasharray="2 8" stroke="rgba(140,214,232,0.10)"></path>' +
          '</g>' +
        '</svg>' +
        '<div class="af-readout af-readout-platform"><b>PLATFORM</b><span>RV&nbsp;MERIDIAN</span></div>' +
        '<div class="af-readout af-readout-scan"><b>SCAN</b><span>SECTOR&nbsp;NE&nbsp;/&nbsp;04</span></div>' +
      '</div>';
  }

  /* ===================================================================
     Parallax

     Pointer-driven, desktop only, and deliberately tiny: the ocean and the
     vessel shift by a few pixels, the HUD slightly more. The auth panel is
     never a parallax target — it must stay perfectly still so the fields
     do not move under the cursor.
     =================================================================== */

  var DEPTHS = { ocean: 6, vessel: 10, hud: 16 };

  function attachParallax(root) {
    if (prefersReducedMotion()) return null;
    if (!global.matchMedia || !global.matchMedia("(hover: hover) and (pointer: fine)").matches) return null;
    if (!global.matchMedia("(min-width: 841px)").matches) return null;

    var layers = [];
    var ocean = root.querySelector(".af-ocean");
    if (ocean) layers.push({ node: ocean, depth: DEPTHS.ocean, base: "" });
    var vessel = root.querySelector(".af-vessel");
    if (vessel) layers.push({ node: vessel, depth: DEPTHS.vessel, base: "translate(-50%,-50%)" });
    var hud = root.querySelector(".af-hud");
    if (hud) layers.push({ node: hud, depth: DEPTHS.hud, base: "" });
    var radar = root.querySelector(".af-radar");
    if (radar) layers.push({ node: radar, depth: DEPTHS.hud, base: "translate(-50%,-50%)" });
    if (!layers.length) return null;

    var frame = 0;
    var targetX = 0;
    var targetY = 0;

    function apply() {
      frame = 0;
      for (var i = 0; i < layers.length; i += 1) {
        var layer = layers[i];
        var x = (targetX * layer.depth).toFixed(2);
        var y = (targetY * layer.depth).toFixed(2);
        /* The vessel keeps its centring translate; the offset is appended so
           it never fights the CSS positioning. The <img> inside owns the
           entrance and idle animations, so nothing here is overwritten. */
        layer.node.style.transform = layer.base + " translate3d(" + x + "px," + y + "px,0)";
      }
    }

    function onMove(event) {
      var w = global.innerWidth || 1;
      var h = global.innerHeight || 1;
      targetX = (event.clientX / w) * 2 - 1;
      targetY = (event.clientY / h) * 2 - 1;
      if (!frame) frame = global.requestAnimationFrame(apply);
    }

    function onLeave() {
      targetX = 0;
      targetY = 0;
      if (!frame) frame = global.requestAnimationFrame(apply);
    }

    global.addEventListener("pointermove", onMove, { passive: true });
    global.addEventListener("pointerleave", onLeave, { passive: true });

    return function detach() {
      global.removeEventListener("pointermove", onMove);
      global.removeEventListener("pointerleave", onLeave);
      if (frame) global.cancelAnimationFrame(frame);
    };
  }

  var detachParallax = null;

  /* ===================================================================
     Public surface
     =================================================================== */

  /* Called by auth.js immediately after the login screen is in the DOM.
     `screen` is the #auth-screen element. */
  function mount(screen) {
    try {
      if (!screen) return;
      screen.classList.add("landing");

      /* Repeat mounts (logout, session expiry) skip the entrance. */
      if (hasEnteredOnce) screen.classList.add("af-no-entrance");
      hasEnteredOnce = true;

      var scene = screen.querySelector(".af-scene");
      if (scene) {
        scene.innerHTML = oceanMarkup() + vesselMarkup() + radarMarkup() + hudMarkup();
      }

      if (detachParallax) { detachParallax(); detachParallax = null; }
      detachParallax = attachParallax(screen);
    } catch (error) {
      /* Decoration is never worth breaking sign-in over. */
      if (global.console && global.console.warn) {
        global.console.warn("AquaFleet landing scene unavailable:", error);
      }
    }
  }

  /* Called by auth.js for the neutral boot state, so it sits on the same
     ocean instead of flashing a white panel before the login screen. */
  function mountChecking(screen) {
    try {
      if (!screen) return;
      screen.classList.add("landing");
      var scene = screen.querySelector(".af-scene");
      if (scene) scene.innerHTML = oceanMarkup();
    } catch (error) {
      /* ignored on purpose */
    }
  }

  function unmount() {
    try {
      if (detachParallax) { detachParallax(); detachParallax = null; }
    } catch (error) {
      /* ignored on purpose */
    }
  }

  global.AquaFleetLanding = Object.freeze({
    mount: mount,
    mountChecking: mountChecking,
    unmount: unmount
  });
})(window);
