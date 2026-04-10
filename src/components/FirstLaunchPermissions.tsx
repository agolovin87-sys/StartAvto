import { useCallback, useState } from "react";
import { getAudioStreamSafe } from "@/chat/voiceRecorder";

const STORAGE_KEY = "startavto_permissions_onboarding_v1";

function hasCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function requestNotifications(): Promise<NotificationPermission | void> {
  if (typeof Notification === "undefined") return Promise.resolve();
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  try {
    return Promise.resolve(Notification.requestPermission());
  } catch {
    return Promise.resolve();
  }
}

/**
 * Один раз после входа: запрос микрофона (голосовые) и уведомлений (входящие).
 * getUserMedia — в цепочке .then() от клика (Safari/iOS).
 */
export function FirstLaunchPermissions() {
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && !hasCompleted(),
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const onAllow = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setHint(null);

    if (typeof window === "undefined" || !window.isSecureContext) {
      setHint("Для доступа к микрофону откройте сайт по HTTPS.");
      setBusy(false);
      void requestNotifications().finally(() => {
        markCompleted();
        window.setTimeout(() => {
          setOpen(false);
          setHint(null);
        }, 2600);
      });
      return;
    }

    getAudioStreamSafe()
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        if (navigator.storage?.persist) {
          void navigator.storage.persist();
        }
        return requestNotifications();
      })
      .then(() => {
        markCompleted();
        setOpen(false);
        setBusy(false);
      })
      .catch(() => {
        void requestNotifications().finally(() => {
          markCompleted();
          setOpen(false);
          setBusy(false);
        });
      });
  }, [busy]);

  const onSkip = useCallback(() => {
    markCompleted();
    setOpen(false);
    setHint(null);
    setBusy(false);
  }, []);

  if (!open) return null;

  return (
    <div className="first-launch-permissions" role="dialog" aria-modal="true" aria-labelledby="first-launch-title">
      <div className="first-launch-permissions__backdrop" aria-hidden />
      <div className="first-launch-permissions__card">
        <h2 id="first-launch-title" className="first-launch-permissions__title">
          Доступ к устройству
        </h2>
        <p className="first-launch-permissions__text">
          Чтобы отправлять голосовые сообщения и получать уведомления о новых сообщениях, разрешите доступ к микрофону и
          уведомлениям. Это можно сделать и позже.
        </p>
        {hint ? (
          <p className="first-launch-permissions__hint" role="status">
            {hint}
          </p>
        ) : null}
        <div className="first-launch-permissions__actions">
          <button
            type="button"
            className="first-launch-permissions__btn first-launch-permissions__btn--primary"
            disabled={busy}
            onClick={onAllow}
          >
            {busy ? "Запрос…" : "Разрешить"}
          </button>
          <button
            type="button"
            className="first-launch-permissions__btn first-launch-permissions__btn--ghost"
            disabled={busy}
            onClick={onSkip}
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
