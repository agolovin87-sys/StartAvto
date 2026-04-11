import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** HTTPS в dev: микрофон (getUserMedia) в Safari/Chrome не работает по http://IP в LAN. */
export default defineConfig(({ mode }) => {
  const publicSiteOrigin = resolvePublicSiteOrigin(mode);

  return {
  plugins: [react(), basicSsl(), htmlOpenGraphPlugin(publicSiteOrigin)],
  /** Явно тянем firebase в pre-bundle, чтобы не залипала старая версия в node_modules/.vite/deps. */
  optimizeDeps: {
    include: [
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
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
