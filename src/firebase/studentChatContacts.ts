import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import type { UserProfile } from "@/types";
import { getFirebase } from "./config";
import { normalizeUserProfile } from "./users";

const USERS = "users";

/**
 * Контакты курсанта: закреплённые инструкторы.
 * Контакт «Администратор» добавляется в AdminChatTab через subscribePrimaryAdministratorContact.
 */
export function subscribeStudentChatContacts(
  studentUid: string,
  onUpdate: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { app, db } = getFirebase();
  const uid = (getAuth(app).currentUser?.uid ?? "").trim();
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const passed = studentUid.trim();
  if (passed && passed !== uid && import.meta.env.DEV) {
    console.warn(
      "[subscribeStudentChatContacts] переданный uid не совпадает с auth.uid, используем auth"
    );
  }

  const qInstructors = query(
    collection(db, USERS),
    where("role", "==", "instructor"),
    where("attachedStudentIds", "array-contains", uid)
  );

  return onSnapshot(
    qInstructors,
    (snap) => {
      const list = snap.docs
        .map((d) =>
          normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
        )
        .filter(
          (u) =>
            u.role === "instructor" &&
            u.accountStatus === "active" &&
            u.uid !== studentUid
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/**
 * Для карточки «Мой инструктор» в кабинете курсанта:
 * показываем фактически прикреплённых инструкторов независимо от accountStatus.
 */
export function subscribeStudentAttachedInstructors(
  studentUid: string,
  onUpdate: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { app, db } = getFirebase();
  const uid = (getAuth(app).currentUser?.uid ?? "").trim();
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const passed = studentUid.trim();
  if (passed && passed !== uid && import.meta.env.DEV) {
    console.warn(
      "[subscribeStudentAttachedInstructors] переданный uid не совпадает с auth.uid, используем auth"
    );
  }

  const qInstructors = query(
    collection(db, USERS),
    where("role", "==", "instructor"),
    where("attachedStudentIds", "array-contains", uid)
  );

  return onSnapshot(
    qInstructors,
    (snap) => {
      const list = snap.docs
        .map((d) => normalizeUserProfile(d.data() as Record<string, unknown>, d.id))
        .filter((u) => u.role === "instructor" && u.uid !== uid)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}
