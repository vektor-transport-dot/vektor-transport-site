(function () {
  "use strict";

  var ROAD_FACTOR = 1.3; // straight-line distance -> rough road-distance estimate
  var WUPPERTAL = { lat: 51.2562, lon: 7.1508 };

  // Service areas MöbelTaxi currently covers. Add more cities here later
  // (e.g. duesseldorf, koeln) once MöbelTaxi expands beyond Wuppertal.
  var SERVICE_AREAS = {
    wuppertal: {
      name: "Wuppertal",
      matches: function (addr) {
        if (!addr) return false;
        var city = (addr.city || addr.town || addr.village || addr.municipality || "").toLowerCase();
        var postcode = addr.postcode || "";
        return city.indexOf("wuppertal") !== -1 || /^42\d{3}$/.test(postcode);
      }
    }
  };
  function isInServiceArea(addr) {
    for (var key in SERVICE_AREAS) {
      if (SERVICE_AREAS[key].matches(addr)) return true;
    }
    return false;
  }

  var SLOTS = ["08:00–10:00", "10:00–12:00", "12:00–14:00", "14:00–16:00", "16:00–18:00"];

  // Placeholder availability management: block a date's slots by adding its
  // ISO date (YYYY-MM-DD) with an array of blocked slot labels. No backend
  // yet -- this is edited by hand until real calendar sync exists.
  var BLOCKED_SLOTS = {
    // "2026-09-26": ["10:00–12:00", "14:00–16:00"]
  };

  var STEP_LABELS = ["Adresse", "Paket", "Termin", "Zusatzangaben", "Preis & Buchung"];

  var selectedPkg = null, selectedBase = 0, selectedPerKm = 0;
  var lastResult = null; // { distanceKm, from, to }
  var dayType = null; // "today" | "tomorrow" | "custom" | "asap"
  var dateISO = null;
  var selectedSlot = null;
  var photoAttached = false;

  var map, fromMarker, toMarker, routeLine;

  function initMap() {
    var el = document.getElementById("taxi-map");
    if (!el || typeof L === "undefined") return;
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([WUPPERTAL.lat, WUPPERTAL.lon], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
  }

  function geocode(query) {
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=de&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (results) {
        if (!results || !results.length) return null;
        return {
          lat: parseFloat(results[0].lat),
          lon: parseFloat(results[0].lon),
          label: results[0].display_name,
          address: results[0].address || {}
        };
      });
  }

  function haversineKm(a, b) {
    var R = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var lat1 = a.lat * Math.PI / 180;
    var lat2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function drawRoute(from, to) {
    if (!map) return;
    if (fromMarker) map.removeLayer(fromMarker);
    if (toMarker) map.removeLayer(toMarker);
    if (routeLine) map.removeLayer(routeLine);

    var pin = function (color) {
      return L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:2px solid #17161a;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7]
      });
    };

    fromMarker = L.marker([from.lat, from.lon], { icon: pin("#ffbb1c") }).addTo(map);
    toMarker = L.marker([to.lat, to.lon], { icon: pin("#7c9db5") }).addTo(map);
    routeLine = L.polyline([[from.lat, from.lon], [to.lat, to.lon]], { color: "#7c9db5", weight: 3, dashArray: "6 8" }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });

    animateVan(from, to);
  }

  function animateVan(from, to) {
    var van = document.getElementById("taxi-van");
    if (!van || !map) return;

    function place(latlng) {
      var pt = map.latLngToContainerPoint(latlng);
      van.style.left = (pt.x - 15) + "px";
      van.style.top = (pt.y - 15) + "px";
    }

    van.style.transition = "none";
    place([from.lat, from.lon]);
    van.style.opacity = "1";
    void van.offsetWidth;
    van.style.transition = "left 1.6s linear, top 1.6s linear, opacity .3s ease";
    requestAnimationFrame(function () {
      place([to.lat, to.lon]);
    });
  }

  function goToStep(n) {
    document.querySelectorAll(".tw-step").forEach(function (s) {
      s.classList.toggle("is-active", parseInt(s.getAttribute("data-step"), 10) === n);
    });
    document.querySelectorAll(".tw-progress__step").forEach(function (s) {
      var idx = parseInt(s.getAttribute("data-step"), 10);
      s.classList.toggle("is-active", idx === n);
      s.classList.toggle("is-done", idx < n);
    });
    var line = document.getElementById("tw-stepline");
    if (line) line.textContent = "Schritt " + n + " von 5 · " + STEP_LABELS[n - 1];
    var body = document.getElementById("tw-body");
    if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function initBackButtons() {
    document.querySelectorAll(".tw-back").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToStep(parseInt(btn.getAttribute("data-back"), 10));
      });
    });
  }

  function initStep1() {
    var fromInput = document.getElementById("taxi-from");
    var toInput = document.getElementById("taxi-to");
    var btn = document.getElementById("tw-step1-next");
    var err = document.getElementById("tw-step1-error");
    var outside = document.getElementById("tw-outside-notice");
    if (!btn) return;

    [fromInput, toInput].forEach(function (input) {
      input.addEventListener("input", function () {
        outside.classList.add("is-hidden");
        err.classList.add("is-hidden");
      });
    });

    btn.addEventListener("click", function () {
      var fromVal = fromInput.value.trim();
      var toVal = toInput.value.trim();
      err.classList.add("is-hidden");
      outside.classList.add("is-hidden");

      if (!fromVal || !toVal) {
        err.textContent = "Bitte Abhol- und Lieferadresse eingeben.";
        err.classList.remove("is-hidden");
        return;
      }

      var originalText = btn.textContent;
      btn.textContent = "Prüfe Adresse…";
      btn.disabled = true;

      Promise.all([geocode(fromVal), geocode(toVal)]).then(function (res) {
        btn.textContent = originalText;
        btn.disabled = false;
        var from = res[0], to = res[1];
        if (!from || !to) {
          err.textContent = "Eine der Adressen konnte nicht gefunden werden. Bitte präzisieren (Straße, PLZ, Ort).";
          err.classList.remove("is-hidden");
          return;
        }
        if (!isInServiceArea(from.address) || !isInServiceArea(to.address)) {
          outside.classList.remove("is-hidden");
          return;
        }
        var straight = haversineKm(from, to);
        var distanceKm = straight * ROAD_FACTOR;
        lastResult = { distanceKm: distanceKm, from: fromVal, to: toVal };
        drawRoute(from, to);
        goToStep(2);
      }).catch(function () {
        btn.textContent = originalText;
        btn.disabled = false;
        err.textContent = "Die Adressen konnten gerade nicht geprüft werden. Bitte versuchen Sie es erneut.";
        err.classList.remove("is-hidden");
      });
    });
  }

  function initStep2() {
    var cards = document.querySelectorAll(".pkg-card");
    var btn = document.getElementById("tw-step2-next");
    var err = document.getElementById("tw-step2-error");

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        cards.forEach(function (c) { c.classList.remove("is-active"); });
        card.classList.add("is-active");
        selectedPkg = card.getAttribute("data-pkg");
        selectedBase = parseFloat(card.getAttribute("data-base")) || 0;
        selectedPerKm = parseFloat(card.getAttribute("data-perkm")) || 0;
        err.classList.add("is-hidden");
        // Future: auto-select a package here from IKEA receipt/article data.
      });
    });

    btn.addEventListener("click", function () {
      if (!selectedPkg) {
        err.textContent = "Bitte eine Paketgröße wählen.";
        err.classList.remove("is-hidden");
        return;
      }
      goToStep(3);
    });
  }

  function todayISO(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function formatDateLabel(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function renderSlots(iso) {
    var grid = document.getElementById("tw-slot-grid");
    var wrap = document.getElementById("tw-slots");
    grid.innerHTML = "";
    selectedSlot = null;

    var blocked = BLOCKED_SLOTS[iso] || [];
    var isToday = iso === todayISO(0);
    var nowHour = new Date().getHours();

    SLOTS.forEach(function (slot) {
      var startHour = parseInt(slot.split(":")[0], 10);
      var disabled = blocked.indexOf(slot) !== -1 || (isToday && startHour <= nowHour + 1);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tw-slot" + (disabled ? " is-disabled" : "");
      btn.textContent = slot;
      if (disabled) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", function () {
          grid.querySelectorAll(".tw-slot").forEach(function (s) { s.classList.remove("is-active"); });
          btn.classList.add("is-active");
          selectedSlot = slot;
        });
      }
      grid.appendChild(btn);
    });

    wrap.classList.remove("is-hidden");
  }

  function initStep3() {
    var asapBtn = document.getElementById("tw-asap-btn");
    var dayBtns = document.querySelectorAll(".tw-day-btn");
    var dateInput = document.getElementById("tw-date-input");
    var slotsWrap = document.getElementById("tw-slots");
    var btn = document.getElementById("tw-step3-next");
    var err = document.getElementById("tw-step3-error");

    var minDate = todayISO(0);
    dateInput.setAttribute("min", minDate);

    asapBtn.addEventListener("click", function () {
      dayBtns.forEach(function (b) { b.classList.remove("is-active"); });
      dateInput.classList.add("is-hidden");
      slotsWrap.classList.add("is-hidden");
      asapBtn.classList.add("is-active");
      dayType = "asap";
      dateISO = null;
      selectedSlot = null;
      err.classList.add("is-hidden");
    });

    dayBtns.forEach(function (dbtn) {
      dbtn.addEventListener("click", function () {
        dayBtns.forEach(function (b) { b.classList.remove("is-active"); });
        dbtn.classList.add("is-active");
        asapBtn.classList.remove("is-active");
        err.classList.add("is-hidden");
        dayType = dbtn.getAttribute("data-day");

        if (dayType === "custom") {
          dateInput.classList.remove("is-hidden");
          dateInput.value = "";
          dateISO = null;
          slotsWrap.classList.add("is-hidden");
        } else {
          dateInput.classList.add("is-hidden");
          dateISO = todayISO(dayType === "tomorrow" ? 1 : 0);
          renderSlots(dateISO);
        }
      });
    });

    dateInput.addEventListener("change", function () {
      if (dateInput.value) {
        dateISO = dateInput.value;
        renderSlots(dateISO);
      }
    });

    btn.addEventListener("click", function () {
      err.classList.add("is-hidden");
      if (dayType === "asap") { goToStep(4); return; }
      if (!dayType) {
        err.textContent = "Bitte einen Tag oder „Schnellstmöglich“ wählen.";
        err.classList.remove("is-hidden");
        return;
      }
      if (dayType === "custom" && !dateISO) {
        err.textContent = "Bitte ein Datum wählen.";
        err.classList.remove("is-hidden");
        return;
      }
      if (!selectedSlot) {
        err.textContent = "Bitte ein Zeitfenster wählen.";
        err.classList.remove("is-hidden");
        return;
      }
      goToStep(4);
    });
  }

  function terminText() {
    if (dayType === "asap") return "Schnellstmöglich (nächste verfügbare Abholung)";
    if (!dateISO) return "–";
    var prefix = dayType === "today" ? "Heute, " : dayType === "tomorrow" ? "Morgen, " : "";
    return prefix + formatDateLabel(dateISO) + ", " + (selectedSlot || "Zeitfenster wird abgestimmt");
  }

  function initStep4() {
    var btn = document.getElementById("tw-step4-next");
    var photoInput = document.getElementById("tw-photo-input");
    var photoText = document.getElementById("tw-photo-text");
    var photoPreview = document.getElementById("tw-photo-preview");
    var photoImg = document.getElementById("tw-photo-img");

    photoInput.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) {
        photoAttached = false;
        photoText.textContent = "Foto auswählen";
        photoPreview.classList.add("is-hidden");
        return;
      }
      photoAttached = true;
      photoText.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function (ev) {
        photoImg.src = ev.target.result;
        photoPreview.classList.remove("is-hidden");
      };
      reader.readAsDataURL(file);
    });

    btn.addEventListener("click", function () {
      updatePriceBox();
      goToStep(5);
    });
  }

  function updatePriceBox() {
    var box = document.getElementById("price-box");
    if (!lastResult || !selectedPkg) return;
    var kmCost = lastResult.distanceKm * selectedPerKm;
    var total = selectedBase + kmCost;
    box.innerHTML =
      '<div class="price-box__label">Ihr MöbelTaxi</div>' +
      '<div class="price-box__amount">' + total.toFixed(2).replace(".", ",") + ' € <span>ca.</span></div>' +
      '<div class="price-box__breakdown">Paket ' + selectedPkg + ' · Strecke ca. ' + lastResult.distanceKm.toFixed(1) + ' km</div>';
  }

  function initBooking() {
    var bookErr = document.getElementById("taxi-book-error");
    document.querySelectorAll("[data-taxi-channel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = document.getElementById("taxi-name").value.trim();
        var phone = document.getElementById("taxi-phone").value.trim();
        bookErr.classList.add("is-hidden");

        if (!name || !phone) {
          bookErr.textContent = "Bitte Name und Telefonnummer angeben.";
          bookErr.classList.remove("is-hidden");
          return;
        }
        if (!lastResult || !selectedPkg) {
          bookErr.textContent = "Bitte zuerst Adresse und Paket wählen.";
          bookErr.classList.remove("is-hidden");
          return;
        }

        var kmCost = lastResult.distanceKm * selectedPerKm;
        var total = selectedBase + kmCost;
        var floorVal = document.getElementById("tw-floor").value.trim();
        var elevatorVal = document.querySelector('input[name="tw-elevator"]:checked');
        var assemblyVal = document.querySelector('input[name="tw-assembly"]:checked');
        var disposalVal = document.querySelector('input[name="tw-disposal"]:checked');

        var lines = [
          "MöbelTaxi-Buchungsanfrage:",
          "Name: " + name,
          "Telefon: " + phone,
          "Abholadresse: " + lastResult.from,
          "Lieferadresse: " + lastResult.to,
          "Paket: " + selectedPkg,
          "Wunschtermin: " + terminText(),
          "Etage: " + (floorVal || "nicht angegeben"),
          "Aufzug vorhanden: " + (elevatorVal ? elevatorVal.value : "nicht angegeben"),
          "Montage gewünscht: " + (assemblyVal ? assemblyVal.value : "nicht angegeben"),
          "Verpackungsentsorgung: " + (disposalVal ? disposalVal.value : "nicht angegeben"),
          "Geschätzter Preis: ca. " + total.toFixed(2).replace(".", ",") + " €"
        ];
        if (photoAttached) lines.push("Foto: ausgewählt (bitte dieser Nachricht manuell anhängen)");
        var text = lines.join("\n");

        var channel = this.getAttribute("data-taxi-channel");
        var url;
        if (channel === "whatsapp") {
          url = "https://wa.me/4915751017172?text=" + encodeURIComponent(text);
        } else if (channel === "telegram") {
          url = "https://t.me/VektorTransport?text=" + encodeURIComponent(text);
        } else {
          url = "mailto:info@vektor-transport.de?subject=" + encodeURIComponent("MöbelTaxi-Buchungsanfrage von " + name) + "&body=" + encodeURIComponent(text);
        }

        document.getElementById("tw-body").classList.add("is-hidden");
        document.getElementById("taxi-done").classList.remove("is-hidden");

        if (channel === "email") {
          window.location.href = url;
        } else {
          window.open(url, "_blank", "noopener");
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMap();
    goToStep(1);
    initBackButtons();
    initStep1();
    initStep2();
    initStep3();
    initStep4();
    initBooking();
  });
})();
