import {
  doc,
  enableNetwork,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { AccountStatus, UserRole, UserProfile } from "@/types";
import { normalizeCabinetClientKind } from "@/lib/clientPlatform";
import { getFirebase } from "./config";

const USERS = "users";

function parseAdminEmails(): Set<string> {
  const raw = import.meta.env.VITE_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Порядок email из .env — для выбора «основного» админа в чате. */
export function getAdminEmailsInOrder(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Строки для where('email','in', …): как в .env и в lower case (в Firestore email часто в исходном регистре). */
export function getAdminEmailVariantsForQuery(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS ?? "";
  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    set.add(t);
    set.add(t.toLowerCase());
  }
  return [...set];
}

export function resolveRoleFromEmail(
  email: string,
  requestedRole: UserRole
): UserRole {
  const admins = parseAdminEmails();
  if (admins.has(email.trim().toLowerCase())) return "admin";
  return requestedRole;
}

function toMillis(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v;
  return Date.now();
}

/** Для полей присутствия: только валидные мс или null (без подстановки Date.now). */
function toMillisOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (
    v &&
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    const ms = (v as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (v && typeof v === "object" && "seconds" in v) {
    const o = v as { seconds: unknown; nanoseconds?: unknown };
    const sec = o.seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      const nano =
        typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds)
          ? o.nanoseconds
          : 0;
      return sec * 1000 + Math.floor(nano / 1e6);
    }
  }
  return null;
}

/** Число талонов из Firestore (или из формы) для сравнения и журнала. */
export function normalizeTalonsValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

export function normalizeUserProfile(
  data: Record<string, unknown>,
  uid: string
): UserProfile {
  const role = (data.role as UserRole) ?? "student";
  const accountStatusRaw = data.accountStatus as AccountStatus | undefined;
  const accountStatus: AccountStatus = accountStatusRaw ?? "active";

  const rejectedAtRaw = data.rejectedAt;
  const rejectedAt =
    rejectedAtRaw === undefined || rejectedAtRaw === null
      ? null
      : typeof rejectedAtRaw === "number"
        ? rejectedAtRaw
        : toMillis(rejectedAtRaw);

  const avatarRaw = data.avatarDataUrl;
  const avatarDataUrl =
    typeof avatarRaw === "string" && avatarRaw.length > 0 ? avatarRaw : null;

  const lastCabinetClientKindRaw = normalizeCabinetClientKind(
    data.lastCabinetClientKind
  );

  return {
    /** Всегда id документа users/{uid} — совпадает с Firebase Auth; поле data.uid могло расходиться и ломать array-contains в чатах. */
    uid,
    email: (data.email as string) ?? "",
    displayName: (data.displayName as string) ?? "",
    role,
    createdAt: toMillis(data.createdAt),
    accountStatus,
    rejectedAt,
    phone: typeof data.phone === "string" ? data.phone : "",
    vehicleLabel: typeof data.vehicleLabel === "string" ? data.vehicleLabel : "",
    talons: normalizeTalonsValue(data.talons),
    drivesCount: typeof data.drivesCount === "number" ? data.drivesCount : 0,
    attachedStudentIds: Array.isArray(data.attachedStudentIds)
      ? (data.attachedStudentIds as string[])
      : [],
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    avatarDataUrl,
    ...(lastCabinetClientKindRaw !== undefined
      ? { lastCabinetClientKind: lastCabinetClientKindRaw }
      : {}),
    presence:
      data.presence &&
      typeof data.presence === "object" &&
      data.presence !== null
        ? {
            state: ((data.presence as Record<string, unknown>).state as
              | "online"
              | "offline"
              | undefined) ?? "offline",
            lastSeenAt: toMillisOrNull(
              (data.presence as Record<string, unknown>).lastSeenAt
            ),
            heartbeatAt: toMillisOrNull(
              (data.presence as Record<string, unknown>).heartbeatAt
            ),
          }
        : undefined,
  };
}

/** Кратковременные сбои сети / «клиент офлайн» сразу после входа — даём повторы, иначе форма показывает сырое сообщение SDK. */
function isFirestoreTransientNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = "code" in e ? String((e as { code?: string }).code) : "";
  if (code === "unavailable" || code.endsWith("/unavailable")) return true;
  const msg = e instanceof Error ? e.message : "";
  if (/client is offline/i.test(msg)) return true;
  if (/Failed to get document/i.test(msg) && /offline/i.test(msg)) return true;
  return false;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const { db } = getFirebase();
  const ref = doc(db, USERS, uid);
  const maxAttempts = 5;
  const delaysMs = [0, 400, 800, 1600, 2800];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (delaysMs[attempt]! > 0) {
      await new Promise((r) => setTimeout(r, delaysMs[attempt]));
    }
    try {
      /**
       * Не вызывать enableNetwork перед каждым getDoc: при параллельных
       * getUserProfile (напр. колонка «Курсант» в истории) несколько вызовов
       * enableNetwork гоняются с onSnapshot и дают INTERNAL ASSERTION ca9 на Watch.
       * Сеть уже включена для слушателей; enableNetwork — только после сбоя «offline».
       */
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return normalizeUserProfile(snap.data() as Record<string, unknown>, uid);
    } catch (e) {
      if (attempt < maxAttempts - 1 && isFirestoreTransientNetworkError(e)) {
        await enableNetwork(db).catch(() => {});
        continue;
      }
      throw e;
    }
  }
  throw new Error("Не удалось прочитать профиль из Firestore.");
}

/** Несколько попыток чтения после регистрации, пока документ с телефоном появится в Firestore. */
async function getUserProfileWithRetry(uid: string): Promise<UserProfile | null> {
  const delaysMs = [0, 120, 280, 500];
  for (const d of delaysMs) {
    if (d > 0) await new Promise((r) => setTimeout(r, d));
    const p = await getUserProfile(uid);
    if (p) return p;
  }
  return null;
}

const defaultProfileFields = (
  uid: string,
  email: string,
  displayName: string,
  role: UserRole,
  accountStatus: AccountStatus,
  phone: string
): Omit<UserProfile, "createdAt"> => ({
  uid,
  email,
  displayName,
  role,
  accountStatus,
  phone,
  vehicleLabel: "",
  talons: 0,
  drivesCount: 0,
  attachedStudentIds: [],
  groupId: "",
});

export async function createUserProfile(
  uid: string,
  email: string,
  displayName: string,
  role: UserRole,
  phone: string
): Promise<UserProfile> {
  const finalRole = resolveRoleFromEmail(email, role);
  const accountStatus: AccountStatus =
    finalRole === "admin" ? "active" : "pending";
  const base = defaultProfileFields(
    uid,
    email,
    displayName,
    finalRole,
    accountStatus,
    phone
  );
  const profile: UserProfile = {
    ...base,
    createdAt: Date.now(),
  };
  const { db } = getFirebase();
  await setDoc(doc(db, USERS, uid), {
    ...base,
    phone: base.phone,
    groupId: "",
    createdAt: serverTimestamp(),
  });
  return profile;
}

export async function ensureProfileAfterLogin(
  uid: string,
  email: string,
  displayName: string
): Promise<UserProfile> {
  const existing = await getUserProfileWithRetry(uid);
  if (existing) {
    const emailResolved = resolveRoleFromEmail(email, existing.role);
    if (emailResolved !== existing.role) {
      const { db } = getFirebase();
      await updateDoc(doc(db, USERS, uid), { role: emailResolved });
      return (await getUserProfile(uid))!;
    }
    return existing;
  }
  const role = resolveRoleFromEmail(email, "student");
  return createUserProfile(
    uid,
    email,
    displayName || email.split("@")[0],
    role,
    ""
  );
}
