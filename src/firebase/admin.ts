import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { AccountStatus, TrainingGroup, UserProfile, UserRole } from "@/types";
import { getFirebase } from "./config";
import { appendTalonHistoryToBatch, type TalonHistoryLogPayload } from "./history";
import {
  syncInstructorLinkedChatsForInstructor,
  syncLinkedChatsForInstructorsOfStudent,
  syncStudentToLinkedChatGroup,
} from "./chat";
import { normalizeTalonsValue, normalizeUserProfile } from "./users";

const USERS = "users";
const GROUPS = "groups";

function attachedIdsFromSnapData(data: Record<string, unknown>): string[] {
  const raw = data.attachedStudentIds;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter((id): id is string => typeof id === "string");
}

async function getUserDocPreferServer(ref: ReturnType<typeof doc>) {
  try {
    return await getDocFromServer(ref);
  } catch {
    return getDoc(ref);
  }
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

function normalizeGroupDoc(
  data: Record<string, unknown>,
  id: string
): TrainingGroup {
  const linkRaw = data.linkedChatGroupId;
  const linkedChatGroupId =
    typeof linkRaw === "string" && linkRaw.trim().startsWith("group_")
      ? linkRaw.trim()
      : undefined;
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    hasTrainingPeriod: data.hasTrainingPeriod === true,
    trainingStartMs:
      typeof data.trainingStartMs === "number" ? data.trainingStartMs : null,
    trainingEndMs:
      typeof data.trainingEndMs === "number" ? data.trainingEndMs : null,
    createdAt: toMillis(data.createdAt),
    ...(linkedChatGroupId ? { linkedChatGroupId } : {}),
  };
}

export function subscribePendingNewUsers(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, USERS), where("accountStatus", "==", "pending"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) =>
          normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
        )
        .filter((u) => u.role !== "admin");
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

export function subscribeInstructors(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, USERS), where("role", "==", "instructor"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) =>
          normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
        )
        .filter((u) => u.accountStatus !== "rejected");
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

export async function fetchActiveStudents(): Promise<UserProfile[]> {
  const { db } = getFirebase();
  const q = query(collection(db, USERS), where("role", "==", "student"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) =>
      normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
    )
    .filter((u) => u.accountStatus === "active");
}

export function subscribeStudents(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, USERS), where("role", "==", "student"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) =>
          normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
        )
        .filter((u) => u.accountStatus !== "rejected");
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

export function subscribeTrainingGroups(
  onUpdate: (groups: TrainingGroup[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, GROUPS),
    (snap) => {
      const list = snap.docs
        .map((d) =>
          normalizeGroupDoc(d.data() as Record<string, unknown>, d.id)
        )
        .sort((a, b) => b.createdAt - a.createdAt);
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/** Uid курсантов в учебной группе (поле users.groupId) — для чат-группы это не одно и то же, пока не добавите их в участники. */
export async function fetchStudentUidsInTrainingGroup(
  trainingGroupId: string
): Promise<string[]> {
  const gid = trainingGroupId.trim();
  if (!gid) return [];
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, USERS), where("groupId", "==", gid))
  );
  const out: string[] = [];
  for (const d of snap.docs) {
    const u = normalizeUserProfile(
      d.data() as Record<string, unknown>,
      d.id
    );
    if (u.role !== "student") continue;
    if (u.accountStatus !== "active" && u.accountStatus !== "pending") continue;
    out.push(u.uid);
  }
  return out;
}

export async function createTrainingGroup(input: {
  name: string;
  hasTrainingPeriod: boolean;
  trainingStartMs: number | null;
  trainingEndMs: number | null;
}): Promise<void> {
  const { db } = getFirebase();
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название группы.");
  await addDoc(collection(db, GROUPS), {
    name,
    hasTrainingPeriod: input.hasTrainingPeriod,
    trainingStartMs: input.hasTrainingPeriod ? input.trainingStartMs : null,
    trainingEndMs: input.hasTrainingPeriod ? input.trainingEndMs : null,
    createdAt: serverTimestamp(),
  });
}

export async function updateTrainingGroup(
  groupId: string,
  input: {
    name: string;
    hasTrainingPeriod: boolean;
    trainingStartMs: number | null;
    trainingEndMs: number | null;
  }
): Promise<void> {
  const { db } = getFirebase();
  const name = input.name.trim();
  if (!name) throw new Error("Укажите название группы.");
  await updateDoc(doc(db, GROUPS, groupId), {
    name,
    hasTrainingPeriod: input.hasTrainingPeriod,
    trainingStartMs: input.hasTrainingPeriod ? input.trainingStartMs : null,
    trainingEndMs: input.hasTrainingPeriod ? input.trainingEndMs : null,
  });
}

export async function deleteTrainingGroup(groupId: string): Promise<void> {
  const { db } = getFirebase();
  const usersSnap = await getDocs(
    query(collection(db, USERS), where("groupId", "==", groupId))
  );
  const batch = writeBatch(db);
  usersSnap.docs.forEach((d) => {
    batch.update(doc(db, USERS, d.id), { groupId: "" });
  });
  batch.delete(doc(db, GROUPS, groupId));
  await batch.commit();
}

export async function setStudentGroup(
  studentUid: string,
  groupId: string | null
): Promise<void> {
  const { db } = getFirebase();
  const uid = studentUid.trim();
  const userRef = doc(db, USERS, uid);
  const prevSnap = await getDoc(userRef);
  let prevGid = "";
  if (prevSnap.exists()) {
    const g = (prevSnap.data() as Record<string, unknown>).groupId;
    prevGid = typeof g === "string" ? g.trim() : "";
  }
  const nextGid = groupId?.trim() ?? "";

  await updateDoc(userRef, {
    groupId: nextGid,
  });

  if (prevGid && prevGid !== nextGid) {
    await syncStudentToLinkedChatGroup(prevGid, uid, false);
  }
  if (nextGid) {
    await syncStudentToLinkedChatGroup(nextGid, uid, true);
  }
  await syncLinkedChatsForInstructorsOfStudent(uid);
}

export async function setUserAccountStatus(
  uid: string,
  status: AccountStatus
): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, USERS, uid);
  const prevSnap = await getDoc(ref);
  let prevStatus: AccountStatus | undefined;
  let prevName = "";
  if (prevSnap.exists()) {
    const prev = normalizeUserProfile(
      prevSnap.data() as Record<string, unknown>,
      uid
    );
    prevStatus = prev.accountStatus;
    prevName = prev.displayName;
  }
  if (status === "rejected") {
    await updateDoc(ref, {
      accountStatus: status,
      rejectedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, { accountStatus: status });
  }
  if (status === "rejected") {
    void import("@/utils/audit").then(({ logAuditAction }) =>
      logAuditAction("DELETE_USER", "user", {
        entityId: uid,
        entityName: `Удалил пользователя ${prevName || uid}`,
        oldValue: prevStatus != null ? { accountStatus: prevStatus } : undefined,
        newValue: { accountStatus: "rejected" },
        status: "success",
      })
    );
  }
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, USERS, uid), { role });
}

/**
 * Снять курсантов с чужих инструкторов (только документы, где они реально в attachedStudentIds).
 * Раньше читались все инструкторы — медленно и дорого по чтениям.
 */
export async function detachStudentsFromOtherInstructors(
  studentIds: string[],
  keepInstructorId: string
): Promise<string[]> {
  const uniq = [
    ...new Set(
      studentIds.map((s) => s?.trim()).filter((s): s is string => Boolean(s))
    ),
  ];
  if (uniq.length === 0) return [];
  const { db } = getFirebase();
  const keep = keepInstructorId.trim();
  const toRemoveFrom = new Map<string, Set<string>>();

  const containSnaps = await Promise.all(
    uniq.map((sid) =>
      getDocs(
        query(
          collection(db, USERS),
          where("attachedStudentIds", "array-contains", sid)
        )
      )
    )
  );
  uniq.forEach((sid, i) => {
    for (const d of containSnaps[i]!.docs) {
      if (d.id === keep) continue;
      let set = toRemoveFrom.get(d.id);
      if (!set) {
        set = new Set();
        toRemoveFrom.set(d.id, set);
      }
      set.add(sid);
    }
  });

  if (toRemoveFrom.size === 0) return [];

  const entries = [...toRemoveFrom.entries()];
  const instructorSnaps = await Promise.all(
    entries.map(([instructorUid]) =>
      getUserDocPreferServer(doc(db, USERS, instructorUid))
    )
  );
  const batch = writeBatch(db);
  entries.forEach(([instructorUid, removeSet], i) => {
    const snap = instructorSnaps[i]!;
    if (!snap.exists()) return;
    const ids = attachedIdsFromSnapData(snap.data() as Record<string, unknown>);
    const next = ids.filter((id) => !removeSet.has(id));
    batch.update(doc(db, USERS, instructorUid), {
      attachedStudentIds: next,
    });
  });
  await batch.commit();
  return [...toRemoveFrom.keys()];
}

export async function detachStudentFromOtherInstructors(
  studentId: string,
  keepInstructorId: string
): Promise<void> {
  const detached = await detachStudentsFromOtherInstructors(
    [studentId],
    keepInstructorId
  );
  for (const oid of detached) {
    await syncInstructorLinkedChatsForInstructor(oid);
  }
}

export async function setInstructorAttachedStudents(
  instructorId: string,
  studentIds: string[]
): Promise<void> {
  const { db } = getFirebase();
  const uniq = [...new Set(studentIds)];
  const detachedOthers = await detachStudentsFromOtherInstructors(uniq, instructorId);
  await updateDoc(doc(db, USERS, instructorId), {
    attachedStudentIds: uniq,
  });
  await syncInstructorLinkedChatsForInstructor(instructorId);
  for (const oid of detachedOthers) {
    await syncInstructorLinkedChatsForInstructor(oid);
  }
}

export async function updateInstructorDetails(
  uid: string,
  fields: Partial<Pick<UserProfile, "phone" | "vehicleLabel" | "talons">>
): Promise<void> {
  await updateUserProfileFields(uid, fields);
}

export async function updateUserProfileFields(
  uid: string,
  fields: Partial<
    Pick<
      UserProfile,
      | "displayName"
      | "phone"
      | "vehicleLabel"
      | "talons"
      | "examTalons"
      | "drivesCount"
      | "role"
      | "avatarDataUrl"
    >
  >
): Promise<void> {
  const { db, auth } = getFirebase();
  const ref = doc(db, USERS, uid);

  /** Снимок до записи — для журнала талонов (после updateDoc, не блокирует сохранение). */
  let talonLog:
    | {
        targetUid: string;
        targetRole: UserRole;
        targetDisplayName: string;
        previousTalons: number;
        newTalons: number;
        talonKind: "driving" | "exam";
      }
    | null = null;

  if (fields.talons !== undefined || fields.examTalons !== undefined) {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const prev = normalizeUserProfile(snap.data() as Record<string, unknown>, uid);
      if (fields.talons !== undefined) {
        const prevTalons = normalizeTalonsValue(prev.talons);
        const newTalons = normalizeTalonsValue(fields.talons);
        if (prevTalons !== newTalons) {
          talonLog = {
            targetUid: uid,
            targetRole: prev.role,
            targetDisplayName: prev.displayName,
            previousTalons: prevTalons,
            newTalons,
            talonKind: "driving",
          };
        }
      } else {
        const prevTalons = normalizeTalonsValue(prev.examTalons);
        const newTalons = normalizeTalonsValue(fields.examTalons);
        if (prevTalons !== newTalons) {
          talonLog = {
            targetUid: uid,
            targetRole: prev.role,
            targetDisplayName: prev.displayName,
            previousTalons: prevTalons,
            newTalons,
            talonKind: "exam",
          };
        }
      }
    }
  }

  const patch: {
    displayName?: string;
    phone?: string;
    vehicleLabel?: string;
    talons?: number;
    examTalons?: number;
    drivesCount?: number;
    role?: UserRole;
    avatarDataUrl?: string | null;
  } = {};
  if (fields.displayName !== undefined) patch.displayName = fields.displayName;
  if (fields.phone !== undefined) patch.phone = fields.phone;
  if (fields.vehicleLabel !== undefined) patch.vehicleLabel = fields.vehicleLabel;
  if (fields.talons !== undefined) patch.talons = normalizeTalonsValue(fields.talons);
  if (fields.examTalons !== undefined) patch.examTalons = normalizeTalonsValue(fields.examTalons);
  if (fields.drivesCount !== undefined) patch.drivesCount = fields.drivesCount;
  if (fields.role !== undefined) patch.role = fields.role;
  if (fields.avatarDataUrl !== undefined) patch.avatarDataUrl = fields.avatarDataUrl;

  const batch = writeBatch(db);
  batch.update(ref, patch);
  if (talonLog) {
    const actorUid = auth.currentUser?.uid?.trim();
    let payload: TalonHistoryLogPayload = talonLog;
    if (actorUid) {
      const adminRef = doc(db, USERS, actorUid);
      const adminSnap = await getDoc(adminRef);
      let displayName = "";
      if (adminSnap.exists()) {
        const ap = normalizeUserProfile(adminSnap.data() as Record<string, unknown>, actorUid);
        displayName = ap.displayName;
      }
      if (!displayName.trim()) {
        displayName = auth.currentUser?.displayName?.trim() ?? "";
      }
      payload = {
        ...talonLog,
        fromUid: actorUid,
        fromRole: "admin",
        fromDisplayName: displayName,
      };
    }
    appendTalonHistoryToBatch(batch, db, payload);
  }
  await batch.commit();
}

/** Все пользователи (для вкладки «История»). */
export function subscribeAllUsersAdmin(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, USERS),
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeUserProfile(d.data() as Record<string, unknown>, d.id)
      );
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/**
 * Чтение актуального списка с сервера + запись полного массива (без arrayRemove/arrayUnion).
 */
export async function removeStudentFromInstructor(
  instructorId: string,
  studentId: string
): Promise<void> {
  const ins = instructorId?.trim();
  const sid = studentId?.trim();
  if (!ins || !sid) return;
  const { db } = getFirebase();
  const ref = doc(db, USERS, ins);
  const snap = await getUserDocPreferServer(ref);
  if (!snap.exists()) {
    throw new Error("Инструктор не найден в базе (users/" + ins + ").");
  }
  const ids = attachedIdsFromSnapData(snap.data() as Record<string, unknown>);
  if (!ids.includes(sid)) return;
  await updateDoc(ref, { attachedStudentIds: ids.filter((x) => x !== sid) });
  await syncInstructorLinkedChatsForInstructor(ins);
}

export async function attachStudentToInstructor(
  instructorId: string,
  studentId: string
): Promise<void> {
  const ins = instructorId?.trim();
  const stu = studentId?.trim();
  if (!ins || !stu) {
    throw new Error("Не указан инструктор или курсант.");
  }
  const { db } = getFirebase();
  await detachStudentFromOtherInstructors(stu, ins);
  const ref = doc(db, USERS, ins);
  const snap = await getUserDocPreferServer(ref);
  if (!snap.exists()) {
    throw new Error("Документ инструктора не найден в Firestore (users/" + ins + ").");
  }
  const ids = attachedIdsFromSnapData(snap.data() as Record<string, unknown>);
  await updateDoc(ref, { attachedStudentIds: [...new Set([...ids, stu])] });
  await syncInstructorLinkedChatsForInstructor(ins);
}
