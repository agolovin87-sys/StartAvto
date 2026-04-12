import { useEffect } from "react";
import { NOTIFICATION_SETTINGS_EVENT } from "@/admin/notificationSettings";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/firebase/config";
import {
  hasFcmVapidConfigured,
  registerWebPushAndSaveToken,
  subscribeForegroundFcm,
} from "@/firebase/fcm";

/**
 * После входа синхронизирует FCM-токен; в foreground показывает системные уведомления
 * для не-чат событий (чат — через существующую логику звука/уведомлений).
 */
export function FcmRegistrar() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !hasFcmVapidConfigured()) return;

    const tryRegister = () => {
      void registerWebPushAndSaveToken(uid);
    };

    tryRegister();

    const onSettings = () => tryRegister();
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, onSettings);

    const onVisible = () => {
      if (document.visibilityState === "visible") tryRegister();
    };
    window.addEventListener("focus", tryRegister);
    document.addEventListener("visibilitychange", onVisible);

    let removePermListener: (() => void) | undefined;
    try {
      void navigator.permissions
        ?.query({ name: "notifications" as PermissionName })
        .then((status) => {
          status.addEventListener("change", tryRegister);
          removePermListener = () => status.removeEventListener("change", tryRegister);
        })
        .catch(() => {});
    } catch {
      /* Safari и др. */
    }

    return () => {
      window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, onSettings);
      window.removeEventListener("focus", tryRegister);
      document.removeEventListener("visibilitychange", onVisible);
      removePermListener?.();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return () => {};
    return subscribeForegroundFcm((title, body) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (document.visibilityState !== "visible") return;
      try {
        new Notification(title, { body, icon: "/app-icon-v6.png", silent: false });
      } catch {
        /* */
      }
    });
  }, [uid]);

  return null;
}
