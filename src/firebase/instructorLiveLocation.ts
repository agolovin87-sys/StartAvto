import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

export const INSTRUCTOR_LIVE_LOCATIONS = "instructorLiveLocations";

export type InstructorLiveLocation = {
  lat: number;
  lng: number;
  updatedAtMs: number | null;
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
  return {
    lat,
    lng,
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export async function writeInstructorLiveLocation(
  instructorUid: string,
  lat: number,
  lng: number
): Promise<void> {
  const uid = instructorUid.trim();
  if (!uid || !isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, INSTRUCTOR_LIVE_LOCATIONS, uid),
    {
      lat,
      lng,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
