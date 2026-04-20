import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const DEFAULT_PUBLIC_SITE_ORIGIN = "https://startavto-cf419.web.app";

function resolvePublicSiteOrigin(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  const raw = (env.VITE_PUBLIC_SITE_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (raw) return raw;
  return DEFAULT_PUBLIC_SITE_ORIGIN;
}

function htmlOpenGraphPlugin(siteOrigin: string) {
  const iconUrl = `${siteOrigin}/app-icon-v6.png`;
  const block = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="StartAvto" />
    <meta property="og:locale" content="ru_RU" />
    <meta property="og:title" content="StartAvto — Автошкола" />
    <meta property="og:description" content="Личный кабинет автошколы: вход, регистрация, расписание и чат." />
    <meta property="og:image" content="${iconUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:image:alt" content="StartAvto" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="StartAvto — Автошкола" />
    <meta name="twitter:description" content="Личный кабинет автошколы: вход, регистрация, расписание и чат." />
    <meta name="twitter:image" content="${iconUrl}" />
`;
  return {
    name: "html-open-graph",
    transformIndexHtml(html: string) {
      const afterTitle = "</title>";
      if (html.includes(afterTitle)) {
        return html.replace(afterTitle, `${afterTitle}${block}`);
      }
      return html.replace("</head>", `${block}</head>`);
    },
  };
}

function firebaseJsVersionForSw(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")) as {
      dependencies?: { firebase?: string };
    };
    const v = raw.dependencies?.firebase ?? "12.11.0";
    return String(v).replace(/^[\^~]/, "");
  } catch {
    return "12.11.0";
  }
}

/** Подставляет ключ Яндекс.Карт в статические примеры `public/samples/*.html` в dist. */
function yandexSamplesApiKeyPlugin(mode: string): Plugin {
  return {
    name: "inject-yandex-key-samples",
    apply: "build",
    closeBundle() {
      const env = loadEnv(mode, process.cwd(), "");
      const key = (env.VITE_YANDEX_MAPS_API_KEY ?? "").trim();
      const distSamples = path.resolve(__dirname, "dist", "samples");
      if (!fs.existsSync(distSamples)) return;
      const files = fs.readdirSync(distSamples).filter((f) => f.endsWith(".html"));
      for (const f of files) {
        const filePath = path.join(distSamples, f);
        let html = fs.readFileSync(filePath, "utf8");
        if (!html.includes("apikey=YOUR_API_KEY")) continue;
        if (!key) {
          console.warn(
            `[vite] ${f}: VITE_YANDEX_MAPS_API_KEY пуст — в URL остаётся apikey=YOUR_API_KEY.`
          );
          continue;
        }
        const enc = encodeURIComponent(key);
        html = html.replace(/\?apikey=YOUR_API_KEY\b/g, "?apikey=" + enc);
        fs.writeFileSync(filePath, html, "utf8");
      }
    },
  };
}

/** Генерирует `dist/firebase-messaging-sw.js` для FCM (фоновые push). */
function firebaseMessagingSwPlugin(mode: string): Plugin {
  return {
    name: "emit-firebase-messaging-sw",
    apply: "build",
    closeBundle() {
      const env = loadEnv(mode, process.cwd(), "");
      const cfg = {
        apiKey: env.VITE_FIREBASE_API_KEY ?? "",
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId: env.VITE_FIREBASE_APP_ID ?? "",
      };
      if (!cfg.apiKey || !cfg.projectId) {
        console.warn(
          "[vite] firebase-messaging-sw.js не создан: задайте VITE_FIREBASE_* в .env для сборки."
        );
        return;
      }
      const outDir = path.resolve(__dirname, "dist");
      const json = JSON.stringify(cfg);
      const fbVer = firebaseJsVersionForSw();
      const src = `importScripts("https://www.gstatic.com/firebasejs/${fbVer}/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/${fbVer}/firebase-messaging-compat.js");
firebase.initializeApp(${json});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const title =
    (typeof d.title === "string" && d.title) ||
    (payload.notification && payload.notification.title) ||
    "\u2060";
  const body =
    (typeof d.body === "string" && d.body) ||
    (payload.notification && payload.notification.body) ||
    "";
  const opts = {
    body,
    icon: "/app-icon-v6.png",
    badge: "/favicon.svg",
    data: d,
    tag:
      d.kind === "chat" && typeof d.chatId === "string" && d.chatId
        ? "chat-" + d.chatId
        : "startavto-" + (typeof d.kind === "string" ? d.kind : "msg"),
  };
  return self.registration.showNotification(title, opts);
});
self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
`;
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "firebase-messaging-sw.js"), src, "utf8");
    },
  };
}

/** HTTPS в dev: микрофон (getUserMedia) в Safari/Chrome не работает по http://IP в LAN. */
export default defineConfig(({ mode }) => {
  const publicSiteOrigin = resolvePublicSiteOrigin(mode);

  return {
  plugins: [
    react(),
    basicSsl(),
    htmlOpenGraphPlugin(publicSiteOrigin),
    VitePWA({
      /** В dev не подменяем SW — проверка: `npm run build && npm run preview`. */
      registerType: "autoUpdate",
      manifest: false,
      filename: "sw.js",
      includeAssets: ["favicon.ico", "app-icon-v6.png", "favicon.svg", "robots.txt", "offline.html"],
      /**
       * Не кладите `public/sw.js`: при копировании public в dist он перезаписал бы сгенерированный SW.
       * Кэш-стратегии задаются здесь (Workbox).
       */
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        /**
         * Фоновые push: отдельный файл собирает `firebaseMessagingSwPlugin` в dist.
         * Подключается тем же регистрацией `sw.js`, отдельно `firebase-messaging-sw.js` не регистрируем.
         */
        importScripts: ["firebase-messaging-sw.js"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.gstatic\.com\/generate_204$/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/connectivitycheck\.gstatic\.com\/generate_204$/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/firebase\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/api\.startavto\.ru\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "startavto-api-v1",
              expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/api-maps\.yandex\.ru\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "startavto-maps-v1",
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/[^/]+\.maps\.yandex\.net\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "startavto-maps-v1",
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/core-renderer-tiles\.maps\.yandex\.net\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "startavto-maps-v1",
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "startavto-static-v1",
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "startavto-static-v1",
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "startavto-images-v1",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\.(?:js|css|woff2?)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "startavto-static-v1",
              expiration: { maxEntries: 80, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
    firebaseMessagingSwPlugin(mode),
    yandexSamplesApiKeyPlugin(mode),
  ],
  /** Явно тянем firebase в pre-bundle, чтобы не залипала старая версия в node_modules/.vite/deps. */
  optimizeDeps: {
    include: [
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
      "firebase/messaging",
    ],
  },
  server: {
    host: true,
  },
  /** Preview production build: HTTPS (самоподписанный), как dev — для микрофона и тестов по LAN. */
  preview: {
    host: true,
    port: 4173,
    https: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
