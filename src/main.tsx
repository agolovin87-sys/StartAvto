import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
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
      <App />
    </AuthProvider>
  </BrowserRouter>
);

/** Регистрируем сразу: на Android иначе React успевает запросить токен до `load`, и FCM зависает на SW. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
}
