/* ==========================================================================
   ServeGo — Service Worker
   - Rede primeiro para tudo do próprio site: o app sempre carrega a versão
     mais nova; o cache só entra quando a internet cai ou está lenta demais.
   - Supabase, Mercado Pago e outros domínios nunca passam pelo cache.
   - Sem internet e sem cópia guardada: mostra offline.html.
   Ao publicar mudanças grandes, aumente VERSION para limpar o cache antigo.
   ========================================================================== */
const VERSION = "servego-v1";
const SHELL = [
  "app.html", "index.html", "offline.html", "manifest.webmanifest",
  "css/tokens.css", "css/base.css", "css/components.css", "css/app.css", "css/flow.css",
  "css/identity.css", "css/dashboard.css", "css/admin-control.css", "css/landing.css",
  "js/config.js", "js/icons.js", "js/theme.js", "js/ui.js", "js/dashboard.js", "js/supabaseClient.js",
  "js/mock.js", "js/api.js", "js/api-admin.js", "js/router.js", "js/app.js",
  "assets/logo-mark.svg", "assets/icon-192.png", "assets/icon-512.png", "assets/favicon.png"
];
const NETWORK_TIMEOUT = 6000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))   // um arquivo faltando não trava a instalação
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // APIs e CDNs: direto na rede

  e.respondWith(
    Promise.race([fetch(req), timeout(NETWORK_TIMEOUT)])
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("offline.html");
          return new Response("", { status: 504, statusText: "Offline" });
        })
      )
  );
});
