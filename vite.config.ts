import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

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
    "StartAvto";
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
