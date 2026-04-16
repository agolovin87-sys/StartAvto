import { useCallback, useEffect, useRef, useState } from "react";
import { clearExpiredCache, setLastSyncTimeMs } from "@/utils/offlineCache";
import { flushMutationQueue } from "@/utils/offlineApi";
import { probeInternetReachable } from "@/utils/internetReachable";

export type OfflineToast = {
  id: string;
  message: string;
  kind: "info" | "success" | "warning";
};

export type UseOfflineStatusResult = {
  isOnline: boolean;
  /** Был ли переход в офлайн хотя бы раз за сессию (до сброса). */
  wasOffline: boolean;
  /** «Проверка» — жёлтый индикатор. */
  checking: boolean;
  lastOnlineTime: number | null;
  toasts: OfflineToast[];
  dismissToast: (id: string) => void;
  checkConnection: () => Promise<boolean>;
};

/**
 * Статус сети, тосты при потере/восстановлении, очистка TTL и flush очереди fetch при онлайне.
 */
export function useOfflineStatus(enabled = true): UseOfflineStatusResult {
  const [isOnline, setIsOnline] = useState(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true)
  );
  const [checking, setChecking] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [lastOnlineTime, setLastOnlineTime] = useState<number | null>(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) return Date.now();
    return null;
  });
  const [toasts, setToasts] = useState<OfflineToast[]>([]);

  const lastOnlineRef = useRef(lastOnlineTime);
  lastOnlineRef.current = lastOnlineTime;
  /** Чтобы не показывать «восстановлено» при первой успешной проверке без предшествующего офлайна. */
  const hadDisconnectRef = useRef(false);

  const pushToast = useCallback((message: string, kind: OfflineToast["kind"]) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5_000);
  }, []);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const ok = await probeInternetReachable();
      setIsOnline(ok);
      if (ok) {
        const now = Date.now();
        setLastOnlineTime(now);
        lastOnlineRef.current = now;
      }
      return ok;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onOffline = () => {
      hadDisconnectRef.current = true;
      setIsOnline(false);
      setWasOffline(true);
      pushToast("Нет соединения с интернетом", "warning");
    };

    const onOnline = () => {
      void (async () => {
        const ok = await probeInternetReachable();
        setIsOnline(ok);
        if (ok) {
          const now = Date.now();
          setLastOnlineTime(now);
          setLastSyncTimeMs(now);
          clearExpiredCache();
          try {
            await flushMutationQueue();
          } catch {
            /* */
          }
          if (hadDisconnectRef.current) {
            pushToast("Соединение восстановлено", "success");
            hadDisconnectRef.current = false;
          }
        }
      })();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void checkConnection();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, checkConnection, pushToast]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    isOnline,
    wasOffline,
    checking,
    lastOnlineTime,
    toasts,
    dismissToast,
    checkConnection,
  };
}
