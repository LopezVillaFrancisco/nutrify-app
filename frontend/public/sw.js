// Service worker: hace que la app instalada abra rápido y funcione con mala señal.
// - Archivos de Next con hash (/_next/static): caché primero (nunca cambian).
// - Pantallas: red primero, con la copia guardada como respaldo sin conexión.
// - No toca /api, /auth ni otros orígenes (Supabase): los datos siempre vienen frescos.
const CACHE = "nutrify-v5";
const SHELL = ["/", "/anotar", "/alimentos", "/gym", "/semana", "/perfil", "/login", "/manifest.webmanifest", "/nutrify-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const save = (req, res) => {
  if (res.ok && res.type === "basic" && !res.redirected) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => save(req, res))));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => save(req, res))
      .catch(() => caches.match(req).then((r) => r || Response.error())),
  );
});
