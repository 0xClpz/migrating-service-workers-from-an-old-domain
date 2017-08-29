const ressources = [
  '/',
  '/index.html',
  '/style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('sw-demo').then((cache) =>
      cache.addAll(ressources)
    )
  );
 });

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) =>
      response || fetch(event.request)
    )
  );
});
