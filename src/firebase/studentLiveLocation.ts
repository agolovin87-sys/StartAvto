import { doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";
import type { InstructorLiveLocation } from "@/firebase/instructorLiveLocation";
import { normalizeInstructorLiveLocation } from "@/firebase/instructorLiveLocation";

export const STUDENT_LIVE_LOCATIONS = "studentLiveLocations";
export const STUDENT_LIVE_LOCATION_REFRESH_REQUESTS = "studentLiveLocationRefreshRequests";

export type StudentLiveLocation = InstructorLiveLocation;

export async function requestStudentLiveLocationRefresh(studentUid: string): Promise<void> {
  const uid = studentUid.trim();
  if (!uid || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, STUDENT_LIVE_LOCATION_REFRESH_REQUESTS, uid),
    { requestedAt: serverTimestamp() },
    { merge: true }
  );
}

export function subscribeStudentLiveLocationRefreshRequests(
  studentUid: string,
  onFreshRequest: () => void,
  onError?: (e: Error) => void
): () => void {
  const uid = studentUid.trim();
  if (!uid || !isFirebaseConfigured) return () => {};

  const { db } = getFirebase();
  let primed = false;
  let lastHandledMs = 0;

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

  return onSnapshot(
    doc(db, STUDENT_LIVE_LOCATION_REFRESH_REQUESTS, uid),
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

function clampAccuracyMeters(m: number): number {
  if (!Number.isFinite(m) || m < 0.5) return 9999;
  return Math.min(100_000, m);
}

export async function writeStudentLiveLocation(
  studentUid: string,
  lat: number,
  lng: number,
  accuracyMeters: number
): Promise<void> {
  const uid = studentUid.trim();
  if (!uid || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, STUDENT_LIVE_LOCATIONS, uid),
    {
      lat,
      lng,
      accuracy: clampAccuracyMeters(accuracyMeters),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchStudentLiveLocationFromServer(
  studentUid: string
): Promise<StudentLiveLocation | null> {
  const uid = studentUid.trim();
  if (!uid || !isFirebaseConfigured) return null;
  const { db } = getFirebase();
  const snap = await getDocFromServer(doc(db, STUDENT_LIVE_LOCATIONS, uid));
  if (!snap.exists()) return null;
  return normalizeInstructorLiveLocation(snap.data() as Record<string, unknown>);
}

export function subscribeStudentLiveLocation(
  studentUid: string,
  onUpdate: (loc: StudentLiveLocation | null) => void,
  onError?: (e: Error) => void
): () => void {
  const uid = studentUid.trim();
  if (!uid || !isFirebaseConfigured) {
    onUpdate(null);
    return () => {};
  }
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, STUDENT_LIVE_LOCATIONS, uid),
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
