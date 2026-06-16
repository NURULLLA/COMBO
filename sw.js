const CACHE_NAME = 'cargo-trim-v6';

const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './lMC.png',
    './data.js',
    './script.js',
    './tailwind.min.js',
    './DragDropTouch.js',
    './chart.min.js',
    './chartjs-plugin-annotation.min.js',
    './fonts/inter.css',
    './fonts/2fecfab879de0e19960a8fd3ac730149.ttf',
    './fonts/bba19875300a30f312776300beb923f1.ttf',
    './fonts/39a6e567e6fcabba0315c2bc93cebad9.ttf',
    './fonts/284ea4d97a65337e846348e6f2363f56.ttf',
    './fonts/6201ab010846dd2b869ffd2b829130fa.ttf',
    './fonts/3e55b987707cedc8f821814309575d0f.ttf'
];

// Install: cache each file individually so one failure doesn't break everything
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            let ok = 0;
            await Promise.all(
                ASSETS.map(url =>
                    cache.add(url)
                        .then(() => ok++)
                        .catch(err => console.warn('[SW] skip:', url, err.message))
                )
            );
            console.log(`[SW] v6 installed — cached ${ok}/${ASSETS.length} assets`);
        })
    );
    self.skipWaiting();
});

// Activate: delete all old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => {
                    console.log('[SW] deleting old cache:', k);
                    return caches.delete(k);
                })
            )
        )
    );
    self.clients.claim();
});

// Fetch: Cache-first → serve instantly offline.
// When online, update cache in the background (stale-while-revalidate).
self.addEventListener('fetch', (event) => {
    // Only intercept same-origin GET requests
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);

            // Fetch in background to keep cache fresh
            const networkFetch = fetch(event.request)
                .then(response => {
                    if (response && response.status === 200) {
                        cache.put(event.request, response.clone());
                    }
                    return response;
                })
                .catch(() => null); // silent when offline

            // Return cache immediately if available (offline-first)
            // Otherwise wait for network
            return cached || networkFetch;
        })
    );
});
