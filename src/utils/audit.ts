/**
 * Клиентский аудит: отправка записей в Firestore и вспомогательные данные (IP, User-Agent).
 */
import type {
  ActionType,
  AuditLogWritePayload,
  AuditUserRole,
  EntityType,
} from "@/types/audit";
import { appendAuditLog } from "@/firebase/auditLogs";
import { getFirebase } from "@/firebase/config";
import { getUserProfile } from "@/firebase/users";
import type { UserRole } from "@/types";

let ipCache: string | null = null;

/** Публичный сервис IP (без ключа); при ошибке — «unknown». */
export async function getClientIp(): Promise<string> {
  if (ipCache) return ipCache;
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { ip?: string };
    const ip = typeof j.ip === "string" ? j.ip.trim() : "";
    ipCache = ip || "unknown";
  } catch {
    ipCache = "unknown";
  }
  return ipCache;
}

export function getUserAgent(): string {
  if (typeof navigator === "undefined" || !navigator.userAgent) return "";
  const ua = navigator.userAgent;
  return ua.length > 500 ? ua.slice(0, 497) + "..." : ua;
}

function mapRole(role: UserRole): AuditUserRole {
  if (role === "admin" || role === "instructor" || role === "student") return role;
  return "student";
}

async function buildActorPayload(): Promise<{
  userId: string;
  userName: string;
  userRole: AuditUserRole;
} | null> {
  const { auth } = getFirebase();
  const u = auth.currentUser;
  if (!u?.uid) return null;
  const uid = u.uid;
  let userName = (u.email ?? u.displayName ?? uid).trim();
  let userRole: AuditUserRole = "student";
  try {
    const profile = await getUserProfile(uid);
    if (profile) {
      userName = profile.displayName?.trim() || userName;
      userRole = mapRole(profile.role);
    }
  } catch {
    /* профиль мог быть недоступен — оставляем минимум */
  }
  return { userId: uid, userName, userRole };
}

/**
 * Основная функция записи аудита (как в ТЗ).
 * `LOGIN_FAILED` с клиента в Firestore не пишется — нет аутентификации (см. комментарий в AuthContext).
 */
export async function logAction(
  action: ActionType,
  entityType: EntityType,
  entityId: string | undefined,
  oldValue: Record<string, unknown> | undefined,
  newValue: Record<string, unknown> | undefined,
  status: "success" | "failed",
  errorMessage?: string,
  extras?: { entityName?: string }
): Promise<void> {
  if (action === "LOGIN_FAILED") {
    return;
  }
  const actor = await buildActorPayload();
  if (!actor) return;

  const ipAddress = await getClientIp();
  const userAgent = getUserAgent();

  const payload: AuditLogWritePayload = {
    ...actor,
    action,
    entityType,
    entityId,
    entityName: extras?.entityName,
    oldValue,
    newValue,
    ipAddress,
    userAgent,
    status,
    errorMessage,
  };

  try {
    await appendAuditLog(payload);
  } catch (e) {
    console.warn("[audit] appendAuditLog failed", e);
  }
}

/** Удобный вариант с объектом опций. */
export async function logAuditAction(
  action: ActionType,
  entityType: EntityType,
  options?: {
    entityId?: string;
    entityName?: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    status?: "success" | "failed";
    errorMessage?: string;
  }
): Promise<void> {
  const status = options?.status ?? "success";
  return logAction(
    action,
    entityType,
    options?.entityId,
    options?.oldValue,
    options?.newValue,
    status,
    options?.errorMessage,
    { entityName: options?.entityName }
  );
}
