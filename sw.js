const CACHE_NAME = 'cargo-trim-v5';

// Local files — must be cached (app won't work without them)
const LOCAL_ASSETS = [
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

// No more external CDN resources — everything is local now
const EXTERNAL_ASSETS = [];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache local files first — these are required
            await cache.addAll(LOCAL_ASSETS);
            // Cache external resources individually — skip on failure
            for (const url of EXTERNAL_ASSETS) {
                try {
                    await cache.add(url);
                } catch (e) {
                    console.warn('Could not cache external resource:', url);
                }
            }
        })
    );
    self.skipWaiting();
});

// Clear old caches on activate
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
