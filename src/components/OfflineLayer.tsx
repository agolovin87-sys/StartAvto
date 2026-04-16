import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { getPendingSyncRequestCount, flushMutationQueue } from "@/utils/offlineApi";
import { useCallback, useEffect, useState } from "react";
import "@/styles/offline.css";

type Props = {
  enabled?: boolean;
};

function IconWifiGood({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"
      />
    </svg>
  );
}

function IconWifiOff({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49L12 22l.01-.01-.02-.02L19.35 13.2l2.54 2.54 1.27-1.27L17.03 12.4z"
      />
    </svg>
  );
}

/**
 * Один экземпляр `useOfflineStatus`: индикатор внизу + тосты.
 */
export function OfflineLayer({ enabled = true }: Props) {
  const { isOnline, checking, checkConnection, toasts, dismissToast } = useOfflineStatus(enabled);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(() => {
    setPending(getPendingSyncRequestCount());
  }, []);

  useEffect(() => {
    refreshPending();
    const id = window.setInterval(refreshPending, 3_000);
    return () => window.clearInterval(id);
  }, [refreshPending, isOnline]);

  const onRetrySync = () => {
    void flushMutationQueue().finally(refreshPending);
    void checkConnection();
  };

  let state: "ok" | "check" | "off" = "ok";
  if (checking) state = "check";
  else if (!isOnline) state = "off";

  const label =
    state === "ok"
      ? "Онлайн"
      : state === "check"
        ? "Проверка соединения…"
        : "Нет соединения";

  return (
    <>
      <div className="offline-toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`offline-toast offline-toast--${t.kind}`}
            role="status"
          >
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

      <div
        className={`offline-indicator offline-indicator--${state}`}
        role="status"
        aria-live="polite"
      >
        <span className="offline-indicator-dot" aria-hidden />
        {state === "off" ? (
          <IconWifiOff className="offline-indicator-ico" />
        ) : (
          <IconWifiGood className="offline-indicator-ico" />
        )}
        <span className="offline-indicator-label">{label}</span>
        {pending > 0 ? (
          <span className="offline-indicator-queue" title="Запросов в очереди синхронизации">
            Очередь: {pending}
          </span>
        ) : null}
        <button type="button" className="offline-indicator-retry" onClick={onRetrySync}>
          Повторить
        </button>
      </div>
    </>
  );
}
