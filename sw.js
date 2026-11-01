/* Offline cache for the app shell. Relay traffic (ntfy.sh) always goes to the network. */
var CACHE = "hcdr-v1";
var FILES = ["./", "index.html", "css/app.css", "js/content.js", "js/vendor/qrcode.js", "js/relay.js", "js/app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "fonts/open-sans-latin-300-normal.woff2", "fonts/open-sans-latin-400-normal.woff2", "fonts/open-sans-latin-600-normal.woff2", "fonts/open-sans-latin-700-normal.woff2"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
/* Same-origin files: network first so updates arrive, cache when offline. */
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match("index.html"); }); }));
});
