(function () {
  "use strict";

  var ROAD_FACTOR = 1.3; // straight-line distance -> rough road-distance estimate
  var WUPPERTAL = { lat: 51.2562, lon: 7.1508 };

  var selectedPkg = null;
  var selectedBase = 0;
  var selectedPerKm = 0;
  var lastResult = null; // { distanceKm, price, from, to }

  var map, fromMarker, toMarker, routeLine, van;

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
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (results) {
        if (!results || !results.length) return null;
        return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon), label: results[0].display_name };
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
    var mapEl = document.getElementById("taxi-map");
    if (!van || !map) return;

    function place(latlng) {
      var pt = map.latLngToContainerPoint(latlng);
      van.style.left = (pt.x - 15) + "px";
      van.style.top = (pt.y - 15) + "px";
    }

    van.style.transition = "none";
    place([from.lat, from.lon]);
    van.style.opacity = "1";
    // force reflow so the next transition actually animates
    void van.offsetWidth;
    van.style.transition = "left 1.6s linear, top 1.6s linear, opacity .3s ease";
    requestAnimationFrame(function () {
      place([to.lat, to.lon]);
    });
  }

  function updatePriceBox() {
    var box = document.getElementById("price-box");
    var bookBox = document.getElementById("taxi-book");
    if (!lastResult || !selectedPkg) {
      box.innerHTML = '<p class="price-box__placeholder">Adressen eingeben und Paket wählen, um den Preis zu sehen.</p>';
      bookBox.classList.add("is-hidden");
      return;
    }
    var kmCost = lastResult.distanceKm * selectedPerKm;
    var total = selectedBase + kmCost;
    box.innerHTML =
      '<div class="price-box__amount">' + total.toFixed(0) + ' € <span>ca.</span></div>' +
      '<div class="price-box__breakdown">' +
        'Paket ' + selectedPkg + ' &middot; Strecke: ca. ' + lastResult.distanceKm.toFixed(1) + ' km &middot; Startpreis ' + selectedBase + ' € + ' + kmCost.toFixed(2) + ' € Kilometerpreis (' + selectedPerKm.toFixed(2) + ' €/km)' +
      '</div>';
    bookBox.classList.remove("is-hidden");
  }

  function initPackages() {
    var cards = document.querySelectorAll(".pkg-card");
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        cards.forEach(function (c) { c.classList.remove("is-active"); });
        card.classList.add("is-active");
        selectedPkg = card.getAttribute("data-pkg");
        selectedBase = parseFloat(card.getAttribute("data-base")) || 0;
        selectedPerKm = parseFloat(card.getAttribute("data-perkm")) || 0;
        updatePriceBox();
      });
    });
  }

  function initCalcButton() {
    var btn = document.getElementById("taxi-calc-btn");
    var err = document.getElementById("taxi-error");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var fromVal = document.getElementById("taxi-from").value.trim();
      var toVal = document.getElementById("taxi-to").value.trim();
      err.classList.add("is-hidden");

      if (!fromVal || !toVal) {
        err.textContent = "Bitte Abhol- und Zieladresse eingeben.";
        err.classList.remove("is-hidden");
        return;
      }
      if (!selectedPkg) {
        err.textContent = "Bitte eine Paketgröße wählen.";
        err.classList.remove("is-hidden");
        return;
      }

      var originalText = btn.textContent;
      btn.textContent = "Berechne...";

      Promise.all([geocode(fromVal), geocode(toVal)]).then(function (res) {
        btn.textContent = originalText;
        var from = res[0], to = res[1];
        if (!from || !to) {
          err.textContent = "Eine der Adressen konnte nicht gefunden werden. Bitte präzisieren (Straße, PLZ, Ort).";
          err.classList.remove("is-hidden");
          return;
        }
        var straight = haversineKm(from, to);
        var distanceKm = straight * ROAD_FACTOR;
        lastResult = { distanceKm: distanceKm, from: fromVal, to: toVal };
        updatePriceBox();
        drawRoute(from, to);
      }).catch(function () {
        btn.textContent = originalText;
        err.textContent = "Die Adressen konnten gerade nicht geprüft werden. Bitte versuchen Sie es erneut.";
        err.classList.remove("is-hidden");
      });
    });
  }

  function initBooking() {
    var bookErr = document.getElementById("taxi-book-error");
    document.querySelectorAll("#taxi-book [data-taxi-channel]").forEach(function (btn) {
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
          bookErr.textContent = "Bitte zuerst den Preis berechnen.";
          bookErr.classList.remove("is-hidden");
          return;
        }

        var kmCost = lastResult.distanceKm * selectedPerKm;
        var total = selectedBase + kmCost;
        var lines = [
          "MöbelTaxi-Anfrage:",
          "Name: " + name,
          "Telefon: " + phone,
          "Abholadresse: " + lastResult.from,
          "Zieladresse: " + lastResult.to,
          "Paket: " + selectedPkg,
          "Geschätzter Preis: ca. " + total.toFixed(0) + " €"
        ];
        var text = lines.join("\n");
        var channel = this.getAttribute("data-taxi-channel");
        var url;
        if (channel === "whatsapp") {
          url = "https://wa.me/4915751017172?text=" + encodeURIComponent(text);
        } else if (channel === "telegram") {
          url = "https://t.me/VektorTransport?text=" + encodeURIComponent(text);
        } else {
          url = "mailto:info@vektor-transport.de?subject=" + encodeURIComponent("MöbelTaxi-Anfrage von " + name) + "&body=" + encodeURIComponent(text);
        }

        document.getElementById("taxi-book").classList.add("is-hidden");
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
    initPackages();
    initCalcButton();
    initBooking();
  });
})();
