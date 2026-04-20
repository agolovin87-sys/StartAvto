import { deleteDoc, doc, getDocs, collection, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getNotificationSettings } from "@/admin/notificationSettings";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

function tokenDocId(token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  return `t${Math.abs(h).toString(36)}_${token.slice(-16)}`;
}

export function hasFcmVapidConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim());
}

export async function isFcmMessagingSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function saveFcmTokenForUser(uid: string, token: string): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "users", uid, "fcmTokens", tokenDocId(token));
  await setDoc(
    ref,
    {
      token,
      createdAt: serverTimestamp(),
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : "",
    },
    { merge: true }
  );
}

export async function removeAllFcmTokensForUser(uid: string): Promise<void> {
  const u = uid.trim();
  if (!u) return;
  const { db } = getFirebase();
  const col = collection(db, "users", u, "fcmTokens");
  const snap = await getDocs(col);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/**
 * Регистрация FCM и сохранение токена в Firestore (нужны разрешение уведомлений и VITE_FIREBASE_VAPID_KEY).
 */
export async function registerWebPushAndSaveToken(uid: string): Promise<boolean> {
  const u = uid.trim();
  if (!u || !isFirebaseConfigured) return false;
  if (!hasFcmVapidConfigured()) return false;
  const settings = getNotificationSettings(u);
  if (settings.webPushEnabled === false) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

  const supported = await isFcmMessagingSupported();
  if (!supported) return false;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY!.trim();
  const { app } = getFirebase();
  let messaging;
  try {
    messaging = getMessaging(app);
  } catch {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return false;
    await saveFcmTokenForUser(u, token);
    return true;
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[FCM] getToken / save failed", e);
    return false;
  }
}

/** Пуш в foreground: чат с превью показывается локально (incomingMessageAlerts), здесь — прочие события. */
export function subscribeForegroundFcm(
  onNonChatNotification: (title: string, body: string) => void
): () => void {
  if (!isFirebaseConfigured || typeof window === "undefined") return () => {};
  let messaging;
  try {
    messaging = getMessaging(getFirebase().app);
  } catch {
    return () => {};
  }
  return onMessage(messaging, (payload) => {
    if (payload.data?.kind === "chat") return;
    const d = payload.data ?? {};
    const title =
      (typeof d.title === "string" && d.title) || payload.notification?.title || "\u2060";
    const body = (typeof d.body === "string" && d.body) || payload.notification?.body || "";
    onNonChatNotification(title, body);
  });
}
