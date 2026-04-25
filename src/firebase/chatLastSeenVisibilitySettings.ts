import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const COLLECTION = "appSettings";
const DOC_ID = "chatLastSeenVisibility";

export type ChatLastSeenVisibilitySettings = {
  showInstructorLastSeen: boolean;
  showStudentLastSeen: boolean;
};

export const DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS: ChatLastSeenVisibilitySettings = {
  showInstructorLastSeen: false,
  showStudentLastSeen: false,
};

function normalize(
  data: Record<string, unknown> | undefined
): ChatLastSeenVisibilitySettings {
  if (!data) return { ...DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS };
  return {
    showInstructorLastSeen: data.showInstructorLastSeen === true,
    showStudentLastSeen: data.showStudentLastSeen === true,
  };
}

export function subscribeChatLastSeenVisibilitySettings(
  onUpdate: (value: ChatLastSeenVisibilitySettings) => void,
  onError?: (e: Error) => void
): () => void {
  if (!isFirebaseConfigured) {
    onUpdate({ ...DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS });
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

export async function setChatLastSeenVisibilitySettings(
  next: ChatLastSeenVisibilitySettings
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { db } = getFirebase();
  const ref = doc(db, COLLECTION, DOC_ID);
  const prevSnap = await getDoc(ref);
  const oldVal = prevSnap.exists()
    ? normalize(prevSnap.data() as Record<string, unknown>)
    : { ...DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS };
  await setDoc(
    ref,
    {
      showInstructorLastSeen: next.showInstructorLastSeen,
      showStudentLastSeen: next.showStudentLastSeen,
      updatedAt: serverTimestamp(),
    },
    { merge: false }
  );
  void import("@/utils/audit").then(({ logAuditAction }) =>
    logAuditAction("UPDATE_SETTINGS", "settings", {
      entityId: DOC_ID,
      entityName: "Видимость «был в сети» в чате (appSettings/chatLastSeenVisibility)",
      oldValue: {
        showInstructorLastSeen: oldVal.showInstructorLastSeen,
        showStudentLastSeen: oldVal.showStudentLastSeen,
      },
      newValue: {
        showInstructorLastSeen: next.showInstructorLastSeen,
        showStudentLastSeen: next.showStudentLastSeen,
      },
      status: "success",
    })
  );
}
