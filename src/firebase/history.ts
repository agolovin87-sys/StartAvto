import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import type { UserRole } from "@/types";
import { getFirebase } from "./config";

const TALON_HISTORY = "adminTalonHistory";

export type TalonHistoryLogPayload = {
  targetUid: string;
  targetRole: UserRole;
  targetDisplayName: string;
  previousTalons: number;
  newTalons: number;
  /** Контрагент операции («кем» в таблице истории): например курсант при зачислении инструктору за вождение. */
  fromUid?: string;
  fromRole?: UserRole;
  fromDisplayName?: string;
  talonKind?: "driving" | "exam";
};

/** Одна атомарная операция с обновлением users (вызывать из writeBatch вместе с batch.update). */
export function appendTalonHistoryToBatch(
  batch: WriteBatch,
  db: Firestore,
  input: TalonHistoryLogPayload
): void {
  const delta = input.newTalons - input.previousTalons;
  if (delta === 0) return;
  const histRef = doc(collection(db, TALON_HISTORY));
  const base: Record<string, unknown> = {
    at: serverTimestamp(),
    targetUid: input.targetUid,
    targetRole: input.targetRole,
    targetDisplayName: input.targetDisplayName,
    delta,
    previousTalons: input.previousTalons,
    newTalons: input.newTalons,
    talonKind: input.talonKind ?? "driving",
  };
  if (input.fromUid?.trim() && input.fromRole && input.fromDisplayName !== undefined) {
    base.fromUid = input.fromUid.trim();
    base.fromRole = input.fromRole;
    base.fromDisplayName = input.fromDisplayName;
  }
  batch.set(histRef, base);
}

function toMillis(v: unknown): number {
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v;
  return Date.now();
}

export type TalonHistoryEntry = {
  id: string;
  at: number;
  targetUid: string;
  targetRole: UserRole;
  targetDisplayName: string;
  delta: number;
  previousTalons: number;
  newTalons: number;
  fromUid?: string;
  fromRole?: UserRole;
  fromDisplayName?: string;
  talonKind?: "driving" | "exam";
};

function normalizeTalonDoc(
  data: Record<string, unknown>,
  id: string
): TalonHistoryEntry {
  const fromUid = typeof data.fromUid === "string" && data.fromUid.trim() ? data.fromUid.trim() : undefined;
  const fromRoleRaw = data.fromRole;
  const fromRole =
    fromUid && (fromRoleRaw === "admin" || fromRoleRaw === "instructor" || fromRoleRaw === "student")
      ? fromRoleRaw
      : undefined;
  /** Имя контрагента: пустая строка, если в документе нет строки (не терять fromUid/fromRole). */
  const fromDisplayName =
    fromUid && fromRole
      ? typeof data.fromDisplayName === "string"
        ? data.fromDisplayName
        : ""
      : undefined;
  const talonKindRaw = data.talonKind;
  const talonKind = talonKindRaw === "exam" ? "exam" : "driving";
  return {
    id,
    at: toMillis(data.at),
    targetUid: typeof data.targetUid === "string" ? data.targetUid : "",
    targetRole: (data.targetRole as UserRole) ?? "student",
    targetDisplayName:
      typeof data.targetDisplayName === "string" ? data.targetDisplayName : "",
    delta: typeof data.delta === "number" ? data.delta : 0,
    previousTalons: typeof data.previousTalons === "number" ? data.previousTalons : 0,
    newTalons: typeof data.newTalons === "number" ? data.newTalons : 0,
    talonKind,
    ...(fromUid && fromRole ? { fromUid, fromRole, fromDisplayName: fromDisplayName ?? "" } : {}),
  };
}

export async function logTalonChange(input: TalonHistoryLogPayload): Promise<void> {
  const delta = input.newTalons - input.previousTalons;
  if (delta === 0) return;
  const { db } = getFirebase();
  const batch = writeBatch(db);
  appendTalonHistoryToBatch(batch, db, input);
  await batch.commit();
}

const FIRESTORE_BATCH_MAX = 500;

/** Удаляет все документы в журнале талонов (только для администратора по правилам Firestore). */
export async function deleteAllTalonHistory(): Promise<void> {
  const { db } = getFirebase();
  const colRef = collection(db, TALON_HISTORY);
  const snapshot = await getDocs(colRef);
  if (snapshot.empty) return;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_MAX) {
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_MAX);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

export function subscribeTalonHistory(
  onUpdate: (entries: TalonHistoryEntry[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, TALON_HISTORY),
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeTalonDoc(d.data() as Record<string, unknown>, d.id)
      );
      list.sort((a, b) => b.at - a.at);
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/** Журнал талонов только для указанного пользователя (кабинет инструктора / курсанта). */
export function subscribeTalonHistoryForUser(
  targetUid: string,
  onUpdate: (entries: TalonHistoryEntry[]) => void,
  onError?: (e: Error) => void
): () => void {
  const uid = targetUid.trim();
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const { db } = getFirebase();
  const q = query(collection(db, TALON_HISTORY), where("targetUid", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeTalonDoc(d.data() as Record<string, unknown>, d.id)
      );
      list.sort((a, b) => b.at - a.at);
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/** Одноразовая выборка журнала (вкладка «История» без лишнего onSnapshot — меньше гонок SDK). */
export async function fetchTalonHistoryForUser(
  targetUid: string
): Promise<TalonHistoryEntry[]> {
  const uid = targetUid.trim();
  if (!uid) return [];
  const { db } = getFirebase();
  const q = query(collection(db, TALON_HISTORY), where("targetUid", "==", uid));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) =>
    normalizeTalonDoc(d.data() as Record<string, unknown>, d.id)
  );
  list.sort((a, b) => b.at - a.at);
  return list;
}
