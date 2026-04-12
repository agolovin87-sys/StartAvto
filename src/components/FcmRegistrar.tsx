import { useEffect } from "react";
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
    void registerWebPushAndSaveToken(uid);
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
