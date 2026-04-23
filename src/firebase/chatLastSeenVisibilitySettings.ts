import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const COLLECTION = "appSettings";
const DOC_ID = "chatLastSeenVisibility";

export type ChatLastSeenVisibilitySettings = {
  /** Админ разрешает инструкторам видеть «был в сети» у курсантов/инструкторов в чате. */
  allowForInstructor: boolean;
  /** Админ разрешает курсантам видеть «был в сети» у курсантов/инструкторов в чате. */
  allowForStudent: boolean;
};

export const DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS: ChatLastSeenVisibilitySettings = {
  allowForInstructor: false,
  allowForStudent: false,
};

function normalize(
  data: Record<string, unknown> | undefined
): ChatLastSeenVisibilitySettings {
  if (!data) return { ...DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS };
  const hasNew =
    typeof data.allowForInstructor === "boolean" ||
    typeof data.allowForStudent === "boolean";
  if (hasNew) {
    return {
      allowForInstructor: data.allowForInstructor === true,
      allowForStudent: data.allowForStudent === true,
    };
  }
  const legacy = data.allowForInstructorAndStudent === true;
  return {
    allowForInstructor: legacy,
    allowForStudent: legacy,
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
      allowForInstructor: next.allowForInstructor,
      allowForStudent: next.allowForStudent,
      updatedAt: serverTimestamp(),
      allowForInstructorAndStudent: deleteField(),
    },
    { merge: true }
  );
}

