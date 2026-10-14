// BizCard Pro AI 서비스워커
// [추가] PWA(홈 화면 추가, 전체화면 실행)를 위한 최소한의 서비스워커.
// 이 앱은 명함/프로젝트/업무일지 등 실시간으로 바뀌는 데이터를 다루는 CRM이라, API 응답을
// 캐싱하면 오래된(stale) 데이터가 화면에 보이는 위험이 있다. 그래서 /api/* 요청은 절대
// 캐시하지 않고 항상 네트워크로 보낸다. 정적 리소스(JS/CSS/이미지)만 "네트워크 우선,
// 실패 시 캐시" 전략으로 처리해서, 오프라인이거나 네트워크가 불안정할 때도 앱 셸(화면
// 골격)은 뜨도록 해준다.
const CACHE_NAME = 'bizcard-pro-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // API 요청/다른 출처 요청은 서비스워커가 손대지 않고 그대로 네트워크로 통과시킨다.
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
