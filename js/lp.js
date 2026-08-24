/* ============================================================
   lp.js - LIMRA Google Ads landing pages

   Does four things:
     1. Captures the ad-click context (gclid + UTM params) and keeps it
        for the whole session, so it survives scrolling and page anchors.
     2. Loads GA4 + Google Ads tags - but ONLY if real IDs are set in
        _data/site.json. With blank IDs nothing loads and no cookies are set.
     3. Submits the enquiry to Web3Forms (email) and, if configured, to a
        Google Sheet endpoint as well.
     4. Fires the conversion events and confirms success inside the form,
        without navigating the visitor away.

   Config comes from window.LP, injected by _includes/base.njk.
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.LP || {};
  var TRACK_KEYS = ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var STORE_KEY = "limra_lp_attribution";

  /* ---------- 1. ad-click attribution ---------- */

  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var stored = {};

    try {
      stored = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
    } catch (e) { stored = {}; }

    // URL params always win - a fresh ad click overwrites an older session.
    TRACK_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) stored[k] = v;
    });

    // Google Ads auto-tagging sometimes uses gbraid/wbraid instead of gclid.
    ["gbraid", "wbraid"].forEach(function (k) {
      var v = params.get(k);
      if (v && !stored.gclid) stored.gclid = v;
    });

    stored.page_url = window.location.href;
    if (!stored.landed_at) stored.landed_at = new Date().toISOString();
    if (!stored.referrer) stored.referrer = document.referrer || "direct";

    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch (e) {}
    return stored;
  }

  var attribution = captureAttribution();

  function fillHiddenFields() {
    document.querySelectorAll("[data-fill]").forEach(function (input) {
      var key = input.getAttribute("data-fill");
      if (attribution[key]) input.value = attribution[key];
    });
  }

  /* ---------- 2. analytics (only with real IDs) ---------- */

  var gaReady = false;

  function loadTags() {
    var ids = [];
    if (CFG.ga4Id) ids.push(CFG.ga4Id);
    if (CFG.adsConversionId) ids.push(CFG.adsConversionId);
    if (!ids.length) return; // nothing configured - load nothing, set no cookies

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ids[0]);
    document.head.appendChild(s);

    ids.forEach(function (id) { window.gtag("config", id); });
    gaReady = true;
  }

  function track(event, params) {
    if (!gaReady || typeof window.gtag !== "function") return;
    window.gtag("event", event, params || {});
  }

  var PENDING_KEY = "limra_lp_pending_conversion";

  /* Success is confirmed inside the form, so there is no navigation to lose a
     tag to and the conversion fires immediately. The pending-flag path below
     is only reached from /thank-you/, which is where a visitor lands if the
     form was submitted without JavaScript. */
  function firePendingConversion() {
    var campus;
    try { campus = sessionStorage.getItem(PENDING_KEY); } catch (e) { return; }
    if (!campus) return;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    fireConversion(campus);
  }

  function fireConversion(campus) {
    track("generate_lead", {
      event_category: "form",
      event_label: campus,
      campus: campus,
      utm_campaign: attribution.utm_campaign || "",
      utm_source: attribution.utm_source || ""
    });

    if (CFG.adsConversionId && CFG.adsConversionLabel) {
      track("conversion", {
        send_to: CFG.adsConversionId + "/" + CFG.adsConversionLabel
      });
    }
  }

  /* ---------- 3 + 4. form handling ---------- */

  /* Validates the whole form by default, or just one step when `scope` is
     given. At final submit we still check every field, including step 1,
     so a value cleared after going back cannot slip through. */
  function validate(form, scope) {
    var ok = true;
    var firstBad = null;
    var root = scope || form;

    /* Required fields, plus any optional email or phone that has been filled
       in: email stopped being mandatory, and an optional field with a typo in
       it should still be caught rather than silently accepted. */
    var fields = [].slice.call(root.querySelectorAll("[required]"));
    root.querySelectorAll('input[type="email"], input[type="tel"]').forEach(function (f) {
      if (fields.indexOf(f) === -1 && f.value.trim()) fields.push(f);
    });

    fields.forEach(function (field) {
      var valid = field.type === "checkbox" ? field.checked : !!field.value.trim();

      if (valid && field.type === "email") {
        valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
      }
      if (valid && field.type === "tel") {
        valid = (field.value.replace(/\D/g, "").length >= 10);
      }

      field.classList.toggle("invalid", !valid);
      if (!valid) { ok = false; if (!firstBad) firstBad = field; }
    });

    if (firstBad) {
      // If the offending field is on a hidden step, reveal that step first.
      var owner = firstBad.closest("[data-step]");
      if (owner && owner.hidden) showStep(form, owner.getAttribute("data-step"));
      firstBad.focus();
      firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return ok;
  }

  /* ---------- two-step form ----------
     Both steps live in the same card. Nothing navigates, nothing reloads,
     and the values entered in step 1 stay in the DOM, so going back and
     forth never loses what someone has typed. */

  function showStep(form, n) {
    form.querySelectorAll("[data-step]").forEach(function (step) {
      step.hidden = step.getAttribute("data-step") !== String(n);
    });
    var counter = form.querySelector("[data-step-count]");
    if (counter) counter.textContent = "Step " + n + " of 2";

    // The intro explains step 1. On step 2 the visitor has already given
    // those details, so it is describing something they have done.
    var intro = form.querySelector("[data-step1-only]");
    if (intro) intro.hidden = String(n) !== "1";
  }

  function initSteps(form) {
    var steps = form.querySelectorAll("[data-step]");
    if (steps.length < 2) return; // compact form stays single-step

    var next = form.querySelector("[data-step-next]");
    var back = form.querySelector("[data-step-back]");

    if (next) {
      next.addEventListener("click", function () {
        var one = form.querySelector('[data-step="1"]');
        if (!validate(form, one)) return;
        showStep(form, 2);
        track("form_step_2", { event_category: "form" });
        var first = form.querySelector('[data-step="2"] input');
        if (first) first.focus({ preventScroll: true });
      });
    }

    if (back) {
      back.addEventListener("click", function () {
        showStep(form, 1);
        var first = form.querySelector('[data-step="1"] input');
        if (first) first.focus({ preventScroll: true });
      });
    }
  }

  /* Google Sheet delivery. Fire-and-forget with no-cors: the Apps Script
     endpoint records the row, but we never block the visitor on it - the
     email via Web3Forms is the authoritative delivery path. */
  function sendToSheet(payload) {
    if (!CFG.sheetEndpoint) return Promise.resolve();
    return fetch(CFG.sheetEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch(function () { /* never let the sheet break the lead */ });
  }

  function handleForm(form) {
    var btn = form.querySelector(".lp-submit");
    var msg = form.querySelector("[data-form-msg]");
    var label = btn ? btn.textContent : "";

    function say(text, isError) {
      if (!msg) return;
      msg.textContent = text;
      msg.classList.toggle("error", !!isError);
      msg.classList.toggle("show", !!text);
    }

    function restore() {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      say("", false);

      if (!validate(form)) {
        say("Please complete the highlighted fields.", true);
        return;
      }

      if (!CFG.web3formsKey) {
        say("Form not configured yet - please call us on " + (document.querySelector(".lp-bar-call span") || {}).textContent + ".", true);
        return;
      }

      fillHiddenFields();

      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

      var data = new FormData(form);
      data.append("referrer", attribution.referrer || "direct");
      data.append("landed_at", attribution.landed_at || "");

      var campus = data.get("college") || "";

      // Plain object copy for the Google Sheet row.
      var payload = {};
      data.forEach(function (v, k) { if (k !== "access_key" && k !== "botcheck") payload[k] = v; });
      payload.submitted_at = new Date().toISOString();

      sendToSheet(payload);

      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.success) {
            /* No navigation, so the old mid-navigation tag loss cannot
               happen and the conversion fires straight away. */
            fireConversion(campus);
            showDone(form);
            form.dispatchEvent(new CustomEvent("lp:success", { bubbles: true }));
          } else {
            say("Sorry, something went wrong. Please try again, or call us directly.", true);
            restore();
          }
        })
        .catch(function () {
          say("Network error. Please try again, or call us directly.", true);
          restore();
        });
    });

    // Clear the error state as soon as the visitor starts fixing a field.
    form.addEventListener("input", function (e) {
      if (e.target.classList) e.target.classList.remove("invalid");
    });
  }

  /* ---------- exit intent ----------
     Shown at most once per session, never before the visitor has had a
     chance to read, and never once they have already submitted. On desktop
     the trigger is the cursor leaving through the top of the window; on
     touch devices there is no such signal, so we use a fast upward scroll
     (the gesture that precedes reaching for the back button) instead. */

  var EXIT_SHOWN_KEY = "limra_lp_exit_shown";
  var MIN_DWELL_MS = 12000;

  function initExitIntent() {
    var modal = document.getElementById("lp-exit");
    if (!modal) return;

    var armed = false;
    var closed = false;

    setTimeout(function () { armed = true; }, MIN_DWELL_MS);

    function alreadyShown() {
      try { return sessionStorage.getItem(EXIT_SHOWN_KEY) === "1"; } catch (e) { return false; }
    }

    function converted() {
      try { return !!sessionStorage.getItem(PENDING_KEY); } catch (e) { return false; }
    }

    function open() {
      if (!armed || closed || alreadyShown() || converted()) return;
      if (!modal.hidden) return;

      modal.hidden = false;
      document.body.style.overflow = "hidden";
      try { sessionStorage.setItem(EXIT_SHOWN_KEY, "1"); } catch (e) {}
      track("exit_intent_shown", { event_category: "engagement" });

      var first = modal.querySelector("input[type=text]");
      if (first) first.focus({ preventScroll: true });
    }

    function close() {
      closed = true;
      modal.hidden = true;
      document.body.style.overflow = "";
    }

    modal.querySelectorAll("[data-exit-close]").forEach(function (el) {
      el.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });

    // Desktop: cursor leaves through the top of the viewport.
    document.addEventListener("mouseout", function (e) {
      if (e.relatedTarget || e.clientY > 4) return;
      open();
    });

    // Touch: a fast flick upward near the top of the page.
    var lastY = window.scrollY;
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      var dy = lastY - y;
      lastY = y;
      if (window.innerWidth > 768) return;
      if (dy > 90 && y < 900) open();
    }, { passive: true });
  }

  /* ---------- inline success ----------
     Swaps the form's contents for the thank-you panel already in the
     markup, keeping the visitor exactly where they are. */

  function showDone(form) {
    var done = form.querySelector("[data-form-done]");
    if (!done) return;

    form.querySelectorAll(
      "[data-step], [data-step-count], [data-form-msg], [data-form-fine]"
    ).forEach(function (el) { el.hidden = true; });

    done.hidden = false;
    form.classList.add("is-done");

    // Keep the confirmation in view without yanking the page around.
    var box = done.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      done.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    done.setAttribute("tabindex", "-1");
    done.focus({ preventScroll: true });
  }

  /* ---------- mobile: tapping Enquire opens the keyboard too ---------- */

  function initMobileEnquire() {
    var btn = document.querySelector(".lpm-form");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var field = document.querySelector('.lp-hero-form .lp-form [name="name"]');
      if (!field || field.closest("[hidden]")) return;
      // Let the anchor scroll first, then raise the keyboard.
      setTimeout(function () { field.focus({ preventScroll: true }); }, 420);
    });
  }

  /* ---------- gallery lightbox ----------
     Casual saving is discouraged: right-click, drag and long-press are all
     blocked on the image. This is a deterrent, not protection. Anything a
     browser can display can be retrieved from developer tools or the
     network tab, and no web page can prevent that. */

  function initLightbox() {
    var gallery = document.querySelector("[data-gallery]");
    if (!gallery) return;

    var triggers = [].slice.call(gallery.querySelectorAll("[data-lightbox]"));
    if (!triggers.length) return;

    /* Slides are deduplicated by source, for two reasons. The marquee rows are
       cloned to make the loop seamless, so the same photograph appears twice
       in the DOM; and the enlarged view should load the full-size original
       rather than the 700px thumbnail the tile displays. */
    var slides = [];
    var indexOfSrc = {};

    function fullSrc(t) {
      var img = t.querySelector("img");
      return img.getAttribute("data-full") || img.getAttribute("src");
    }

    triggers.forEach(function (t) {
      var src = fullSrc(t);
      if (src in indexOfSrc) return;
      var img = t.querySelector("img");
      var cap = t.querySelector("figcaption");
      indexOfSrc[src] = slides.length;
      slides.push({ src: src, alt: img.getAttribute("alt"), caption: cap ? cap.textContent : "" });
    });

    var index = 0;
    var lastFocus = null;

    var box = document.createElement("div");
    box.className = "lp-lb";
    box.hidden = true;
    box.innerHTML =
      '<div class="lp-lb-backdrop" data-lb-close></div>' +
      '<div class="lp-lb-stage" role="dialog" aria-modal="true" aria-label="Campus photo">' +
        '<button type="button" class="lp-lb-x" data-lb-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
        '<button type="button" class="lp-lb-nav lp-lb-prev" data-lb-prev aria-label="Previous photo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<figure class="lp-lb-figure">' +
          '<img alt="" draggable="false" oncontextmenu="return false" />' +
          '<span class="lp-lb-shield" aria-hidden="true"></span>' +
          '<figcaption></figcaption>' +
        '</figure>' +
        '<button type="button" class="lp-lb-nav lp-lb-next" data-lb-next aria-label="Next photo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>' +
        '<p class="lp-lb-count"></p>' +
      "</div>";
    document.body.appendChild(box);

    var imgEl = box.querySelector("img");
    var capEl = box.querySelector("figcaption");
    var countEl = box.querySelector(".lp-lb-count");

    function render() {
      var s = slides[index];
      imgEl.setAttribute("src", s.src);
      imgEl.setAttribute("alt", s.alt);
      capEl.textContent = s.caption;
      countEl.textContent = index + 1 + " / " + slides.length;
    }

    function open(i) {
      index = i;
      lastFocus = document.activeElement;
      render();
      box.hidden = false;
      document.body.style.overflow = "hidden";
      box.querySelector(".lp-lb-x").focus({ preventScroll: true });
      track("gallery_open", { event_category: "engagement" });
    }

    function close() {
      box.hidden = true;
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    }

    function step(delta) {
      index = (index + delta + slides.length) % slides.length;
      render();
    }

    /* Bound by source rather than by DOM position, so a cloned marquee tile
       opens the same slide as the original it was copied from. */
    triggers.forEach(function (t) {
      t.addEventListener("click", function () { open(indexOfSrc[fullSrc(t)]); });
    });

    box.addEventListener("click", function (e) {
      if (e.target.closest("[data-lb-close]")) close();
      else if (e.target.closest("[data-lb-prev]")) step(-1);
      else if (e.target.closest("[data-lb-next]")) step(1);
    });

    document.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });

    // Block the casual save routes on gallery and lightbox images alike.
    document.addEventListener("contextmenu", function (e) {
      if (e.target.tagName === "IMG" && e.target.closest("[data-gallery], .lp-lb")) {
        e.preventDefault();
      }
    });
    document.addEventListener("dragstart", function (e) {
      if (e.target.tagName === "IMG") e.preventDefault();
    });
  }

  /* ---------- engagement tracking ----------
     Conversions alone say whether the page worked, not why. These events say
     how far people actually get, so the next round of changes can be aimed at
     the section where they stop rather than guessed at. Fires only once per
     milestone, and only when analytics is configured. */

  function initEngagementTracking() {
    var hit = {};

    // Scroll depth, measured against the scrollable distance.
    var marks = [25, 50, 75, 90];
    window.addEventListener("scroll", function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      var pct = (window.scrollY / max) * 100;
      marks.forEach(function (m) {
        if (pct >= m && !hit["s" + m]) {
          hit["s" + m] = true;
          track("scroll_depth", { event_category: "engagement", event_label: m + "%", value: m });
        }
      });
    }, { passive: true });

    // Which sections were actually seen, and how long the visitor stayed.
    if (!("IntersectionObserver" in window)) return;

    var sections = [
      [".lp-hero", "hero"],
      [".lp-why", "why_college"],
      [".lp-mosaic", "campus_photos"],
      [".lp-clinical", "clinical_training"],
      [".lp-advantage", "why_limra"],
      [".lp-faq", "faq"],
      [".lp-close", "closing_cta"]
    ];

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var name = e.target.getAttribute("data-section");
        if (hit[name]) return;
        hit[name] = true;
        track("section_view", { event_category: "engagement", event_label: name });
      });
    }, { threshold: 0.4 });

    sections.forEach(function (pair) {
      var el = document.querySelector(pair[0]);
      if (!el) return;
      el.setAttribute("data-section", pair[1]);
      io.observe(el);
    });

    // Time on page, sent when the visitor leaves. `visibilitychange` is the
    // only event that reliably fires on mobile, where tabs are frozen rather
    // than unloaded.
    var start = performance.now();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "hidden" || hit.time) return;
      hit.time = true;
      track("time_on_page", {
        event_category: "engagement",
        value: Math.round((performance.now() - start) / 1000)
      });
    });
  }

  /* ---------- click tracking on call / whatsapp ---------- */

  function trackOutboundClicks() {
    document.querySelectorAll("[data-track]").forEach(function (el) {
      el.addEventListener("click", function () {
        track(el.getAttribute("data-track") + "_click", {
          event_category: "contact",
          event_label: window.location.pathname
        });
      });
    });
  }

  /* ---------- init ---------- */

  /* ---------- brochure downloads ----------
     Gated: the click is intercepted, the form is asked first, and the file
     starts the moment the lead is captured. This reverses the earlier
     free-download behaviour, at the client's request.

     Three things stop the gate being hostile:

       - It asks ONCE per visit. The Philippines page carries four brochures,
         and someone comparing all four must not meet four forms. After the
         first submission every other brochure downloads on the first click.
       - The link keeps its real href and is only intercepted by JavaScript,
         so if the script fails the brochure is still a plain download rather
         than a dead button.
       - The automatic download is backed by a visible manual link, because a
         browser can refuse a programmatic download and the visitor has by
         then already paid for the file with their phone number. */

  var BROCHURE_UNLOCKED_KEY = "limra_lp_brochure_unlocked";

  function initBrochures() {
    var links = document.querySelectorAll("[data-brochure]");
    if (!links.length) return;

    var modal = document.getElementById("lp-brochure");
    var pending = null;   // { href, uni } captured on click, released on submit

    function unlocked() {
      try {
        return sessionStorage.getItem(BROCHURE_UNLOCKED_KEY) === "1" ||
               !!sessionStorage.getItem(PENDING_KEY);
      } catch (e) { return false; }
    }

    function download(href, uni) {
      track("brochure_download", {
        event_category: "engagement", event_label: uni, college: uni
      });
      var a = document.createElement("a");
      a.href = href;
      a.setAttribute("download", "");
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function close() {
      if (!modal) return;
      modal.hidden = true;
      document.body.style.overflow = "";
    }

    if (modal) {
      modal.querySelectorAll("[data-brochure-close]").forEach(function (el) {
        el.addEventListener("click", close);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !modal.hidden) close();
      });

      /* The lead is in. Release the file, reveal the manual fallback, and
         remember the unlock so nothing asks again this visit. */
      var gateForm = modal.querySelector(".js-lp-form");
      if (gateForm) {
        gateForm.addEventListener("lp:success", function () {
          try { sessionStorage.setItem(BROCHURE_UNLOCKED_KEY, "1"); } catch (e) {}
          if (!pending) return;

          var fallback = modal.querySelector("[data-brochure-fallback]");
          var manual = modal.querySelector("[data-brochure-manual]");
          if (manual) manual.setAttribute("href", pending.href);
          if (fallback) fallback.hidden = false;

          download(pending.href, pending.uni);
          pending = null;
        });
      }
    }

    links.forEach(function (link) {
      link.addEventListener("click", function (e) {
        var uni = link.getAttribute("data-brochure") || "";
        var href = link.getAttribute("href");

        // Details already given this visit, or nothing to ask with: let the
        // browser download the file as it normally would.
        if (!modal || unlocked()) {
          track("brochure_download", {
            event_category: "engagement", event_label: uni, college: uni
          });
          return;
        }

        e.preventDefault();
        pending = { href: href, uni: uni };

        track("brochure_gate_shown", { event_category: "engagement", event_label: uni });

        // Attribute the lead to the university whose brochure was asked for,
        // rather than letting it arrive as "not sure yet".
        modal.querySelectorAll("[data-uni-field]").forEach(function (f) { f.value = uni; });
        // Short name in the heading: "Davao Medical School Foundation brochure"
        // wraps to three lines in the dialog.
        var slot = modal.querySelector("[data-brochure-name]");
        if (slot) slot.textContent = (link.getAttribute("data-brochure-short") || uni) + " brochure";

        var fallback = modal.querySelector("[data-brochure-fallback]");
        if (fallback) fallback.hidden = true;

        modal.hidden = false;
        document.body.style.overflow = "hidden";

        var first = modal.querySelector("input[type=text]");
        if (first) first.focus({ preventScroll: true });
      });
    });
  }

  /* ---------- campus marquee ----------
     Each row is duplicated so the -50% translate loops seamlessly. The
     animation is applied only once that has happened, because a row that is
     not doubled would scroll into empty space; without JavaScript the rows
     stay put and the strip becomes an ordinary horizontal scroller instead.

     This runs before initLightbox so the clones are bound too. */
  function initMarquee() {
    var marquee = document.querySelector(".lp-marquee");
    if (!marquee) return;

    marquee.querySelectorAll("[data-marq-row]").forEach(function (row) {
      var clone = row.cloneNode(true);

      // Mark each copied tile, not the wrapper: the wrapper is discarded when
      // its children are moved across, so aria-hidden set on it would be lost
      // and a screen reader would read every caption twice. The copies are
      // also taken out of the tab order for the same reason.
      clone.querySelectorAll(".lp-marq-item").forEach(function (item) {
        item.setAttribute("aria-hidden", "true");
        var btn = item.querySelector("button");
        if (btn) btn.setAttribute("tabindex", "-1");
      });

      while (clone.firstChild) row.appendChild(clone.firstChild);
    });

    marquee.classList.add("is-ready");
  }

  function init() {
    loadTags();
    firePendingConversion();
    fillHiddenFields();
    trackOutboundClicks();
    document.querySelectorAll(".js-lp-form").forEach(function (f) {
      handleForm(f);
      initSteps(f);
    });
    initMarquee();
    initLightbox();
    initMobileEnquire();
    initEngagementTracking();
    initExitIntent();
    initBrochures();

    var yr = document.getElementById("year");
    if (yr) yr.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
