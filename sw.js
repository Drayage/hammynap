const CACHE = 'hammynap-v1';
const PRECACHE = [
  './',
  './index.html',
  './css/main.css',
  './css/cards.css',
  './css/animations.css',
  './js/main.js',
  './js/engine/GameEngine.js',
  './js/engine/StateManager.js',
  './js/engine/RuleEngine.js',
  './js/engine/AiPlayer.js',
  './js/data/cards.js',
  './js/data/hamsters.js',
  './js/ui/Renderer.js',
  './js/ui/HamsterView.js',
  './js/ui/CardAnimator.js',
  './js/records/RecordManager.js',
  './js/records/RecordViewer.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // GET 요청만 캐시
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached ?? fetch(e.request).then(res => {
        // 성공한 응답은 캐시에 저장
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }))
  );
});
