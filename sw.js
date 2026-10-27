// Called to Pray service worker.
// Caches the app shell only. Audio (.mp3) is never pre-cached; it streams from the site.
// Bible text files are cached as they are opened so recently read books work offline.
const VERSION = 'ctp-v1.0.6';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/util.js', './js/store.js', './js/bible.js', './js/audio.js', './js/speech.js', './js/content.js', './js/qr.js', './js/feedback.js', './js/install.js',
  './js/views/today.js', './js/views/pray.js', './js/views/groups.js', './js/views/listen.js', './js/views/me.js', './js/views/onboarding.js',
  './data/books.json', './data/audio_index.json', './data/topics.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg', './icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + '-bible' && k.startsWith('ctp-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // Firebase, fonts: browser handles
  if (/\.(mp3|m4a|wav)$/i.test(url.pathname) || req.headers.has('range')) return; // stream audio
  const isBible = url.pathname.includes('/data/bible/');
  if (isBible) {
    // cache-first, fill on demand
    e.respondWith(caches.open(VERSION + '-bible').then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  // App shell: network first so updates arrive, fall back to cache offline.
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
