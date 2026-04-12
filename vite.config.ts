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
      const src = `importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");
firebase.initializeApp(${json});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "StartAvto";
  const body = (payload.notification && payload.notification.body) || "";
  return self.registration.showNotification(title, {
    body,
    icon: "/app-icon-v6.png",
    badge: "/favicon.svg",
    data: payload.data || {},
  });
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
