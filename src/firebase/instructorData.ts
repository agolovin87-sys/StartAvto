import { doc, onSnapshot } from "firebase/firestore";
import type { UserProfile } from "@/types";
import { getFirebase } from "./config";
import { normalizeUserProfile } from "./users";

const USERS = "users";

/**
 * Подписка на профили по uid (закреплённые курсанты).
 * Отдельный onSnapshot на каждый документ — иначе запрос `documentId in [...]`
 * отклоняется целиком, если хотя бы один id не проходит правила (рассинхрон списка).
 */
export function subscribeUsersByIds(
  ids: string[],
  onUpdate: (users: UserProfile[]) => void
): () => void {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    onUpdate([]);
    return () => {};
  }

  const { db } = getFirebase();
  const byUid = new Map<string, UserProfile>();

  const mergeAndEmit = () => {
    const ordered = unique
      .map((id) => byUid.get(id))
      .filter((u): u is UserProfile => u != null);
    onUpdate(ordered);
  };

  const unsubs = unique.map((id) => {
    const ref = doc(db, USERS, id);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          byUid.delete(id);
        } else {
          byUid.set(
            id,
            normalizeUserProfile(snap.data() as Record<string, unknown>, id)
          );
        }
        mergeAndEmit();
      },
      (e) => {
        byUid.delete(id);
        mergeAndEmit();
        // Один недоступный uid (рассинхрон attachedStudentIds, удалённый профиль) не должен
        // ронять весь чат с «Missing or insufficient permissions».
        if (import.meta.env.DEV) {
          console.warn(`[subscribeUsersByIds] ${id}:`, e);
        }
      }
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}
