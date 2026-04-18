import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
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
  const ref = doc(db, COLLECTION, DOC_ID);
  const prevSnap = await getDoc(ref);
  const oldVal = prevSnap.exists()
    ? normalize(prevSnap.data() as Record<string, unknown>)
    : { ...DEFAULT_DRIVE_LOCATION_SHARING_SETTINGS };
  await setDoc(
    ref,
    {
      instructorsEnabled: next.instructorsEnabled,
      studentsEnabled: next.studentsEnabled,
      gpsTrackerEnabled: next.gpsTrackerEnabled,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  void import("@/utils/audit").then(({ logAuditAction }) =>
    logAuditAction("UPDATE_SETTINGS", "settings", {
      entityId: DOC_ID,
      entityName: "Настройки геолокации и трека (appSettings/driveLocationSharing)",
      oldValue: {
        instructorsEnabled: oldVal.instructorsEnabled,
        studentsEnabled: oldVal.studentsEnabled,
        gpsTrackerEnabled: oldVal.gpsTrackerEnabled,
      },
      newValue: {
        instructorsEnabled: next.instructorsEnabled,
        studentsEnabled: next.studentsEnabled,
        gpsTrackerEnabled: next.gpsTrackerEnabled,
      },
      status: "success",
    })
  );
}
