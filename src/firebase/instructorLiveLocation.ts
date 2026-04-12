import { doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

export const INSTRUCTOR_LIVE_LOCATIONS = "instructorLiveLocations";

/** Админ обновляет `requestedAt` — клиент инструктора делает свежий GPS и пишет в instructorLiveLocations. */
export const INSTRUCTOR_LIVE_LOCATION_REFRESH_REQUESTS = "instructorLiveLocationRefreshRequests";

export type InstructorLiveLocation = {
  lat: number;
  lng: number;
  updatedAtMs: number | null;
  /** Радиус погрешности в метрах (от браузера / GPS), если известен. */
  accuracyM: number | null;
};

function toMillis(v: unknown): number | null {
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function normalizeInstructorLiveLocation(
  data: Record<string, unknown> | undefined
): InstructorLiveLocation | null {
  if (!data) return null;
  const lat = data.lat;
  const lng = data.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accRaw = data.accuracy;
  const accuracyM =
    typeof accRaw === "number" && Number.isFinite(accRaw) && accRaw > 0 ? accRaw : null;
  return {
    lat,
    lng,
    updatedAtMs: toMillis(data.updatedAt),
    accuracyM,
  };
}

function clampAccuracyMeters(m: number): number {
  if (!Number.isFinite(m) || m < 0.5) return 9999;
  return Math.min(100_000, m);
}

/** Сигнал инструкторскому приложению: запросить геолокацию и отправить координаты (вызывает админ). */
export async function requestInstructorLiveLocationRefresh(instructorUid: string): Promise<void> {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, INSTRUCTOR_LIVE_LOCATION_REFRESH_REQUESTS, uid),
    { requestedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Инструктор подписывается на свой документ; при новом `requestedAt` после «прогрева» вызывается callback.
 * Первый снимок поглощается без вызова (чтобы не дублировать старт и не реагировать на старый запрос).
 */
export function subscribeInstructorLiveLocationRefreshRequests(
  instructorUid: string,
  onFreshRequest: () => void,
  onError?: (e: Error) => void
): () => void {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) return () => {};

  const { db } = getFirebase();
  let primed = false;
  let lastHandledMs = 0;

  return onSnapshot(
    doc(db, INSTRUCTOR_LIVE_LOCATION_REFRESH_REQUESTS, uid),
    (snap) => {
      if (!snap.exists()) {
        if (!primed) {
          primed = true;
          lastHandledMs = 0;
        }
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const ms = toMillis(data.requestedAt);
      if (ms == null) {
        if (!primed) {
          primed = true;
          lastHandledMs = 0;
        }
        return;
      }
      if (!primed) {
        primed = true;
        lastHandledMs = ms;
        return;
      }
      if (ms > lastHandledMs) {
        lastHandledMs = ms;
        onFreshRequest();
      }
    },
    (e) => onError?.(e)
  );
}

export async function writeInstructorLiveLocation(
  instructorUid: string,
  lat: number,
  lng: number,
  accuracyMeters: number
): Promise<void> {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, INSTRUCTOR_LIVE_LOCATIONS, uid),
    {
      lat,
      lng,
      accuracy: clampAccuracyMeters(accuracyMeters),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Принудительно с сервера (без кэша клиента) — для кнопки «Обновить» у админа. */
export async function fetchInstructorLiveLocationFromServer(
  instructorUid: string
): Promise<InstructorLiveLocation | null> {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) return null;
  const { db } = getFirebase();
  const snap = await getDocFromServer(doc(db, INSTRUCTOR_LIVE_LOCATIONS, uid));
  if (!snap.exists()) return null;
  return normalizeInstructorLiveLocation(snap.data() as Record<string, unknown>);
}

export function subscribeInstructorLiveLocation(
  instructorUid: string,
  onUpdate: (loc: InstructorLiveLocation | null) => void,
  onError?: (e: Error) => void
): () => void {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) {
    onUpdate(null);
    return () => {};
  }
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, INSTRUCTOR_LIVE_LOCATIONS, uid),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(normalizeInstructorLiveLocation(snap.data() as Record<string, unknown>));
    },
    (e) => onError?.(e)
  );
}
