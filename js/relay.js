/* =====================================================================
   Relay: how phones and the facilitator's screen talk to each other.

   GitHub Pages only serves files, so messages travel through a public
   ntfy server (https://ntfy.sh by default): a phone publishes to a topic
   and the facilitator's screen listens to it. Everything is encrypted on
   the device first (AES-GCM, key derived from the room code), so the relay
   only ever sees ciphertext. The room code never leaves the devices: the
   topic name is a hash of it, not the code itself.
   ===================================================================== */
(function () {
  "use strict";
  var DEFAULT_BASE = "https://ntfy.sh";
  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   /* no 0/O, 1/I */
  var enc = new TextEncoder(), dec = new TextDecoder();

  /* A different relay can be used for local testing only. */
  function base() {
    try {
      var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      var q = new URLSearchParams(location.search).get("relay");
      if (local && q) { localStorage.setItem("hcdr.relay", q); return q; }
      if (local) { var s = localStorage.getItem("hcdr.relay"); if (s) return s; }
    } catch (e) { /* ignore */ }
    return DEFAULT_BASE;
  }

  function newCode() {
    var a = new Uint8Array(6), s = "";
    crypto.getRandomValues(a);
    for (var i = 0; i < 6; i++) s += ALPHABET[a[i] % ALPHABET.length];
    return s;
  }
  function cleanCode(s) { return String(s || "").toUpperCase().split("").filter(function (c) { return ALPHABET.indexOf(c) !== -1; }).join("").slice(0, 6); }
  function validCode(s) { return typeof s === "string" && s.length === 6 && s.split("").every(function (c) { return ALPHABET.indexOf(c) !== -1; }); }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function b64(bytes) { var s = ""; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

  /* Topic and key, both derived from the room code. */
  function derive(code) {
    var topicP = crypto.subtle.digest("SHA-256", enc.encode("hcdr-topic-v1:" + code)).then(function (h) { return "hcdr-" + hex(h).slice(0, 24); });
    var keyP = crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("hcdr-key-v1"), iterations: 150000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
    return Promise.all([topicP, keyP]).then(function (r) { return { code: code, topic: r[0], key: r[1] }; });
  }
  function seal(room, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, room.key, enc.encode(JSON.stringify(obj))).then(function (ct) {
      var all = new Uint8Array(12 + ct.byteLength); all.set(iv, 0); all.set(new Uint8Array(ct), 12);
      return "v1." + b64(all);
    });
  }
  function open(room, text) {
    if (typeof text !== "string" || text.indexOf("v1.") !== 0) return Promise.resolve(null);
    try {
      var all = unb64(text.slice(3));
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, room.key, all.slice(12))
        .then(function (pt) { return JSON.parse(dec.decode(pt)); }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function publish(room, obj) {
    return seal(room, obj).then(function (body) {
      return fetch(base() + "/" + room.topic, { method: "POST", body: body, cache: "no-store" }).then(function (r) {
        if (!r.ok) { var e = new Error("relay " + r.status); e.status = r.status; throw e; }
        return r.json();
      });
    });
  }

  /* Listen to a room. onMessage receives each decrypted message once, oldest first,
     with the relay's time; onStatus receives "live", "reconnecting" or "offline". */
  function listen(room, onMessage, onStatus) {
    var seen = {}, es = null, closed = false, retry = 0, timer = null;
    var chain = Promise.resolve();
    function handle(raw) {
      var m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.event === "open") { retry = 0; onStatus("live"); return; }
      if (m.event !== "message" || seen[m.id]) return;
      seen[m.id] = 1;
      chain = chain.then(function () { return open(room, m.message); }).then(function (obj) { if (obj) onMessage(obj, m.time); });
    }
    function connect() {
      if (closed) return;
      es = new EventSource(base() + "/" + room.topic + "/sse?since=all");
      es.onmessage = function (ev) { handle(ev.data); };
      es.addEventListener("open", function () { onStatus("live"); });
      es.onerror = function () {
        if (closed) return;
        onStatus(navigator.onLine === false ? "offline" : "reconnecting");
        if (es.readyState === 2) { es.close(); retry++; clearTimeout(timer); timer = setTimeout(connect, Math.min(15000, 1000 * Math.pow(2, retry))); }
      };
    }
    connect();
    return { close: function () { closed = true; clearTimeout(timer); if (es) es.close(); } };
  }

  window.Relay = { base: base, newCode: newCode, cleanCode: cleanCode, validCode: validCode, derive: derive, publish: publish, listen: listen, seal: seal, open: open };
})();
