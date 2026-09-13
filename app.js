(function () {
  "use strict";

  // ---------- i18n ----------
  var LANG_KEY = "vt_lang";
  function applyLang(lang) {
    var dict = (window.I18N && (window.I18N[lang] || window.I18N.de)) || {};
    document.documentElement.lang = lang;
    var cur = document.getElementById("lang-cur");
    if (cur) cur.textContent = lang.toUpperCase();
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key] != null) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (dict[key] != null) el.innerHTML = dict[key];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-ph");
      if (dict[key] != null) el.setAttribute("placeholder", dict[key]);
    });
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  function initLang() {
    var saved = "de";
    try { saved = localStorage.getItem(LANG_KEY) || "de"; } catch (e) {}
    applyLang(saved);

    var btn = document.getElementById("lang-btn");
    var menu = document.getElementById("lang-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", function () {
      var open = !menu.classList.contains("is-hidden");
      menu.classList.toggle("is-hidden");
      btn.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.add("is-hidden");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    menu.querySelectorAll("[data-lang]").forEach(function (b) {
      b.addEventListener("click", function () {
        applyLang(b.getAttribute("data-lang"));
        menu.classList.add("is-hidden");
        btn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ---------- Mobile nav ----------
  function initNav() {
    var burger = document.getElementById("burger");
    var nav = document.getElementById("nav");
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ---------- FAQ accordion ----------
  function initFaq() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      var q = item.querySelector(".faq-q");
      q.addEventListener("click", function () {
        var wasOpen = item.classList.contains("is-open");
        document.querySelectorAll(".faq-item.is-open").forEach(function (el) { el.classList.remove("is-open"); });
        if (!wasOpen) item.classList.add("is-open");
      });
    });
  }

  // ---------- Cookie consent ----------
  function initCookie() {
    var el = document.getElementById("cookie");
    var yes = document.getElementById("cookie-yes");
    var no = document.getElementById("cookie-no");
    var stored;
    try { stored = localStorage.getItem("vt_consent"); } catch (e) {}
    if (!stored) el.classList.remove("is-hidden");
    yes.addEventListener("click", function () {
      try { localStorage.setItem("vt_consent", "yes"); } catch (e) {}
      el.classList.add("is-hidden");
    });
    no.addEventListener("click", function () {
      try { localStorage.setItem("vt_consent", "no"); } catch (e) {}
      el.classList.add("is-hidden");
    });
  }

  // ---------- Floating action button ----------
  function initFab() {
    var fab = document.getElementById("fab");
    var btn = document.getElementById("fab-btn");
    btn.addEventListener("click", function () {
      var open = fab.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", function (e) {
      if (!fab.contains(e.target)) fab.classList.remove("is-open");
    });
  }

  // ---------- Sticky CTA + back-to-top on scroll ----------
  function initScrollUi() {
    var sticky = document.getElementById("sticky-cta");
    var toTop = document.getElementById("to-top");
    var fab = document.getElementById("fab");
    var hero = document.getElementById("top");
    var kicker = document.querySelector(".kicker");
    var kickerLetters = kicker ? kicker.querySelectorAll(".kl") : [];
    var kickerShown = false;
    var reveals = document.querySelectorAll(".reveal");

    function showKicker() {
      if (kickerShown) return;
      kickerShown = true;
      kicker.classList.add("is-visible");
      kickerLetters.forEach(function (el, i) {
        setTimeout(function () { el.classList.add("is-in"); }, i * 90);
      });
    }

    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      var heroH = hero.offsetHeight;
      if (sticky) sticky.classList.toggle("is-visible", y > heroH * 0.7);
      if (toTop) toTop.classList.toggle("is-visible", y > 600);
      if (fab) fab.classList.toggle("is-hidden", y < heroH * 0.6);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (kicker) setTimeout(showKicker, 200);

    if (toTop) {
      toTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add("is-in");
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  // ---------- Request form ----------
  function initExtras() {
    var qtyPairs = [
      ["lamp-check", "lamp-qty-row"],
      ["kartons-check", "kartons-qty-row"],
      ["kleiderbox-check", "kleiderbox-qty-row"]
    ];
    qtyPairs.forEach(function (pair) {
      var check = document.getElementById(pair[0]);
      var row = document.getElementById(pair[1]);
      if (!check || !row) return;
      check.addEventListener("change", function () {
        row.classList.toggle("is-hidden", !check.checked);
      });
    });
  }

  function initForm() {
    var form = document.getElementById("req-form");
    var done = document.getElementById("req-done");
    var err = document.getElementById("req-error");

    function buildLines(data) {
      var extras = data.getAll("extras");
      var lines = [
        "Name: " + data.get("name"),
        "Telefon: " + data.get("phone"),
        "Art des Umzugs: " + data.get("service")
      ];
      if (extras.length) {
        lines.push("Zusatzleistungen: " + extras.join(", "));
        if (extras.indexOf("Montage von Lampen/Kronleuchtern") !== -1 && data.get("lamp_qty")) {
          lines.push("Anzahl Lampen/Kronleuchter: " + data.get("lamp_qty"));
        }
        if (extras.indexOf("Kartons") !== -1 && data.get("kartons_qty")) {
          lines.push("Anzahl Kartons: " + data.get("kartons_qty"));
        }
        if (extras.indexOf("Kleiderbox") !== -1 && data.get("kleiderbox_qty")) {
          lines.push("Anzahl Kleiderboxen: " + data.get("kleiderbox_qty"));
        }
      }
      if (data.get("from")) lines.push("Auszugsadresse: " + data.get("from"));
      if (data.get("to")) lines.push("Einzugsadresse: " + data.get("to"));
      if (data.get("date")) lines.push("Wunschtermin: " + data.get("date"));
      if (data.get("comment")) lines.push("Weitere Details: " + data.get("comment"));
      return lines;
    }

    document.querySelectorAll("#req-form [data-channel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var data = new FormData(form);
        if (!data.get("name") || !data.get("phone") || !data.get("service")) {
          err.textContent = "Bitte füllen Sie Name, Telefon und Art des Umzugs aus.";
          err.classList.remove("is-hidden");
          return;
        }
        err.classList.add("is-hidden");

        var lines = buildLines(data);
        var text = lines.join("\n");
        var channel = btn.getAttribute("data-channel");
        var url;
        if (channel === "whatsapp") {
          url = "https://wa.me/4915751017172?text=" + encodeURIComponent("Umzugsanfrage:\n" + text);
        } else if (channel === "telegram") {
          url = "https://t.me/VektorTransport?text=" + encodeURIComponent("Umzugsanfrage:\n" + text);
        } else {
          var subject = "Umzugsanfrage – " + data.get("name");
          url = "mailto:info@vektor-transport.de?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
        }

        form.classList.add("is-hidden");
        done.classList.remove("is-hidden");
        if (channel === "email") {
          window.location.href = url;
        } else {
          window.open(url, "_blank", "noopener");
        }
      });
    });
  }

  // ---------- Carousels (gallery + reviews) ----------
  function initCarousel(trackId, prevId, nextId) {
    var track = document.getElementById(trackId);
    var prev = document.getElementById(prevId);
    var next = document.getElementById(nextId);
    if (!track || !prev || !next) return;

    function step(dir) {
      var item = track.querySelector(":scope > *");
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      var amount = item ? item.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
      track.scrollBy({ left: dir * amount, behavior: "smooth" });
    }
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });

    function updateArrows() {
      var max = track.scrollWidth - track.clientWidth - 2;
      prev.classList.toggle("is-disabled", track.scrollLeft <= 2);
      next.classList.toggle("is-disabled", track.scrollLeft >= max);
    }
    track.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    updateArrows();
  }

  // ---------- Service quick-links -> preselect in request form ----------
  function initServiceLinks() {
    var select = document.querySelector('#req-form [name="service"]');
    if (!select) return;
    document.querySelectorAll("[data-service]").forEach(function (el) {
      el.addEventListener("click", function () {
        select.value = el.getAttribute("data-service");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initLang();
    initNav();
    initFaq();
    initCookie();
    initFab();
    initScrollUi();
    initForm();
    initServiceLinks();
    initExtras();
    initCarousel("feed", "feed-prev", "feed-next");
    initCarousel("reviews-list", "rev-prev", "rev-next");
  });
})();
