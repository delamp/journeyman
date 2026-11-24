// Journeyman's offline helper. It keeps a copy of the app so it opens without signal, and it catches
// screenshots / clips shared in from other apps (Gallery, PlayStation / Xbox app) and hands them to the page.
// Your notes and media always come live from your Google backend.
const CACHE = 'journeyman-v17';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('journeyman-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Android share sheet -> Journeyman: stash the files, then open the app on its capture screen.
  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const box = await caches.open('jm-share');
        for (const k of await box.keys()) await box.delete(k);
        const files = form.getAll('media').filter((f) => f && typeof f !== 'string');
        let i = 0;
        for (const f of files) {
          await box.put('./shared/' + (i++), new Response(f, { headers: { 'content-type': f.type, 'x-name': encodeURIComponent(f.name || 'shared') } }));
        }
        const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join(' — ');
        if (text) await box.put('./shared/text', new Response(new Blob([text], { type: 'text/plain' }), { headers: { 'x-name': '__text__' } }));
      } catch (e) { /* open the app anyway */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  // Never touch the Apps Script / Drive calls or anything else off this site.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && !url.search) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./')))
  );
});
