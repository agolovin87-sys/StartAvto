import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const COLLECTION = "appSettings";
const DOC_ID = "driveLocationSharing";

export type DriveLocationSharingSettings = {
  instructorsEnabled: boolean;
  studentsEnabled: boolean;
  gpsTrackerEnabled: boolean;
};

export const DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS: DriveLocationSharingSettings = {
  instructorsEnabled: true,
  studentsEnabled: true,
  gpsTrackerEnabled: true,
};

function normalize(data: Record<string, unknown> | undefined): DriveLocationSharingSettings {
  if (!data) return { ...DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS };
  return {
    instructorsEnabled: data.instructorsEnabled !== false,
    studentsEnabled: data.studentsEnabled !== false,
    gpsTrackerEnabled: data.gpsTrackerEnabled !== false,
  };
}

export function subscribeDriveLocationSharingSettings(
  onUpdate: (value: DriveLocationSharingSettings) => void,
  onError?: (e: Error) => void
): () => void {
  if (!isFirebaseConfigured) {
    onUpdate({ ...DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS });
    return () => {};
  }
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, COLLECTION, DOC_ID),
    (snap) => {
      onUpdate(normalize(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined));
    },
    (e) => onError?.(e as Error)
  );
}

export async function setDriveLocationSharingSettings(
  next: DriveLocationSharingSettings
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { db } = getFirebase();
  await setDoc(
    doc(db, COLLECTION, DOC_ID),
    {
      instructorsEnabled: next.instructorsEnabled,
      studentsEnabled: next.studentsEnabled,
      gpsTrackerEnabled: next.gpsTrackerEnabled,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
