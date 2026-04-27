import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { getFirebase } from "@/firebase/config";
import { normalizeUserProfile } from "@/firebase/users";
import type { UserProfile } from "@/types";

const CabinetSubjectCtx = createContext<string | null>(null);

export function CabinetSubjectProvider({ uid, children }: { uid: string; children: ReactNode }) {
  return (
    <CabinetSubjectCtx.Provider value={uid.trim()}>{children}</CabinetSubjectCtx.Provider>
  );
}

/** Если админ открывает чужой кабинет — uid просматриваемого пользователя, иначе null. */
export function useCabinetSubjectOverrideUid(): string | null {
  return useContext(CabinetSubjectCtx);
}

/** uid для данных кабинета: подмена при предпросмотре админом или текущий пользователь. */
export function useCabinetEffectiveUid(): string {
  const override = useCabinetSubjectOverrideUid();
  const { user, profile } = useAuth();
  const authUid = (user?.uid ?? profile?.uid ?? "").trim();
  return (override?.trim() || authUid).trim();
}

/**
 * Профиль для отображения блоков кабинета: при предпросмотре — из Firestore по override uid.
 */
export function useCabinetSubjectProfile(): UserProfile | null {
  const auth = useAuth();
  const override = useCabinetSubjectOverrideUid();
  const [remote, setRemote] = useState<UserProfile | null>(null);

  useEffect(() => {
    const uid = override?.trim();
    if (!uid) {
      setRemote(null);
      return;
    }
    const { db } = getFirebase();
    const ref = doc(db, "users", uid);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRemote(null);
          return;
        }
        setRemote(normalizeUserProfile(snap.data() as Record<string, unknown>, uid));
      },
      () => setRemote(null)
    );
  }, [override]);

  if (!override?.trim()) {
    return auth.profile ?? null;
  }
  return remote;
}
