import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const COLLECTION = "appSettings";
const DOC_ID = "chatLastSeenVisibility";

export type ChatLastSeenVisibilitySettings = {
  allowForInstructorAndStudent: boolean;
};

export const DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS: ChatLastSeenVisibilitySettings = {
  allowForInstructorAndStudent: false,
};

function normalize(
  data: Record<string, unknown> | undefined
): ChatLastSeenVisibilitySettings {
  if (!data) return { ...DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS };
  return {
    allowForInstructorAndStudent: data.allowForInstructorAndStudent === true,
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
  await setDoc(
    doc(db, COLLECTION, DOC_ID),
    {
      allowForInstructorAndStudent: next.allowForInstructorAndStudent,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

