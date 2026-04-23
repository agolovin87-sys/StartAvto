export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";
export const BUILD_HASH =
  import.meta.env.VITE_APP_BUILD_HASH || "dev";

const VERSION_KEY = "app_version";
const BUILD_KEY = "app_build";
const UPDATE_CHECK_KEY = "last_update_check";
const UPDATE_SKIP_KEY = "update_skipped_version";
const NOTIFICATION_SHOWN_KEY = "update_notification_shown";

export interface VersionInfo {
  version: string;
  buildHash: string;
  buildDate: string;
}

// Сохранение текущей версии в локальное хранилище.
export const saveCurrentVersion = (
  info?: Partial<Pick<VersionInfo, "version" | "buildHash">>
): void => {
  localStorage.setItem(VERSION_KEY, info?.version || APP_VERSION);
  localStorage.setItem(BUILD_KEY, info?.buildHash || BUILD_HASH);
  localStorage.setItem(UPDATE_CHECK_KEY, Date.now().toString());
};

// Получение сохраненной версии.
export const getStoredVersion = (): { version: string; buildHash: string } | null => {
  const version = localStorage.getItem(VERSION_KEY);
  const buildHash = localStorage.getItem(BUILD_KEY);
  if (!version || !buildHash) return null;
  return { version, buildHash };
};

const VERSION_FETCH_TIMEOUT_MS = 10_000;

// Получение версии с сервера (из public/version.json).
export const fetchServerVersion = async (): Promise<VersionInfo | null> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), VERSION_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as VersionInfo;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Не удалось получить version.json (сеть/таймаут):", error);
    }
    return null;
  } finally {
    window.clearTimeout(timer);
  }
};

// Проверка наличия обновления относительно сохраненной версии.
export const isUpdateAvailable = async (): Promise<boolean> => {
  const serverVersion = await fetchServerVersion();
  if (!serverVersion) return false;
  const storedVersion = getStoredVersion();
  // Первый запуск: не считаем это «доступно обновление», иначе ложные срабатывания и лишняя нагрузка.
  if (!storedVersion) {
    saveCurrentVersion({
      version: serverVersion.version,
      buildHash: serverVersion.buildHash,
    });
    return false;
  }
  return (
    storedVersion.version !== serverVersion.version ||
    storedVersion.buildHash !== serverVersion.buildHash
  );
};

export const isUpdateSkipped = (version: string): boolean => {
  const skipped = localStorage.getItem(UPDATE_SKIP_KEY);
  return skipped === version;
};

export const skipUpdate = (version: string): void => {
  localStorage.setItem(UPDATE_SKIP_KEY, version);
};

export const markNotificationShown = (version: string): void => {
  localStorage.setItem(
    NOTIFICATION_SHOWN_KEY,
    JSON.stringify({
      shown: true,
      version,
      timestamp: Date.now(),
    })
  );
};

export const wasNotificationShown = (version: string): boolean => {
  const data = localStorage.getItem(NOTIFICATION_SHOWN_KEY);
  if (!data) return false;
  try {
    const parsed = JSON.parse(data) as { shown?: boolean; version?: string };
    return parsed.version === version && parsed.shown === true;
  } catch {
    return false;
  }
};

// Принудительное обновление: пытаемся активировать waiting SW и перезагружаем приложение.
export const forceUpdateApp = async (): Promise<void> => {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    await new Promise<void>((resolve) => {
      if (!registration) {
        resolve();
        return;
      }
      const onControllerChange = () => {
        resolve();
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange
        );
      };
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange
      );
      setTimeout(() => resolve(), 1500);
    });
  }

  const latest = await fetchServerVersion();
  saveCurrentVersion({
    version: latest?.version,
    buildHash: latest?.buildHash,
  });

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }

  window.location.reload();
};

// Ненавязчивый баннер обновления.
export const showUpdateBanner = (
  onUpdate: () => void,
  onDismiss: () => void
): HTMLElement | null => {
  if (document.querySelector(".update-banner")) return null;

  const banner = document.createElement("div");
  banner.className = "update-banner";
  banner.innerHTML = `
    <div class="update-banner-content">
      <div class="update-banner-icon">🔄</div>
      <div class="update-banner-text">
        <div class="update-banner-title">Доступна новая версия</div>
        <div class="update-banner-subtitle">Обновите приложение для лучшей работы</div>
      </div>
      <div class="update-banner-actions">
        <button class="update-banner-dismiss" type="button" aria-label="Напомнить позже">⏰</button>
        <button class="update-banner-update" type="button">Обновить</button>
      </div>
    </div>
  `;

  banner.querySelector(".update-banner-update")?.addEventListener("click", () => {
    banner.remove();
    onUpdate();
  });

  banner.querySelector(".update-banner-dismiss")?.addEventListener("click", () => {
    banner.remove();
    onDismiss();
  });

  setTimeout(() => {
    if (document.body.contains(banner)) {
      banner.remove();
      onDismiss();
    }
  }, 15_000);

  document.body.appendChild(banner);
  return banner;
};

