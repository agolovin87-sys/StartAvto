/**
 * Внутренний экзамен: коллекции Firestore `internalExamSessions`, `internalExamSheets`.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  InternalExamSession,
  InternalExamSheet,
  InternalExamStudent,
} from "@/types/internalExam";
import {
  emptyErrorState,
  emptyExerciseState,
  isInternalExamPassed,
  sumInternalExamPenaltyPoints,
} from "@/types/internalExam";
import { getUserProfile } from "@/firebase/users";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const SESSIONS = "internalExamSessions";
const SHEETS = "internalExamSheets";

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

/** Локальная дата и время на момент начала экзамена (для листа). */
function formatExamStartLocal(ms: number): { examDate: string; examTime: string } {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { examDate: `${y}-${m}-${day}`, examTime: `${hh}:${mi}` };
}

/** Число или Firestore Timestamp → мс (для полей курсанта в сессии). */
function numberOrFirestoreTimestampMs(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw);
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === "function"
  ) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

function normalizeStudent(raw: unknown): InternalExamStudent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId : "";
  if (!studentId) return null;
  const status = o.status;
  const st: InternalExamStudent["status"] =
    status === "pending" ||
    status === "in_progress" ||
    status === "passed" ||
    status === "failed"
      ? status
      : "pending";
  return {
    studentId,
    studentName: typeof o.studentName === "string" ? o.studentName : "",
    studentGroup: typeof o.studentGroup === "string" ? o.studentGroup : "",
    status: st,
    examSheetId: typeof o.examSheetId === "string" ? o.examSheetId : undefined,
    examStartedAt: numberOrFirestoreTimestampMs(o.examStartedAt),
    totalPoints:
      typeof o.totalPoints === "number" && Number.isFinite(o.totalPoints)
        ? Math.floor(o.totalPoints)
        : undefined,
    completedAt: numberOrFirestoreTimestampMs(o.completedAt),
  };
}

export function normalizeInternalExamSession(
  id: string,
  data: Record<string, unknown>
): InternalExamSession {
  const studentsRaw = data.students;
  const students: InternalExamStudent[] = Array.isArray(studentsRaw)
    ? studentsRaw.map(normalizeStudent).filter((x): x is InternalExamStudent => x != null)
    : [];
  const studentIdsRaw = data.studentIds;
  const studentIds: string[] = Array.isArray(studentIdsRaw)
    ? studentIdsRaw.filter((x): x is string => typeof x === "string")
    : students.map((s) => s.studentId);

  return {
    id,
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    groupName: typeof data.groupName === "string" ? data.groupName : "",
    examDate: typeof data.examDate === "string" ? data.examDate : "",
    examTime: typeof data.examTime === "string" ? data.examTime : "",
    instructorId: typeof data.instructorId === "string" ? data.instructorId : "",
    instructorName: typeof data.instructorName === "string" ? data.instructorName : "",
    students,
    studentIds,
    createdAt: toMillis(data.createdAt),
    completedAt:
      data.completedAt == null
        ? undefined
        : toMillis(data.completedAt),
    instructorArchivedAt:
      data.instructorArchivedAt == null ? undefined : toMillis(data.instructorArchivedAt),
    adminArchivedAt: data.adminArchivedAt == null ? undefined : toMillis(data.adminArchivedAt),
    adminArchiveDismissedAt:
      data.adminArchiveDismissedAt == null ? undefined : toMillis(data.adminArchiveDismissedAt),
    instructorArchiveDismissedAt:
      data.instructorArchiveDismissedAt == null
        ? undefined
        : toMillis(data.instructorArchiveDismissedAt),
  };
}

function normalizeBoolMap(raw: unknown, keys: string[]): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const k of keys) {
    o[k] = src[k] === true;
  }
  return o;
}

export function normalizeInternalExamSheet(
  id: string,
  data: Record<string, unknown>
): InternalExamSheet {
  const exerciseKeys = emptyExerciseState();
  const errorKeys = emptyErrorState();
  const ex = normalizeBoolMap(data.exercises, Object.keys(exerciseKeys));
  const er: Record<string, boolean | number> = {};
  for (const k of Object.keys(errorKeys)) {
    const v = (data.errors as Record<string, unknown> | undefined)?.[k];
    er[k] = v === true || v === 1 || v === 1.0;
  }
  const totalPoints =
    typeof data.totalPoints === "number" && Number.isFinite(data.totalPoints)
      ? Math.floor(data.totalPoints)
      : sumInternalExamPenaltyPoints(er);
  return {
    id,
    examSessionId: typeof data.examSessionId === "string" ? data.examSessionId : "",
    studentId: typeof data.studentId === "string" ? data.studentId : "",
    studentName: typeof data.studentName === "string" ? data.studentName : "",
    instructorId: typeof data.instructorId === "string" ? data.instructorId : "",
    instructorName: typeof data.instructorName === "string" ? data.instructorName : "",
    trainingVehicleLabel:
      typeof data.trainingVehicleLabel === "string" ? data.trainingVehicleLabel : undefined,
    examDate: typeof data.examDate === "string" ? data.examDate : "",
    examTime: typeof data.examTime === "string" ? data.examTime : "",
    exercises: { ...exerciseKeys, ...ex },
    errors: { ...errorKeys, ...er },
    totalPoints,
    isPassed: data.isPassed === true,
    examinerComment: typeof data.examinerComment === "string" ? data.examinerComment : "",
    instructorSignatureDataUrl:
      typeof data.instructorSignatureDataUrl === "string" ? data.instructorSignatureDataUrl : undefined,
    studentSignatureDataUrl:
      typeof data.studentSignatureDataUrl === "string" ? data.studentSignatureDataUrl : undefined,
    createdAt: toMillis(data.createdAt),
    isDraft: data.isDraft === true,
  };
}

export type CreateSessionInput = {
  instructorId: string;
  instructorName: string;
  groupId: string;
  groupName: string;
  examDate: string;
  examTime: string;
  students: { studentId: string; studentName: string; studentGroup: string }[];
};

/** Создать сессию экзамена. */
export async function createInternalExamSession(input: CreateSessionInput): Promise<string> {
  const { db } = getFirebase();
  const studentEntries: InternalExamStudent[] = input.students.map((s) => ({
    studentId: s.studentId,
    studentName: s.studentName,
    studentGroup: s.studentGroup,
    status: "pending",
  }));
  const ref = await addDoc(collection(db, SESSIONS), {
    groupId: input.groupId,
    groupName: input.groupName.trim(),
    examDate: input.examDate,
    examTime: input.examTime,
    instructorId: input.instructorId,
    instructorName: input.instructorName.trim(),
    students: studentEntries,
    studentIds: input.students.map((s) => s.studentId),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getInternalExamSession(sessionId: string): Promise<InternalExamSession | null> {
  if (!isFirebaseConfigured) return null;
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, SESSIONS, sessionId));
  if (!snap.exists()) return null;
  return normalizeInternalExamSession(snap.id, snap.data() as Record<string, unknown>);
}

export async function getInternalExamSheet(sheetId: string): Promise<InternalExamSheet | null> {
  if (!isFirebaseConfigured) return null;
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, SHEETS, sheetId));
  if (!snap.exists()) return null;
  return normalizeInternalExamSheet(snap.id, snap.data() as Record<string, unknown>);
}

/** Подписка: сессии инструктора (новые сверху). */
export function subscribeInstructorExamSessions(
  instructorId: string,
  onUpdate: (sessions: InternalExamSession[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  if (!instructorId.trim() || !isFirebaseConfigured) {
    onUpdate([]);
    return () => {};
  }
  const { db } = getFirebase();
  const q = query(
    collection(db, SESSIONS),
    where("instructorId", "==", instructorId.trim()),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => normalizeInternalExamSession(d.id, d.data() as Record<string, unknown>)));
    },
    (e) => onError?.(e as Error)
  );
}

/** Сессии учебной группы. */
export async function fetchExamSessionsByGroup(groupId: string): Promise<InternalExamSession[]> {
  if (!isFirebaseConfigured || !groupId) return [];
  const { db } = getFirebase();
  const q = query(collection(db, SESSIONS), where("groupId", "==", groupId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeInternalExamSession(d.id, d.data() as Record<string, unknown>));
}

/** Все листы, привязанные к сессиям группы (по списку session ids). */
export async function fetchExamSheetsForSessionIds(sessionIds: string[]): Promise<InternalExamSheet[]> {
  if (!isFirebaseConfigured || sessionIds.length === 0) return [];
  const { db } = getFirebase();
  const out: InternalExamSheet[] = [];
  for (const sid of sessionIds) {
    const q = query(collection(db, SHEETS), where("examSessionId", "==", sid));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      out.push(normalizeInternalExamSheet(d.id, d.data() as Record<string, unknown>));
    }
  }
  return out;
}

/** Экзамены курсанта (по индексу studentIds). */
export async function fetchStudentExamSessions(studentId: string): Promise<InternalExamSession[]> {
  if (!isFirebaseConfigured || !studentId.trim()) return [];
  const { db } = getFirebase();
  const q = query(
    collection(db, SESSIONS),
    where("studentIds", "array-contains", studentId.trim()),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    normalizeInternalExamSession(d.id, d.data() as Record<string, unknown>)
  );
}

/** Подписка: сессии, где курсант в списке (сразу после создания сессии инструктором). */
export function subscribeStudentExamSessions(
  studentId: string,
  onUpdate: (sessions: InternalExamSession[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  if (!studentId.trim() || !isFirebaseConfigured) {
    onUpdate([]);
    return () => {};
  }
  const { db } = getFirebase();
  const q = query(
    collection(db, SESSIONS),
    where("studentIds", "array-contains", studentId.trim()),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => normalizeInternalExamSession(d.id, d.data() as Record<string, unknown>)));
    },
    (e) => onError?.(e as Error)
  );
}

/** Начать экзамен: черновик листа + статус in_progress. */
export async function startStudentExam(sessionId: string, studentId: string): Promise<string> {
  const { db } = getFirebase();
  const sref = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sref);
  if (!sessionSnap.exists()) throw new Error("Сессия не найдена");
  const session = normalizeInternalExamSession(sessionSnap.id, sessionSnap.data() as Record<string, unknown>);
  const st = session.students.find((x) => x.studentId === studentId);
  if (!st) throw new Error("Курсант не в списке сессии");
  if (st.status === "passed" || st.status === "failed") throw new Error("Экзамен уже завершён");
  if (st.examSheetId) {
    const existing = await getDoc(doc(db, SHEETS, st.examSheetId));
    if (existing.exists()) return st.examSheetId;
  }

  const startedAt = Date.now();
  const { examDate: startDate, examTime: startTime } = formatExamStartLocal(startedAt);

  let trainingVehicleLabel = "";
  try {
    const profile = await getUserProfile(session.instructorId);
    trainingVehicleLabel = (profile?.vehicleLabel ?? "").trim();
  } catch {
    /* профиль недоступен — поле останется пустым */
  }

  const sheetId = doc(collection(db, SHEETS)).id;
  const sheetData = {
    examSessionId: sessionId,
    studentId,
    studentName: st.studentName,
    instructorId: session.instructorId,
    instructorName: session.instructorName,
    trainingVehicleLabel,
    examDate: startDate,
    examTime: startTime,
    exercises: emptyExerciseState(),
    errors: emptyErrorState(),
    totalPoints: 0,
    isPassed: true,
    examinerComment: "",
    createdAt: serverTimestamp(),
    isDraft: true,
  };

  const nextStudents = session.students.map((x) =>
    x.studentId === studentId
      ? {
          ...x,
          status: "in_progress" as const,
          examSheetId: sheetId,
          examStartedAt: startedAt,
        }
      : x
  );

  const batch = writeBatch(db);
  batch.set(doc(db, SHEETS, sheetId), sheetData);
  batch.update(sref, { students: nextStudents });
  await batch.commit();
  return sheetId;
}

export type CompleteExamInput = Omit<
  InternalExamSheet,
  "id" | "createdAt" | "isDraft"
> & { id: string };

/** Завершить экзамен: сохранить лист, обновить курсанта в сессии. */
export async function completeStudentExam(
  sessionId: string,
  studentId: string,
  sheet: CompleteExamInput
): Promise<void> {
  const { db } = getFirebase();
  const totalPoints = sumInternalExamPenaltyPoints(sheet.errors);
  const passed = isInternalExamPassed(totalPoints);
  const now = Date.now();
  const sref = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sref);
  if (!sessionSnap.exists()) throw new Error("Сессия не найдена");
  const session = normalizeInternalExamSession(sessionSnap.id, sessionSnap.data() as Record<string, unknown>);

  const nextStudents = session.students.map((x) =>
    x.studentId === studentId
      ? {
          ...x,
          status: passed ? ("passed" as const) : ("failed" as const),
          totalPoints,
          completedAt: now,
          examSheetId: sheet.id,
        }
      : x
  );

  const allDone = nextStudents.every((x) => x.status === "passed" || x.status === "failed");
  const batch = writeBatch(db);
  batch.update(doc(db, SHEETS, sheet.id), {
    exercises: sheet.exercises,
    errors: sheet.errors,
    totalPoints,
    isPassed: passed,
    examinerComment: sheet.examinerComment,
    ...(sheet.trainingVehicleLabel !== undefined
      ? { trainingVehicleLabel: sheet.trainingVehicleLabel }
      : {}),
    ...(sheet.instructorSignatureDataUrl !== undefined
      ? { instructorSignatureDataUrl: sheet.instructorSignatureDataUrl }
      : {}),
    ...(sheet.studentSignatureDataUrl !== undefined
      ? { studentSignatureDataUrl: sheet.studentSignatureDataUrl }
      : {}),
    isDraft: false,
  });

  batch.update(sref, {
    students: nextStudents,
    ...(allDone ? { completedAt: now } : {}),
  });
  await batch.commit();
}

/** Сохранить черновик листа (полные объекты упражнений и ошибок). */
export async function saveExamSheetDraft(
  sheetId: string,
  data: Pick<InternalExamSheet, "exercises" | "errors" | "examinerComment">
): Promise<void> {
  const { db } = getFirebase();
  const totalPoints = sumInternalExamPenaltyPoints(data.errors);
  await updateDoc(doc(db, SHEETS, sheetId), {
    exercises: data.exercises,
    errors: data.errors,
    examinerComment: data.examinerComment,
    totalPoints,
    isPassed: isInternalExamPassed(totalPoints),
    isDraft: true,
  });
}

/**
 * Перенести сессию в архив инструктора (документ и листы не удаляются — курсант и админ видят сессию).
 */
export async function archiveInstructorExamSession(sessionId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");

  const sref = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sref);
  if (!sessionSnap.exists()) throw new Error("Сессия не найдена");
  const session = normalizeInternalExamSession(sessionSnap.id, sessionSnap.data() as Record<string, unknown>);
  if (session.instructorId !== uid) throw new Error("Нет доступа к этой сессии");

  await updateDoc(sref, { instructorArchivedAt: serverTimestamp() });
}

/** Пометить все сессии группы как архивные для админки (данные и листы не удаляются). */
export async function archiveAdminExamSessionsForGroup(groupId: string): Promise<void> {
  if (!isFirebaseConfigured || !groupId.trim()) return;
  const sessions = await fetchExamSessionsByGroup(groupId.trim());
  const toArchive = sessions.filter((s) => s.adminArchivedAt == null);
  if (toArchive.length === 0) return;
  const { db } = getFirebase();
  const batch = writeBatch(db);
  for (const s of toArchive) {
    batch.update(doc(db, SESSIONS, s.id), { adminArchivedAt: serverTimestamp() });
  }
  await batch.commit();
}

/** Убрать сессию из архива администратора (данные у курсанта и инструктора не меняются). */
export async function dismissAdminArchiveSession(sessionId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { db } = getFirebase();
  await updateDoc(doc(db, SESSIONS, sessionId), { adminArchiveDismissedAt: serverTimestamp() });
}

/** Убрать сессию из архива инструктора — только для этого инструктора, курсанты не затрагиваются. */
export async function dismissInstructorArchiveSession(sessionId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const sref = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sref);
  if (!sessionSnap.exists()) throw new Error("Сессия не найдена");
  const session = normalizeInternalExamSession(sessionSnap.id, sessionSnap.data() as Record<string, unknown>);
  if (session.instructorId !== uid) throw new Error("Нет доступа к этой сессии");
  await updateDoc(sref, { instructorArchiveDismissedAt: serverTimestamp() });
}
