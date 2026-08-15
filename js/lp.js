/* ============================================================
   lp.js — LIMRA Google Ads landing pages

   Does four things:
     1. Captures the ad-click context (gclid + UTM params) and keeps it
        for the whole session, so it survives scrolling and page anchors.
     2. Loads GA4 + Google Ads tags — but ONLY if real IDs are set in
        _data/site.json. With blank IDs nothing loads and no cookies are set.
     3. Submits the enquiry to Web3Forms (email) and, if configured, to a
        Google Sheet endpoint as well.
     4. Fires the conversion events, then sends the visitor to /thank-you/.

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

    // URL params always win — a fresh ad click overwrites an older session.
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
    if (!ids.length) return; // nothing configured — load nothing, set no cookies

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

  /* The conversion fires on the thank-you page, not before the redirect —
     a tag dispatched mid-navigation is routinely lost. We set a one-shot
     flag on submit and consume it on arrival, so a visitor who simply
     types /thank-you/ into the address bar never counts as a conversion. */
  var PENDING_KEY = "limra_lp_pending_conversion";

  function markConversionPending(campus) {
    try { sessionStorage.setItem(PENDING_KEY, campus || "unknown"); } catch (e) {}
  }

  function firePendingConversion() {
    var campus;
    try { campus = sessionStorage.getItem(PENDING_KEY); } catch (e) { return; }
    if (!campus) return;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}

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

  function validate(form) {
    var ok = true;
    var firstBad = null;

    form.querySelectorAll("[required]").forEach(function (field) {
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
      firstBad.focus();
      firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return ok;
  }

  /* Google Sheet delivery. Fire-and-forget with no-cors: the Apps Script
     endpoint records the row, but we never block the visitor on it — the
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
        say("Form not configured yet — please call us on " + (document.querySelector(".lp-bar-call span") || {}).textContent + ".", true);
        return;
      }

      fillHiddenFields();

      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

      var data = new FormData(form);
      data.append("access_key", CFG.web3formsKey);
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
            markConversionPending(campus);
            window.location.href = "/thank-you/?campus=" + encodeURIComponent(campus);
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

  function init() {
    loadTags();
    firePendingConversion();
    fillHiddenFields();
    trackOutboundClicks();
    document.querySelectorAll(".js-lp-form").forEach(handleForm);
    initExitIntent();

    var yr = document.getElementById("year");
    if (yr) yr.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
