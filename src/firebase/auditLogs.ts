/**
 * Запись и чтение журнала аудита в Firestore (`auditLogs`).
 * Создание — только от имени текущего пользователя (userId = auth.uid).
 */
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import type { AuditLog, AuditLogWritePayload, AuditUserRole } from "@/types/audit";
import { getFirebase } from "./config";

const COLLECTION = "auditLogs";

function toMillis(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function normalizeAuditDoc(
  id: string,
  data: Record<string, unknown>
): AuditLog {
  const roleRaw = data.userRole;
  const userRole: AuditUserRole =
    roleRaw === "admin" || roleRaw === "instructor" || roleRaw === "student"
      ? roleRaw
      : "student";

  const action = typeof data.action === "string" ? data.action : "UPDATE_SETTINGS";
  const entityType =
    typeof data.entityType === "string" ? data.entityType : "system";

  const oldVal = data.oldValue;
  const newVal = data.newValue;

  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    userName: typeof data.userName === "string" ? data.userName : "",
    userRole,
    action: action as AuditLog["action"],
    entityType: entityType as AuditLog["entityType"],
    entityId: typeof data.entityId === "string" ? data.entityId : undefined,
    entityName: typeof data.entityName === "string" ? data.entityName : undefined,
    oldValue:
      oldVal && typeof oldVal === "object" && !Array.isArray(oldVal)
        ? (oldVal as Record<string, unknown>)
        : undefined,
    newValue:
      newVal && typeof newVal === "object" && !Array.isArray(newVal)
        ? (newVal as Record<string, unknown>)
        : undefined,
    ipAddress: typeof data.ipAddress === "string" ? data.ipAddress : "",
    userAgent: typeof data.userAgent === "string" ? data.userAgent : "",
    timestamp: toMillis(data.timestamp),
    status: data.status === "failed" ? "failed" : "success",
    errorMessage:
      typeof data.errorMessage === "string" ? data.errorMessage : undefined,
  };
}

/** Рекурсивно убирает undefined — Firestore их не принимает. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function appendAuditLog(
  payload: AuditLogWritePayload
): Promise<void> {
  const { db } = getFirebase();
  const ts = payload.timestamp ?? Date.now();
  const docData = stripUndefined({
    ...payload,
    timestamp: ts,
  }) as Record<string, unknown>;
  await addDoc(collection(db, COLLECTION), docData);
}

const MAX_FETCH = 5000;

/**
 * Однократная загрузка последних записей (для экспорта / fallback).
 */
export async function fetchRecentAuditLogs(): Promise<AuditLog[]> {
  const { db } = getFirebase();
  const q = query(
    collection(db, COLLECTION),
    orderBy("timestamp", "desc"),
    limit(MAX_FETCH)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    normalizeAuditDoc(d.id, d.data() as Record<string, unknown>)
  );
}

export function subscribeAuditLogs(
  onUpdate: (rows: AuditLog[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(
    collection(db, COLLECTION),
    orderBy("timestamp", "desc"),
    limit(MAX_FETCH)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        normalizeAuditDoc(d.id, d.data() as Record<string, unknown>)
      );
      onUpdate(rows);
    },
    (e) => onError?.(e)
  );
}
