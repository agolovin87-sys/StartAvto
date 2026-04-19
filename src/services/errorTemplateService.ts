/**
 * Шаблоны ошибок: системные (в коде) + кастомные инструктора в Firestore,
 * счётчики использования и сохранение ошибок урока для слота вождения.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  ErrorTemplate,
  ErrorTemplateCategory,
  ErrorTemplateSeverity,
  LessonDriveError,
} from "@/types/errorTemplate";
import { DEFAULT_TEMPLATES, clampLessonTemplatePoints } from "@/types/errorTemplate";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const USERS = "users";
const CUSTOM = "customErrorTemplates";
const USAGE = "errorTemplateUsage";
const DRIVE_SLOT_LESSON_ERRORS = "driveSlotLessonErrors";

function normCategory(v: unknown): ErrorTemplateCategory {
  return v === "traffic" || v === "technique" || v === "attention" || v === "other"
    ? v
    : "other";
}

function normSeverity(v: unknown): ErrorTemplateSeverity {
  return v === "low" || v === "medium" || v === "high" ? v : "medium";
}

function normalizeCustomTemplate(id: string, data: Record<string, unknown>): ErrorTemplate {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    category: normCategory(data.category),
    severity: normSeverity(data.severity),
    description: typeof data.description === "string" ? data.description : "",
    points:
      typeof data.points === "number" && Number.isFinite(data.points)
        ? clampLessonTemplatePoints(data.points)
        : 3,
    isCustom: true,
    instructorId: typeof data.instructorId === "string" ? data.instructorId : undefined,
    usageCount: 0,
    createdAt:
      typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
        ? data.createdAt
        : Date.now(),
  };
}

function usageMapFromSnapshot(
  docs: { id: string; data: () => Record<string, unknown> }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of docs) {
    const raw = d.data();
    const c = raw.usageCount;
    if (typeof c === "number" && Number.isFinite(c) && c >= 0) {
      m.set(d.id, Math.floor(c));
    }
  }
  return m;
}

function mergeTemplates(
  customs: ErrorTemplate[],
  usage: Map<string, number>
): ErrorTemplate[] {
  const defaults = DEFAULT_TEMPLATES.map((t) => ({
    ...t,
    usageCount: usage.get(t.id) ?? 0,
  }));
  const customMerged = customs.map((t) => ({
    ...t,
    usageCount: usage.get(t.id) ?? 0,
  }));
  return [...defaults, ...customMerged];
}

/** Собрать список шаблонов (системные + кастомные) с актуальными счётчиками. */
export async function getTemplates(instructorId?: string): Promise<ErrorTemplate[]> {
  if (!instructorId?.trim() || !isFirebaseConfigured) {
    return DEFAULT_TEMPLATES.map((t) => ({ ...t }));
  }
  const { db } = getFirebase();
  const uid = instructorId.trim();
  const [usageSnap, customSnap] = await Promise.all([
    getDocs(collection(db, USERS, uid, USAGE)),
    getDocs(query(collection(db, USERS, uid, CUSTOM), orderBy("createdAt", "desc"))),
  ]);
  const usage = usageMapFromSnapshot(usageSnap.docs);
  const customs = customSnap.docs.map((d) =>
    normalizeCustomTemplate(d.id, d.data() as Record<string, unknown>)
  );
  return mergeTemplates(customs, usage);
}

export type ErrorTemplateCreateInput = {
  name: string;
  category: ErrorTemplateCategory;
  severity: ErrorTemplateSeverity;
  description: string;
  points: number;
};

export type ErrorTemplateUpdateInput = Partial<ErrorTemplateCreateInput>;

/** Создать свой шаблон; возвращает id документа Firestore. */
export async function createTemplate(
  instructorId: string,
  data: ErrorTemplateCreateInput
): Promise<string> {
  const { db } = getFirebase();
  const uid = instructorId.trim();
  const ref = await addDoc(collection(db, USERS, uid, CUSTOM), {
    name: data.name.trim(),
    category: data.category,
    severity: data.severity,
    description: (data.description ?? "").trim(),
    points: clampLessonTemplatePoints(data.points),
    isCustom: true,
    instructorId: uid,
    createdAt: Date.now(),
  });
  return ref.id;
}

/** Обновить только кастомный шаблон. */
export async function updateTemplate(
  instructorId: string,
  templateId: string,
  data: ErrorTemplateUpdateInput
): Promise<void> {
  const { db } = getFirebase();
  const uid = instructorId.trim();
  const ref = doc(db, USERS, uid, CUSTOM, templateId);
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.category !== undefined) patch.category = data.category;
  if (data.severity !== undefined) patch.severity = data.severity;
  if (data.description !== undefined) patch.description = data.description.trim();
  if (data.points !== undefined) {
    patch.points = clampLessonTemplatePoints(data.points);
  }
  if (Object.keys(patch).length === 0) return;
  await updateDoc(ref, patch as DocumentData);
}

/** Удалить кастомный шаблон и счётчик использования (если есть). */
export async function deleteTemplate(instructorId: string, templateId: string): Promise<void> {
  const { db } = getFirebase();
  const uid = instructorId.trim();
  await deleteDoc(doc(db, USERS, uid, CUSTOM, templateId));
  try {
    await deleteDoc(doc(db, USERS, uid, USAGE, templateId));
  } catch {
    /* документа счётчика могло не быть */
  }
}

/** Увеличить счётчик использования шаблона (системного или кастомного). */
export async function incrementUsage(instructorId: string, templateId: string): Promise<void> {
  if (!instructorId.trim() || !templateId.trim()) return;
  const { db } = getFirebase();
  const ref = doc(db, USERS, instructorId.trim(), USAGE, templateId.trim());
  await setDoc(ref, { usageCount: increment(1) }, { merge: true });
}

/**
 * Подписка на изменения кастомных шаблонов и счётчиков — для хука.
 * Возвращает объединённый отсортированный список (системные + свои).
 */
export function subscribeTemplates(
  instructorId: string,
  onUpdate: (templates: ErrorTemplate[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  if (!instructorId.trim() || !isFirebaseConfigured) {
    onUpdate(DEFAULT_TEMPLATES.map((t) => ({ ...t })));
    return () => {};
  }
  const { db } = getFirebase();
  const uid = instructorId.trim();
  const customQ = query(collection(db, USERS, uid, CUSTOM), orderBy("createdAt", "desc"));
  let lastUsage = new Map<string, number>();
  let lastCustoms: ErrorTemplate[] = [];

  const emit = () => {
    onUpdate(mergeTemplates(lastCustoms, lastUsage));
  };

  const unsubUsage = onSnapshot(
    collection(db, USERS, uid, USAGE),
    (snap) => {
      lastUsage = usageMapFromSnapshot(snap.docs);
      emit();
    },
    (e) => onError?.(e as Error)
  );

  const unsubCustom = onSnapshot(
    customQ,
    (snap) => {
      lastCustoms = snap.docs.map((d) =>
        normalizeCustomTemplate(d.id, d.data() as Record<string, unknown>)
      );
      emit();
    },
    (e) => onError?.(e as Error)
  );

  return () => {
    unsubUsage();
    unsubCustom();
  };
}

function normalizeLessonError(raw: unknown): LessonDriveError | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const templateId = typeof o.templateId === "string" ? o.templateId : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !templateId) return null;
  const points =
    typeof o.points === "number" && Number.isFinite(o.points) ? Math.floor(o.points) : 0;
  const timestamp =
    typeof o.timestamp === "number" && Number.isFinite(o.timestamp)
      ? o.timestamp
      : Date.now();
  return { id, templateId, name, points, timestamp };
}

/** Сохранить список ошибек по уроку (слоту) — для восстановления после перезагрузки. */
export async function saveDriveSlotLessonErrors(
  slotId: string,
  instructorId: string,
  studentId: string,
  errors: LessonDriveError[]
): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, DRIVE_SLOT_LESSON_ERRORS, slotId), {
    slotId,
    instructorId: instructorId.trim(),
    studentId: studentId.trim(),
    errors,
    updatedAt: serverTimestamp(),
  });
}

/** Загрузить ошибки урока по id слота. */
export async function loadDriveSlotLessonErrors(slotId: string): Promise<LessonDriveError[]> {
  if (!isFirebaseConfigured) return [];
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, DRIVE_SLOT_LESSON_ERRORS, slotId));
  if (!snap.exists()) return [];
  const data = snap.data() as Record<string, unknown>;
  const arr = data.errors;
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeLessonError).filter((x): x is LessonDriveError => x != null);
}

/**
 * Подписка на документ ошибок урока (инструктор обновляет во время вождения — курсант видит сразу в ЛК).
 */
export function subscribeDriveSlotLessonErrors(
  slotId: string,
  onUpdate: (errors: LessonDriveError[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const id = slotId.trim();
  if (!id || !isFirebaseConfigured) {
    onUpdate([]);
    return () => {};
  }
  const { db } = getFirebase();
  const ref = doc(db, DRIVE_SLOT_LESSON_ERRORS, id);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate([]);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const arr = data.errors;
      if (!Array.isArray(arr)) {
        onUpdate([]);
        return;
      }
      onUpdate(arr.map(normalizeLessonError).filter((x): x is LessonDriveError => x != null));
    },
    (e) => onError?.(e as Error)
  );
}
