const CACHE = 'hammynap-v2';
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
  './js/engine/TournamentManager.js',
  './js/firebase/Sync.js',
  './js/data/cards.js',
  './js/data/hamsters.js',
  './js/ui/Renderer.js',
  './js/ui/HamsterView.js',
  './js/ui/CardAnimator.js',
  './js/ui/SoundManager.js',
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
  // 네트워크 우선: 캐시 우선 방식은 한 번 방문한 기기에 배포된 새 코드가
  // 영원히 반영되지 않는 문제가 있었음 (재접속해도 예전 버전이 계속 보임).
  // 온라인이면 항상 최신 파일을 받고, 오프라인일 때만 캐시로 대체한다.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
