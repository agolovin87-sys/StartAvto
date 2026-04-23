import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_VERSION,
  fetchServerVersion,
  forceUpdateApp,
  isUpdateAvailable,
  isUpdateSkipped,
  markNotificationShown,
  saveCurrentVersion,
  showUpdateBanner,
  skipUpdate,
  wasNotificationShown,
} from "@/utils/versionManager";

interface UseAppUpdateReturn {
  isUpdating: boolean;
  checkForUpdates: (showBannerOnAvailable?: boolean) => Promise<boolean>;
  forceUpdate: () => Promise<void>;
  updateAvailable: boolean;
  lastCheckTime: Date | null;
  showManualHint: boolean;
  dismissManualHint: () => void;
}

const AUTO_CHECK_INTERVAL = 86_400_000; // 24 часа
const MANUAL_HINT_KEY = "pull_to_refresh_hint_shown";

export const useAppUpdate = (): UseAppUpdateReturn => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem("last_update_check");
    return saved ? new Date(parseInt(saved, 10)) : null;
  });
  const [showManualHint, setShowManualHint] = useState(
    () => localStorage.getItem(MANUAL_HINT_KEY) !== "true"
  );

  const checkInProgress = useRef(false);
  const bannerRef = useRef<HTMLElement | null>(null);

  // На первом запуске сохраняем базовую версию, чтобы было с чем сравнивать.
  useEffect(() => {
    const storedVersion = localStorage.getItem("app_version");
    const storedBuild = localStorage.getItem("app_build");
    if (!storedVersion || !storedBuild) {
      void fetchServerVersion()
        .then((server) => {
          saveCurrentVersion({
            version: server?.version || APP_VERSION,
            buildHash: server?.buildHash || "initial",
          });
        })
        .catch(() => {
          saveCurrentVersion({ version: APP_VERSION, buildHash: "initial" });
        });
    }
  }, []);

  const forceUpdate = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await forceUpdateApp();
    } catch (error) {
      console.error("Ошибка при обновлении:", error);
      setIsUpdating(false);
    }
  }, [isUpdating]);

  const checkForUpdates = useCallback(
    async (showBannerOnAvailable = true): Promise<boolean> => {
      if (checkInProgress.current) return false;
      checkInProgress.current = true;
      try {
        const hasUpdate = await isUpdateAvailable();
        setUpdateAvailable(hasUpdate);
        const now = Date.now();
        localStorage.setItem("last_update_check", String(now));
        setLastCheckTime(new Date(now));

        if (hasUpdate) {
          const serverVersion = await fetchServerVersion();
          const version = serverVersion?.version || "unknown";
          const skipped = isUpdateSkipped(version);
          const shown = wasNotificationShown(version);

          if (!skipped && !shown && showBannerOnAvailable) {
            bannerRef.current?.remove();
            bannerRef.current = showUpdateBanner(
              () => {
                void forceUpdate();
              },
              () => {
                skipUpdate(version);
                markNotificationShown(version);
              }
            );
            markNotificationShown(version);
          }
        }

        return hasUpdate;
      } catch (error) {
        console.error("Ошибка проверки обновлений:", error);
        return false;
      } finally {
        checkInProgress.current = false;
      }
    },
    [forceUpdate]
  );

  // Фоновая проверка: через 10 секунд после входа и далее раз в сутки.
  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void checkForUpdates(true);
    }, 10_000);
    const interval = window.setInterval(() => {
      void checkForUpdates(true);
    }, AUTO_CHECK_INTERVAL);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      bannerRef.current?.remove();
    };
  }, [checkForUpdates]);

  const dismissManualHint = useCallback(() => {
    setShowManualHint(false);
    localStorage.setItem(MANUAL_HINT_KEY, "true");
  }, []);

  return {
    isUpdating,
    checkForUpdates,
    forceUpdate,
    updateAvailable,
    lastCheckTime,
    showManualHint,
    dismissManualHint,
  };
};

