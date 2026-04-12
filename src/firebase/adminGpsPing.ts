import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

export const INSTRUCTOR_GPS_SESSION_PINGS = "instructorGpsSessionPings";

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

/** Инструктор зашёл в кабинет — пинг для push админам и бейджей. */
export async function recordInstructorGpsSessionPing(instructorUid: string): Promise<void> {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, INSTRUCTOR_GPS_SESSION_PINGS, uid),
    { pingedAt: serverTimestamp() },
    { merge: true }
  );
}

export function subscribeInstructorGpsSessionPingMs(
  instructorUid: string,
  onMs: (pingedAtMs: number | null) => void,
  onError?: (e: Error) => void
): () => void {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) {
    onMs(null);
    return () => {};
  }
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, INSTRUCTOR_GPS_SESSION_PINGS, uid),
    (snap) => {
      if (!snap.exists()) {
        onMs(null);
        return;
      }
      onMs(toMillis((snap.data() as { pingedAt?: unknown }).pingedAt));
    },
    (e) => onError?.(e)
  );
}

export function subscribeAdminGpsPingSeenMap(
  adminUid: string,
  onMap: (seenByInstructorUid: Record<string, number>) => void,
  onError?: (e: Error) => void
): () => void {
  const uid = adminUid.trim();
  if (!uid || !isFirebaseConfigured) {
    onMap({});
    return () => {};
  }
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, "users", uid, "gpsPingSeen"),
    (snap) => {
      const m: Record<string, number> = {};
      snap.forEach((d) => {
        const v = (d.data() as { lastSeenPingAtMs?: unknown }).lastSeenPingAtMs;
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) m[d.id] = v;
      });
      onMap(m);
    },
    (e) => onError?.(e)
  );
}

export async function ackAdminGpsPingSeen(
  adminUid: string,
  instructorUid: string,
  lastSeenPingAtMs: number
): Promise<void> {
  const a = adminUid.trim();
  const ins = instructorUid.trim();
  if (!a || !ins || !isFirebaseConfigured) return;
  if (!Number.isFinite(lastSeenPingAtMs) || lastSeenPingAtMs < 0) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, "users", a, "gpsPingSeen", ins),
    { lastSeenPingAtMs },
    { merge: true }
  );
}
