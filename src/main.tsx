import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { DriveLocationSharingUiProvider } from "@/context/DriveLocationSharingUiContext";
import { installWebAudioUnlockListeners } from "@/audio/unlockWebAudio";
import { initThemeOnLoad } from "@/theme/themeSettings";
import App from "@/App";
import "@/styles/index.css";

initThemeOnLoad();
installWebAudioUnlockListeners();

/** Фиксация книжной ориентации там, где API доступен (часто только в PWA / после жеста). */
function tryLockPortraitOrientation(): void {
  const o = screen.orientation as ScreenOrientation & {
    lock?: (type: "portrait-primary") => Promise<void>;
  };
  if (o?.lock) {
    void o.lock("portrait-primary").catch(() => {});
  }
}

if (typeof window !== "undefined") {
  tryLockPortraitOrientation();
}

/**
 * Без React StrictMode: иначе в dev двойной mount эффектов + onSnapshot даёт гонку в
 * Firestore SDK (INTERNAL ASSERTION FAILED ca9 / ve:-1). См. firebase-js-sdk#9267.
 */
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <DriveLocationSharingUiProvider>
        <App />
      </DriveLocationSharingUiProvider>
    </AuthProvider>
  </BrowserRouter>
);

/**
 * Service Worker: один файл `sw.js` (Workbox + importScripts firebase-messaging-sw.js).
 * Регистрируем сразу в prod: FCM ждёт активный SW до getToken.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
