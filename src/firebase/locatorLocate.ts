import { getFunctions, httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { getFirebase } from "@/firebase/config";

const FUNCTIONS_REGION = "europe-west1";

export type LocatorLocateResult =
  | { ok: true; lat: number; lng: number; accuracyM: number }
  | { ok: false };

function parseData(data: unknown): LocatorLocateResult {
  if (!data || typeof data !== "object") return { ok: false };
  const o = data as Record<string, unknown>;
  if (o.ok !== true) return { ok: false };
  const lat = o.lat;
  const lng = o.lng;
  const accuracyM = o.accuracyM;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    typeof accuracyM !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(accuracyM)
  ) {
    return { ok: false };
  }
  return { ok: true, lat, lng, accuracyM };
}

/**
 * Яндекс Локатор через Cloud Function (ключ и запрос к API только на сервере).
 * Уточнение по IP; без Wi‑Fi/cell в теле — в вебе их не прочитать.
 */
export async function callLocatorLocate(): Promise<LocatorLocateResult> {
  const { app } = getFirebase();
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const fn = httpsCallable(functions, "locatorLocate");
  let snap: HttpsCallableResult;
  try {
    snap = await fn({});
  } catch {
    return { ok: false };
  }
  return parseData(snap.data);
}
