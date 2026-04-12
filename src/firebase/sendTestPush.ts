import { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { getFirebase } from "@/firebase/config";

const FUNCTIONS_REGION = "europe-west1";

export type SendTestPushResult =
  | { ok: true; devices: number }
  | { ok: false; message: string };

function parseData(data: unknown): SendTestPushResult {
  if (!data || typeof data !== "object") {
    return { ok: false, message: "Пустой ответ сервера" };
  }
  const o = data as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, message: "Сервер отклонил запрос" };
  }
  const devices = o.devices;
  if (typeof devices === "number" && Number.isFinite(devices) && devices >= 0) {
    return { ok: true, devices };
  }
  return { ok: true, devices: 1 };
}

/**
 * Отправка тестового data-push на FCM-токены текущего пользователя (Cloud Function).
 */
export async function callSendTestPush(): Promise<SendTestPushResult> {
  const { app } = getFirebase();
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const fn = httpsCallable(functions, "sendTestPush");
  try {
    const snap: HttpsCallableResult = await fn({});
    return parseData(snap.data);
  } catch (e) {
    if (e instanceof FirebaseError) {
      return { ok: false, message: e.message || e.code };
    }
    if (e instanceof Error) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: "Не удалось отправить тест" };
  }
}
