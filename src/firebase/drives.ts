import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type {
  DriveCancelledBy,
  DriveSlot,
  DriveSlotStatus,
  FreeDriveWindow,
  FreeDriveWindowStatus,
} from "@/types";
import { addMinutesToDateKeyAndTime } from "@/lib/driveSlotTime";
import {
  DRIVE_TIME_OCCUPIED_MSG,
  hasDriveTimeOverlapOnInstructorDay,
  listOverlappingOpenFreeWindowIds,
} from "@/lib/driveTimeConflict";
import { getFirebase } from "./config";
import { getUserProfile, normalizeTalonsValue, normalizeUserProfile } from "./users";

const DRIVES = "driveSlots";
const FREE_WINDOWS = "freeDriveWindows";
const USERS = "users";
const ADMIN_TALON_HISTORY = "adminTalonHistory";

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

function toMillisOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function normalizeDriveSlot(
  data: Record<string, unknown>,
  id: string
): DriveSlot {
  const statusRaw = data.status;
  const status: DriveSlotStatus =
    statusRaw === "completed" ||
    statusRaw === "cancelled" ||
    statusRaw === "scheduled" ||
    statusRaw === "pending_confirmation"
      ? statusRaw
      : "scheduled";
  const by = data.cancelledByRole;
  const cancelledByRole: DriveCancelledBy | null =
    by === "admin" || by === "instructor" || by === "student" ? by : null;
  return {
    id,
    instructorId: typeof data.instructorId === "string" ? data.instructorId : "",
    dateKey: typeof data.dateKey === "string" ? data.dateKey : "",
    startTime: typeof data.startTime === "string" ? data.startTime : "",
    studentId: typeof data.studentId === "string" ? data.studentId : "",
    studentDisplayName:
      typeof data.studentDisplayName === "string" ? data.studentDisplayName : "",
    status,
    cancelledByRole,
    cancelReason: typeof data.cancelReason === "string" ? data.cancelReason : "",
    createdAt: toMillis(data.createdAt),
    liveStartedAt: toMillisOrNull(data.liveStartedAt),
    liveStudentAckAt: toMillisOrNull(data.liveStudentAckAt),
    liveTotalPausedMs:
      typeof data.liveTotalPausedMs === "number" && Number.isFinite(data.liveTotalPausedMs)
        ? Math.max(0, Math.floor(data.liveTotalPausedMs))
        : 0,
    livePausedAt: toMillisOrNull(data.livePausedAt),
    liveEndedAt: toMillisOrNull(data.liveEndedAt),
    instructorLateShiftMin:
      typeof data.instructorLateShiftMin === "number" &&
      Number.isFinite(data.instructorLateShiftMin)
        ? Math.max(0, Math.floor(data.instructorLateShiftMin))
        : null,
    studentRatingInstructor:
      typeof data.studentRatingInstructor === "number" &&
      Number.isFinite(data.studentRatingInstructor)
        ? Math.min(5, Math.max(1, Math.floor(data.studentRatingInstructor)))
        : data.studentRatingInstructor === null
          ? null
          : undefined,
    instructorRatingStudent:
      typeof data.instructorRatingStudent === "number" &&
      Number.isFinite(data.instructorRatingStudent)
        ? ([3, 4, 5].includes(Math.floor(data.instructorRatingStudent))
            ? (Math.floor(data.instructorRatingStudent) as 3 | 4 | 5)
            : undefined)
        : data.instructorRatingStudent === null
          ? null
          : undefined,
    isOwnStudent: data.isOwnStudent === true,
  };
}

/** Одноразовая загрузка слотов (например вкладка «История» без второго слушателя на тот же запрос). */
export async function fetchDriveSlotsForInstructor(
  instructorId: string
): Promise<DriveSlot[]> {
  const { db } = getFirebase();
  const q = query(
    collection(db, DRIVES),
    where("instructorId", "==", instructorId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    normalizeDriveSlot(d.data() as Record<string, unknown>, d.id)
  );
}

export function subscribeDriveSlotsForInstructor(
  instructorId: string,
  onUpdate: (slots: DriveSlot[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(
    collection(db, DRIVES),
    where("instructorId", "==", instructorId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeDriveSlot(d.data() as Record<string, unknown>, d.id)
      );
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/** Одноразовая загрузка слотов курсанта (вкладка «История» без второго onSnapshot). */
export async function fetchDriveSlotsForStudent(studentId: string): Promise<DriveSlot[]> {
  const { db } = getFirebase();
  const q = query(collection(db, DRIVES), where("studentId", "==", studentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    normalizeDriveSlot(d.data() as Record<string, unknown>, d.id)
  );
}

export function subscribeDriveSlotsForStudent(
  studentId: string,
  onUpdate: (slots: DriveSlot[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, DRIVES), where("studentId", "==", studentId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeDriveSlot(d.data() as Record<string, unknown>, d.id)
      );
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

/** Один слот по id — чтобы кнопки геолокации скрывались по факту `liveStartedAt`, даже если список слотов в UI отстаёт. */
export function subscribeDriveSlot(
  slotId: string,
  onUpdate: (slot: DriveSlot | null) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, DRIVES, slotId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(normalizeDriveSlot(snap.data() as Record<string, unknown>, snap.id));
    },
    (e) => onError?.(e)
  );
}

function normalizeFreeDriveWindow(
  data: Record<string, unknown>,
  id: string
): FreeDriveWindow {
  const statusRaw = data.status;
  const status: FreeDriveWindowStatus =
    statusRaw === "reserved" || statusRaw === "open" ? statusRaw : "open";
  return {
    id,
    instructorId: typeof data.instructorId === "string" ? data.instructorId : "",
    dateKey: typeof data.dateKey === "string" ? data.dateKey : "",
    startTime: typeof data.startTime === "string" ? data.startTime : "",
    studentId: typeof data.studentId === "string" && data.studentId.trim() ? data.studentId : null,
    status,
    createdAt: toMillis(data.createdAt),
  };
}

async function fetchDriveSlotsForInstructorDate(
  instructorId: string,
  dateKey: string
): Promise<DriveSlot[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, DRIVES), where("instructorId", "==", instructorId))
  );
  return snap.docs
    .map((d) => normalizeDriveSlot(d.data() as Record<string, unknown>, d.id))
    .filter((s) => s.dateKey === dateKey);
}

async function fetchFreeDriveWindowsForInstructorDate(
  instructorId: string,
  dateKey: string
): Promise<FreeDriveWindow[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, FREE_WINDOWS), where("instructorId", "==", instructorId))
  );
  return snap.docs
    .map((d) => normalizeFreeDriveWindow(d.data() as Record<string, unknown>, d.id))
    .filter((w) => w.dateKey === dateKey);
}

export function subscribeFreeDriveWindowsForInstructor(
  instructorId: string,
  onUpdate: (list: FreeDriveWindow[]) => void,
  onError?: (e: Error) => void
): () => void {
  const { db } = getFirebase();
  const q = query(collection(db, FREE_WINDOWS), where("instructorId", "==", instructorId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => normalizeFreeDriveWindow(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => (a.dateKey + a.startTime).localeCompare(b.dateKey + b.startTime));
      onUpdate(list);
    },
    (e) => onError?.(e)
  );
}

export function subscribeFreeDriveWindowsForStudent(
  instructorId: string,
  onUpdate: (list: FreeDriveWindow[]) => void,
  onError?: (e: Error) => void
): () => void {
  return subscribeFreeDriveWindowsForInstructor(instructorId, onUpdate, onError);
}

export async function instructorCreateFreeDriveWindow(input: {
  instructorId: string;
  dateKey: string;
  startTime: string;
}): Promise<string> {
  const { db } = getFirebase();
  const dk = input.dateKey.trim();
  const st = input.startTime.trim();
  const slots = await fetchDriveSlotsForInstructorDate(input.instructorId, dk);
  const windows = await fetchFreeDriveWindowsForInstructorDate(input.instructorId, dk);
  if (hasDriveTimeOverlapOnInstructorDay(input.instructorId, dk, st, slots, windows)) {
    throw new Error(DRIVE_TIME_OCCUPIED_MSG);
  }
  const ref = await addDoc(collection(db, FREE_WINDOWS), {
    instructorId: input.instructorId,
    dateKey: dk,
    startTime: st,
    studentId: null,
    status: "open",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function instructorDeleteFreeDriveWindow(windowId: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, FREE_WINDOWS, windowId));
}

export async function studentReserveFreeDriveWindow(windowId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const ref = doc(db, FREE_WINDOWS, windowId);
  const preSnap = await getDoc(ref);
  if (!preSnap.exists()) throw new Error("Окно не найдено");
  const preWin = normalizeFreeDriveWindow(preSnap.data() as Record<string, unknown>, windowId);
  if (preWin.status !== "open" || preWin.studentId != null) {
    throw new Error("Окно уже забронировано");
  }
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Окно не найдено");
    const win = normalizeFreeDriveWindow(snap.data() as Record<string, unknown>, windowId);
    if (win.status !== "open" || win.studentId != null) {
      throw new Error("Окно уже забронировано");
    }
    tx.update(ref, { status: "reserved", studentId: uid });
  });
}

export async function instructorCancelFreeDriveWindowReservation(windowId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, FREE_WINDOWS, windowId), {
    status: "open",
    studentId: null,
  });
}

export async function studentCancelFreeDriveWindowReservation(windowId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  await runTransaction(db, async (tx) => {
    const ref = doc(db, FREE_WINDOWS, windowId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Окно не найдено");
    const win = normalizeFreeDriveWindow(snap.data() as Record<string, unknown>, windowId);
    if (win.status !== "reserved" || win.studentId !== uid) {
      throw new Error("Бронь не найдена");
    }
    tx.update(ref, { status: "open", studentId: null });
  });
}

export async function instructorConfirmFreeDriveWindowReservation(windowId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const winRef = doc(db, FREE_WINDOWS, windowId);
  const preSnap = await getDoc(winRef);
  if (!preSnap.exists()) throw new Error("Окно не найдено");
  const preWin = normalizeFreeDriveWindow(preSnap.data() as Record<string, unknown>, windowId);
  if (preWin.instructorId !== uid) throw new Error("Нет доступа");
  if (preWin.status !== "reserved" || !preWin.studentId) throw new Error("Окно не забронировано");
  const slots = await fetchDriveSlotsForInstructorDate(preWin.instructorId, preWin.dateKey);
  const windows = await fetchFreeDriveWindowsForInstructorDate(preWin.instructorId, preWin.dateKey);
  if (
    hasDriveTimeOverlapOnInstructorDay(
      preWin.instructorId,
      preWin.dateKey,
      preWin.startTime,
      slots,
      windows,
      windowId,
      undefined,
      true
    )
  ) {
    throw new Error(DRIVE_TIME_OCCUPIED_MSG);
  }
  const openOverlapIds = listOverlappingOpenFreeWindowIds(
    preWin.instructorId,
    preWin.dateKey,
    preWin.startTime,
    windows
  );
  await runTransaction(db, async (tx) => {
    const winSnap = await tx.get(winRef);
    if (!winSnap.exists()) throw new Error("Окно не найдено");
    const win = normalizeFreeDriveWindow(winSnap.data() as Record<string, unknown>, windowId);
    if (win.instructorId !== uid) throw new Error("Нет доступа");
    if (win.status !== "reserved" || !win.studentId) throw new Error("Окно не забронировано");

    const slotRef = doc(collection(db, DRIVES));
    const stuRef = doc(db, USERS, win.studentId);
    const stuSnap = await tx.get(stuRef);
    const studentDisplayName = stuSnap.exists()
      ? normalizeUserProfile(stuSnap.data() as Record<string, unknown>, win.studentId).displayName
      : "";

    tx.set(slotRef, {
      instructorId: win.instructorId,
      dateKey: win.dateKey,
      startTime: win.startTime,
      studentId: win.studentId,
      studentDisplayName,
      status: "scheduled",
      cancelledByRole: null,
      cancelReason: "",
      createdAt: serverTimestamp(),
    });
    tx.delete(winRef);
    for (const wid of openOverlapIds) {
      if (wid === windowId) continue;
      tx.delete(doc(db, FREE_WINDOWS, wid));
    }
  });
}

export async function addDriveSlot(input: {
  instructorId: string;
  dateKey: string;
  startTime: string;
  studentId: string;
  status: DriveSlotStatus;
  cancelledByRole?: DriveCancelledBy | null;
  cancelReason?: string;
  /** Если не передано — подставляется из профиля курсанта (пока инструктор может читать users). */
  studentDisplayName?: string;
  /** Ручная запись инструктора «Свой курсант». */
  isOwnStudent?: boolean;
}): Promise<string> {
  const { db } = getFirebase();
  const dk = input.dateKey.trim();
  const st = input.startTime.trim();
  const sid = input.studentId.trim();
  let studentDisplayName = (input.studentDisplayName ?? "").trim();
  if (!studentDisplayName && sid) {
    const p = await getUserProfile(sid);
    studentDisplayName = p?.displayName?.trim() ?? "";
  }
  const slots = await fetchDriveSlotsForInstructorDate(input.instructorId, dk);
  const windows = await fetchFreeDriveWindowsForInstructorDate(input.instructorId, dk);
  if (
    hasDriveTimeOverlapOnInstructorDay(
      input.instructorId,
      dk,
      st,
      slots,
      windows,
      undefined,
      undefined,
      true
    )
  ) {
    throw new Error(DRIVE_TIME_OCCUPIED_MSG);
  }
  const openOverlapIds = listOverlappingOpenFreeWindowIds(input.instructorId, dk, st, windows);
  const slotRef = doc(collection(db, DRIVES));
  const batch = writeBatch(db);
  batch.set(slotRef, {
    instructorId: input.instructorId,
    dateKey: dk,
    startTime: st,
    studentId: sid,
    studentDisplayName,
    status: input.status,
    cancelledByRole: input.cancelledByRole ?? null,
    cancelReason: (input.cancelReason ?? "").trim(),
    isOwnStudent: input.isOwnStudent === true,
    createdAt: serverTimestamp(),
  });
  for (const wid of openOverlapIds) {
    batch.delete(doc(db, FREE_WINDOWS, wid));
  }
  await batch.commit();
  return slotRef.id;
}

/** Запись курсанта инструктором — ждёт подтверждения курсантом. */
export async function createInstructorBookingRequest(input: {
  instructorId: string;
  dateKey: string;
  startTime: string;
  studentId: string;
  studentDisplayName?: string;
}): Promise<string> {
  return addDriveSlot({
    instructorId: input.instructorId,
    dateKey: input.dateKey,
    startTime: input.startTime,
    studentId: input.studentId,
    studentDisplayName: input.studentDisplayName,
    status: "pending_confirmation",
  });
}

/** Запись «Свой курсант»: сразу попадает в график инструктора как scheduled. */
export async function createInstructorOwnStudentScheduled(input: {
  instructorId: string;
  dateKey: string;
  startTime: string;
  studentDisplayName: string;
}): Promise<string> {
  const name = input.studentDisplayName.trim();
  if (!name) throw new Error("Укажите ФИО");
  return addDriveSlot({
    instructorId: input.instructorId,
    dateKey: input.dateKey,
    startTime: input.startTime,
    /** Технически связываем слот с инструктором: это не реальный курсант из users/{uid}. */
    studentId: input.instructorId,
    studentDisplayName: name,
    status: "scheduled",
    isOwnStudent: true,
  });
}

export async function studentConfirmDriveSlot(slotId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const p = await getUserProfile(uid);
  const studentDisplayName = p?.displayName?.trim() ?? "";
  await updateDoc(doc(db, DRIVES, slotId), {
    status: "scheduled",
    cancelledByRole: null,
    cancelReason: "",
    studentDisplayName,
  });
}

export async function studentCancelDriveSlot(slotId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, DRIVES, slotId), {
    status: "cancelled",
    cancelledByRole: "student",
    cancelReason: "",
  });
}

/** Отмена уже подтверждённого вождения (статус scheduled → cancelled). */
export async function studentCancelScheduledDriveSlot(slotId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, DRIVES, slotId), {
    status: "cancelled",
    cancelledByRole: "student",
    cancelReason: "",
  });
}

export async function instructorDeleteDriveSlot(slotId: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, DRIVES, slotId));
}

/** Перенос отменённого курсантом вождения в список «Свободные окна». */
export async function instructorMoveCancelledSlotToFreeWindow(slotId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const slotRef = doc(db, DRIVES, slotId);
  const slotSnap = await getDoc(slotRef);
  if (!slotSnap.exists()) throw new Error("Запись не найдена");
  const slot = normalizeDriveSlot(slotSnap.data() as Record<string, unknown>, slotId);
  if (slot.instructorId !== uid) throw new Error("Нет доступа");
  if (slot.status !== "cancelled" || slot.cancelledByRole !== "student") {
    throw new Error("Перенос доступен только для отмены курсантом");
  }
  const slots = await fetchDriveSlotsForInstructorDate(slot.instructorId, slot.dateKey);
  const windows = await fetchFreeDriveWindowsForInstructorDate(slot.instructorId, slot.dateKey);
  if (
    hasDriveTimeOverlapOnInstructorDay(
      slot.instructorId,
      slot.dateKey,
      slot.startTime,
      slots,
      windows,
      undefined,
      slotId
    )
  ) {
    throw new Error(DRIVE_TIME_OCCUPIED_MSG);
  }
  await runTransaction(db, async (tx) => {
    const current = await tx.get(slotRef);
    if (!current.exists()) throw new Error("Запись не найдена");
    const live = normalizeDriveSlot(current.data() as Record<string, unknown>, slotId);
    if (live.instructorId !== uid) throw new Error("Нет доступа");
    if (live.status !== "cancelled" || live.cancelledByRole !== "student") {
      throw new Error("Перенос доступен только для отмены курсантом");
    }
    const winRef = doc(collection(db, FREE_WINDOWS));
    tx.set(winRef, {
      instructorId: live.instructorId,
      dateKey: live.dateKey,
      startTime: live.startTime,
      studentId: null,
      status: "open",
      createdAt: serverTimestamp(),
    });
    tx.delete(slotRef);
  });
}

/** Сдвиг начала запланированного вождения (кнопка «Опаздываю»): +5 / +10 / +15 мин. */
export type InstructorRunningLateMinutes = 5 | 10 | 15;

export async function instructorApplyRunningLateShift(
  slotId: string,
  shiftMin: InstructorRunningLateMinutes
): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const slotRef = doc(db, DRIVES, slotId);
  const snap = await getDoc(slotRef);
  if (!snap.exists()) throw new Error("Запись не найдена");
  const slot = normalizeDriveSlot(snap.data() as Record<string, unknown>, slotId);
  if (slot.instructorId !== uid) throw new Error("Нет доступа");
  if (slot.status !== "scheduled") throw new Error("Запись недоступна");
  if (slot.liveStartedAt != null) throw new Error("Вождение уже начато");
  const next = addMinutesToDateKeyAndTime(slot.dateKey, slot.startTime, shiftMin);
  if (next == null) throw new Error("Некорректное время");
  const slotsNewDay = await fetchDriveSlotsForInstructorDate(slot.instructorId, next.dateKey);
  const windowsNewDay = await fetchFreeDriveWindowsForInstructorDate(
    slot.instructorId,
    next.dateKey
  );
  if (
    hasDriveTimeOverlapOnInstructorDay(
      slot.instructorId,
      next.dateKey,
      next.startTime,
      slotsNewDay,
      windowsNewDay,
      undefined,
      slotId,
      true
    )
  ) {
    throw new Error(DRIVE_TIME_OCCUPIED_MSG);
  }
  const openOverlapIds = listOverlappingOpenFreeWindowIds(
    slot.instructorId,
    next.dateKey,
    next.startTime,
    windowsNewDay
  );
  const batch = writeBatch(db);
  batch.update(slotRef, {
    dateKey: next.dateKey,
    startTime: next.startTime,
    instructorLateShiftMin: shiftMin,
  });
  for (const wid of openOverlapIds) {
    batch.delete(doc(db, FREE_WINDOWS, wid));
  }
  await batch.commit();
}

/** Инструктор нажимает «Начать вождение»; таймер запустится после подтверждения курсантом. */
export async function instructorStartDriveLiveSession(slotId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, DRIVES, slotId), {
    liveStartedAt: serverTimestamp(),
    instructorLateShiftMin: deleteField(),
  });
}

/** Курсант подтверждает участие в начатом вождении. */
export async function studentAckDriveLiveSession(slotId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, DRIVES, slotId), {
    liveStudentAckAt: serverTimestamp(),
  });
}

/** Инструктор ставит таймер на паузу (после подтверждения курсантом). */
export async function instructorPauseDriveLiveSession(slotId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const slotRef = doc(db, DRIVES, slotId);
  const snap = await getDoc(slotRef);
  if (!snap.exists()) throw new Error("Запись не найдена");
  const slot = normalizeDriveSlot(snap.data() as Record<string, unknown>, slotId);
  if (slot.instructorId !== uid) throw new Error("Нет доступа");
  if (slot.liveStudentAckAt == null) {
    throw new Error("Сначала дождитесь подтверждения курсанта");
  }
  if (slot.livePausedAt != null) throw new Error("Сессия уже на паузе");
  await updateDoc(slotRef, {
    livePausedAt: Timestamp.fromMillis(Date.now()),
  });
}

/** Инструктор снимает паузу: длительность паузы добавляется в liveTotalPausedMs. */
export async function instructorResumeDriveLiveSession(slotId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");

  await runTransaction(db, async (transaction) => {
    const slotRef = doc(db, DRIVES, slotId);
    const snap = await transaction.get(slotRef);
    if (!snap.exists()) throw new Error("Запись не найдена");
    const slot = normalizeDriveSlot(snap.data() as Record<string, unknown>, slotId);
    if (slot.instructorId !== uid) throw new Error("Нет доступа");
    if (slot.status !== "scheduled") throw new Error("Запись недоступна");
    if (slot.livePausedAt == null) throw new Error("Сессия не на паузе");
    if (slot.liveStudentAckAt == null) throw new Error("Курсант ещё не подтвердил начало вождения");
    const add = Math.max(0, Date.now() - slot.livePausedAt);
    transaction.update(slotRef, {
      livePausedAt: deleteField(),
      liveTotalPausedMs: (slot.liveTotalPausedMs ?? 0) + add,
    });
  });
}

export type InstructorCancelLiveOptions = {
  /**
   * Причина «Курсант не явился»: как при завершении по таймеру — с курсанта −1 талон, инструктору +1,
   * записи в adminTalonHistory. Остальные причины отмены — без движения талонов.
   */
  chargeTalonToInstructor?: boolean;
};

/**
 * Отмена активного вождения инструктором.
 * cancelReason — выбранная причина и краткий комментарий.
 */
export async function instructorCancelLiveDriveSession(
  slotId: string,
  cancelReason: string,
  options?: InstructorCancelLiveOptions
): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");
  const reason = cancelReason.trim();
  if (!reason) throw new Error("Укажите причину отмены");

  const charge = options?.chargeTalonToInstructor === true;

  if (!charge) {
    const slotRef = doc(db, DRIVES, slotId);
    const slotSnap = await getDoc(slotRef);
    if (!slotSnap.exists()) throw new Error("Запись не найдена");
    const slot = normalizeDriveSlot(slotSnap.data() as Record<string, unknown>, slotId);
    const st = await getUserProfile(slot.studentId);
    const studentDisplayName = (
      slot.studentDisplayName.trim() ||
      st?.displayName?.trim() ||
      ""
    ).trim();
    await updateDoc(slotRef, {
      status: "cancelled",
      cancelledByRole: "instructor",
      cancelReason: reason,
      liveStartedAt: deleteField(),
      liveStudentAckAt: deleteField(),
      livePausedAt: deleteField(),
      liveTotalPausedMs: deleteField(),
      studentDisplayName,
    });
    return;
  }

  await runTransaction(db, async (transaction) => {
    const slotRef = doc(db, DRIVES, slotId);
    const slotSnap = await transaction.get(slotRef);
    if (!slotSnap.exists()) throw new Error("Запись не найдена");
    const slot = normalizeDriveSlot(slotSnap.data() as Record<string, unknown>, slotId);
    if (slot.instructorId !== uid) throw new Error("Нет доступа к этой записи");
    if (slot.status !== "scheduled") throw new Error("Запись уже завершена или отменена");
    if (slot.liveStartedAt == null) throw new Error("Вождение не было начато");

    const studentRef = doc(db, USERS, slot.studentId);
    const instructorRef = doc(db, USERS, uid);
    const [stSnap, insSnap] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(instructorRef),
    ]);
    if (!stSnap.exists() || !insSnap.exists()) throw new Error("Профиль не найден");

    const student = normalizeUserProfile(
      stSnap.data() as Record<string, unknown>,
      slot.studentId
    );
    const instructor = normalizeUserProfile(insSnap.data() as Record<string, unknown>, uid);
    const stTalons = normalizeTalonsValue(student.talons);
    const insTalons = normalizeTalonsValue(instructor.talons);
    if (stTalons < 1) throw new Error("У курсанта нет талонов для списания");

    transaction.update(slotRef, {
      status: "cancelled",
      cancelledByRole: "instructor",
      cancelReason: reason,
      liveStartedAt: deleteField(),
      liveStudentAckAt: deleteField(),
      livePausedAt: deleteField(),
      liveTotalPausedMs: deleteField(),
      studentDisplayName: student.displayName,
    });
    transaction.update(studentRef, { talons: stTalons - 1 });
    transaction.update(instructorRef, { talons: insTalons + 1 });

    const hStudent = doc(collection(db, ADMIN_TALON_HISTORY));
    const hInstr = doc(collection(db, ADMIN_TALON_HISTORY));
    transaction.set(hStudent, {
      at: serverTimestamp(),
      targetUid: student.uid,
      targetRole: student.role,
      targetDisplayName: student.displayName,
      delta: -1,
      previousTalons: stTalons,
      newTalons: stTalons - 1,
      fromUid: instructor.uid,
      fromRole: instructor.role,
      fromDisplayName: instructor.displayName,
    });
    transaction.set(hInstr, {
      at: serverTimestamp(),
      targetUid: instructor.uid,
      targetRole: instructor.role,
      targetDisplayName: instructor.displayName,
      delta: 1,
      previousTalons: insTalons,
      newTalons: insTalons + 1,
      fromUid: student.uid,
      fromRole: student.role,
      fromDisplayName: student.displayName,
    });
  });
}

/**
 * Завершение вождения (по таймеру или досрочно по кнопке): слот completed, с курсанта −1 талон,
 * инструктору +1, записи в журнале талонов (как при ручном сохранении в админке).
 */
export async function instructorCompleteDriveLiveSession(slotId: string): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Не выполнен вход");

  // «Свой курсант»: завершаем занятие без движения талонов.
  const ownSlotRef = doc(db, DRIVES, slotId);
  const ownSlotSnap = await getDoc(ownSlotRef);
  if (!ownSlotSnap.exists()) throw new Error("Запись не найдена");
  const ownSlot = normalizeDriveSlot(ownSlotSnap.data() as Record<string, unknown>, slotId);
  if (ownSlot.instructorId !== uid) throw new Error("Нет доступа к этой записи");
  if (ownSlot.status !== "scheduled") throw new Error("Запись уже завершена или отменена");
  if (ownSlot.liveStartedAt == null) throw new Error("Вождение не было начато");
  if (ownSlot.isOwnStudent === true) {
    await updateDoc(ownSlotRef, {
      status: "completed",
      livePausedAt: deleteField(),
      liveEndedAt: serverTimestamp(),
    });
    return;
  }

  await runTransaction(db, async (transaction) => {
    const slotRef = doc(db, DRIVES, slotId);
    const slotSnap = await transaction.get(slotRef);
    if (!slotSnap.exists()) throw new Error("Запись не найдена");
    const slot = normalizeDriveSlot(slotSnap.data() as Record<string, unknown>, slotId);
    if (slot.instructorId !== uid) throw new Error("Нет доступа к этой записи");
    if (slot.status !== "scheduled") throw new Error("Запись уже завершена или отменена");
    if (slot.liveStartedAt == null) throw new Error("Вождение не было начато");

    const studentRef = doc(db, USERS, slot.studentId);
    const instructorRef = doc(db, USERS, uid);
    const [stSnap, insSnap] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(instructorRef),
    ]);
    if (!stSnap.exists() || !insSnap.exists()) throw new Error("Профиль не найден");

    const student = normalizeUserProfile(
      stSnap.data() as Record<string, unknown>,
      slot.studentId
    );
    const instructor = normalizeUserProfile(insSnap.data() as Record<string, unknown>, uid);
    const stTalons = normalizeTalonsValue(student.talons);
    const insTalons = normalizeTalonsValue(instructor.talons);
    if (stTalons < 1) throw new Error("У курсанта нет талонов для списания");

    transaction.update(slotRef, {
      status: "completed",
      livePausedAt: deleteField(),
      liveEndedAt: serverTimestamp(),
      studentDisplayName: student.displayName,
    });
    transaction.update(studentRef, {
      talons: stTalons - 1,
      drivesCount: student.drivesCount + 1,
    });
    transaction.update(instructorRef, { talons: insTalons + 1 });

    const hStudent = doc(collection(db, ADMIN_TALON_HISTORY));
    const hInstr = doc(collection(db, ADMIN_TALON_HISTORY));
    transaction.set(hStudent, {
      at: serverTimestamp(),
      targetUid: student.uid,
      targetRole: student.role,
      targetDisplayName: student.displayName,
      delta: -1,
      previousTalons: stTalons,
      newTalons: stTalons - 1,
      fromUid: instructor.uid,
      fromRole: instructor.role,
      fromDisplayName: instructor.displayName,
    });
    transaction.set(hInstr, {
      at: serverTimestamp(),
      targetUid: instructor.uid,
      targetRole: instructor.role,
      targetDisplayName: instructor.displayName,
      delta: 1,
      previousTalons: insTalons,
      newTalons: insTalons + 1,
      fromUid: student.uid,
      fromRole: student.role,
      fromDisplayName: student.displayName,
    });
  });

  void import("@/utils/audit").then(async ({ logAuditAction }) => {
    try {
      const slotRef = doc(db, DRIVES, slotId);
      const slotSnap = await getDoc(slotRef);
      if (!slotSnap.exists()) return;
      const slotDone = normalizeDriveSlot(
        slotSnap.data() as Record<string, unknown>,
        slotId
      );
      const st = await getUserProfile(slotDone.studentId);
      const name = st?.displayName ?? slotDone.studentId;
      await logAuditAction("COMPLETE_LESSON", "lesson", {
        entityId: slotId,
        entityName: `Отметил проведение вождения: ${name} · ${slotDone.dateKey} ${slotDone.startTime}`,
        newValue: {
          status: slotDone.status,
          studentId: slotDone.studentId,
          dateKey: slotDone.dateKey,
          startTime: slotDone.startTime,
        },
        status: "success",
      });
    } catch {
      /* аудит не критичен */
    }
  });
}

/** Курсант ставит оценку инструктору (1–5) после завершённого урока; один раз. */
export async function submitStudentRatingInstructor(slotId: string, stars: number): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("Не выполнен вход");
  const n = Math.floor(stars);
  if (n < 1 || n > 5) throw new Error("Выберите оценку от 1 до 5");
  const slotRef = doc(db, DRIVES, slotId.trim());
  const snap = await getDoc(slotRef);
  if (!snap.exists()) throw new Error("Запись не найдена");
  const slot = normalizeDriveSlot(snap.data() as Record<string, unknown>, slotId.trim());
  if (slot.studentId !== uid) throw new Error("Нет доступа к этой записи");
  if (slot.status !== "completed") throw new Error("Урок не завершён");
  if (slot.studentRatingInstructor != null) throw new Error("Оценка уже сохранена");
  await updateDoc(slotRef, { studentRatingInstructor: n });
}

/** Инструктор ставит оценку курсанту (3, 4 или 5) после завершённого урока; один раз. */
export async function submitInstructorRatingStudent(
  slotId: string,
  grade: 3 | 4 | 5
): Promise<void> {
  const { db, auth } = getFirebase();
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("Не выполнен вход");
  if (![3, 4, 5].includes(grade)) throw new Error("Выберите оценку 3, 4 или 5");
  const slotRef = doc(db, DRIVES, slotId.trim());
  const snap = await getDoc(slotRef);
  if (!snap.exists()) throw new Error("Запись не найдена");
  const slot = normalizeDriveSlot(snap.data() as Record<string, unknown>, slotId.trim());
  if (slot.instructorId !== uid) throw new Error("Нет доступа к этой записи");
  if (slot.status !== "completed") throw new Error("Урок не завершён");
  if (slot.instructorRatingStudent != null) throw new Error("Оценка уже сохранена");
  await updateDoc(slotRef, { instructorRatingStudent: grade });
}
