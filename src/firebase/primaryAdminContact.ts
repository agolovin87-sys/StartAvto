import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import type { UserProfile } from "@/types";
import { getFirebase } from "./config";
import {
  getAdminEmailVariantsForQuery,
  getAdminEmailsInOrder,
  normalizeUserProfile,
} from "./users";

const USERS = "users";
const EMAIL_IN_CHUNK = 25;

export function labelProfileAsAdministrator(p: UserProfile): UserProfile {
  return { ...p };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function pickPrimaryAdminRelaxed(admins: UserProfile[]): UserProfile | null {
  const byUid = new Map<string, UserProfile>();
  for (const u of admins) byUid.set(u.uid, u);
  const list = [...byUid.values()];

  const eligible = list.filter(
    (u) => u.accountStatus === "active" || u.accountStatus === "pending"
  );
  const pool = eligible.length > 0 ? eligible : list;
  if (pool.length === 0) return null;

  const order = getAdminEmailsInOrder();
  for (const email of order) {
    const m = pool.find((u) => u.email.trim().toLowerCase() === email);
    if (m) return m;
  }
  return [...pool].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ru")
  )[0];
}

/**
 * Основной админ для контакта «Администратор»:
 * - role == admin;
 * - или email из VITE_ADMIN_EMAILS (пока в БД не проставили role);
 * - опционально users/{VITE_PRIMARY_ADMIN_UID}.
 */
export function subscribePrimaryAdministratorContact(
  onUpdate: (profile: UserProfile | null) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  let byRole: UserProfile[] = [];
  const byEmailChunk = new Map<number, UserProfile[]>();
  let direct: UserProfile | null = null;
  const primaryUid = (import.meta.env.VITE_PRIMARY_ADMIN_UID ?? "").trim();

  const emit = () => {
    const m = new Map<string, UserProfile>();
    for (const u of byRole) m.set(u.uid, u);
    for (const arr of byEmailChunk.values()) {
      for (const u of arr) m.set(u.uid, u);
    }
    if (direct) m.set(direct.uid, direct);
    const primary = pickPrimaryAdminRelaxed([...m.values()]);
    onUpdate(primary ? labelProfileAsAdministrator(primary) : null);
  };

  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(
      query(collection(db, USERS), where("role", "==", "admin")),
      (snap) => {
        byRole = snap.docs.map((d) =>
          normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
        );
        emit();
      },
      (e) => onError?.(e)
    )
  );

  const variants = getAdminEmailVariantsForQuery();
  chunk(variants, EMAIL_IN_CHUNK).forEach((part, chunkIndex) => {
    if (part.length === 0) return;
    unsubs.push(
      onSnapshot(
        query(collection(db, USERS), where("email", "in", part)),
        (snap) => {
          byEmailChunk.set(
            chunkIndex,
            snap.docs.map((d) =>
              normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
            )
          );
          emit();
        },
        (e) => onError?.(e)
      )
    );
  });

  if (primaryUid) {
    unsubs.push(
      onSnapshot(
        doc(db, USERS, primaryUid),
        (snap) => {
          direct = snap.exists()
            ? normalizeUserProfile(
                snap.data() as Record<string, unknown>,
                primaryUid
              )
            : null;
          emit();
        },
        (e) => onError?.(e)
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}
