import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useOfflineStatus, type OfflineToast } from "@/hooks/useOfflineStatus";
import { flushMutationQueue, getPendingSyncRequestCount } from "@/utils/offlineApi";
import "@/styles/offline.css";

export type OfflineUiContextValue = {
  isOnline: boolean;
  checking: boolean;
  wasOffline: boolean;
  lastOnlineTime: number | null;
  pendingSync: number;
  refreshPendingSync: () => void;
  retrySync: () => void;
  toasts: OfflineToast[];
  dismissToast: (id: string) => void;
};

const OfflineUiContext = createContext<OfflineUiContextValue | null>(null);

function OfflineToastStack({
  toasts,
  dismissToast,
}: {
  toasts: OfflineToast[];
  dismissToast: (id: string) => void;
}) {
  return (
    <div className="offline-toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`offline-toast offline-toast--${t.kind}`} role="status">
          <span>{t.message}</span>
          <button
            type="button"
            className="offline-toast-close"
            aria-label="Закрыть"
            onClick={() => dismissToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Единый источник статуса сети, очереди синхронизации и тостов (без нижней панели — индикатор в шапке AppShell).
 */
export function OfflineUiProvider({ children }: { children: ReactNode }) {
  const offline = useOfflineStatus(true);
  const [pendingSync, setPendingSync] = useState(0);

  const refreshPendingSync = useCallback(() => {
    setPendingSync(getPendingSyncRequestCount());
  }, []);

  useEffect(() => {
    refreshPendingSync();
    const id = window.setInterval(refreshPendingSync, 3_000);
    return () => window.clearInterval(id);
  }, [refreshPendingSync, offline.isOnline]);

  const retrySync = useCallback(() => {
    void flushMutationQueue().finally(refreshPendingSync);
    void offline.checkConnection();
  }, [offline.checkConnection, refreshPendingSync]);

  const value = useMemo<OfflineUiContextValue>(
    () => ({
      isOnline: offline.isOnline,
      checking: offline.checking,
      wasOffline: offline.wasOffline,
      lastOnlineTime: offline.lastOnlineTime,
      pendingSync,
      refreshPendingSync,
      retrySync,
      toasts: offline.toasts,
      dismissToast: offline.dismissToast,
    }),
    [
      offline.isOnline,
      offline.checking,
      offline.wasOffline,
      offline.lastOnlineTime,
      offline.toasts,
      offline.dismissToast,
      pendingSync,
      refreshPendingSync,
      retrySync,
    ]
  );

  return (
    <OfflineUiContext.Provider value={value}>
      <OfflineToastStack toasts={offline.toasts} dismissToast={offline.dismissToast} />
      {children}
    </OfflineUiContext.Provider>
  );
}

export function useOfflineUi(): OfflineUiContextValue {
  const ctx = useContext(OfflineUiContext);
  if (!ctx) {
    throw new Error("useOfflineUi: провайдер OfflineUiProvider не найден");
  }
  return ctx;
}
