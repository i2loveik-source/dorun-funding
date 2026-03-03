const CACHE_NAME = 'smart-hub-v1';
const OFFLINE_URL = '/offline.html';

// 캐시할 정적 리소스
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// 설치: 정적 리소스 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // API 요청은 네트워크만
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        // 오프라인일 때 API 요청 → IndexedDB 큐에 저장 (클라이언트에서 처리)
        return new Response(JSON.stringify({ offline: true, message: 'You are offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 정적 리소스: 네트워크 우선 → 캐시 폴백
  event.respondWith(
    fetch(request)
      .then(response => {
        // 성공 시 캐시에 저장
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(r => r || caches.match(OFFLINE_URL)))
  );
});

// 메시지 큐 동기화 (Background Sync)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  // IndexedDB에서 대기 중인 메시지를 가져와 전송
  // (클라이언트에서 구현)
}
