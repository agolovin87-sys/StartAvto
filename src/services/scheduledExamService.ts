import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import type { AdminScheduledExam, AdminScheduledExamType } from "@/types/scheduledExam";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

const COL = "adminScheduledExams";

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
  return 0;
}

export function normalizeAdminScheduledExam(
  id: string,
  data: Record<string, unknown>
): AdminScheduledExam {
  const t = data.examType;
  const examType: AdminScheduledExamType =
    t === "internal_theory" || t === "gibdd_reo" ? t : "internal_theory";
  return {
    id,
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    groupName: typeof data.groupName === "string" ? data.groupName : "",
    examType,
    examDate: typeof data.examDate === "string" ? data.examDate : "",
    examTime: typeof data.examTime === "string" ? data.examTime : "",
    createdAt: toMillis(data.createdAt),
  };
}

export type CreateAdminScheduledExamInput = {
  groupId: string;
  groupName: string;
  examType: AdminScheduledExamType;
  examDate: string;
  examTime: string;
};

export async function createAdminScheduledExam(input: CreateAdminScheduledExamInput): Promise<string> {
  if (!isFirebaseConfigured) throw new Error("Firebase не настроен");
  const { db } = getFirebase();
  const ref = await addDoc(collection(db, COL), {
    groupId: input.groupId.trim(),
    groupName: input.groupName.trim(),
    examType: input.examType,
    examDate: input.examDate.trim(),
    examTime: input.examTime.trim(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteAdminScheduledExam(examId: string): Promise<void> {
  if (!isFirebaseConfigured) throw new Error("Firebase не настроен");
  const { db } = getFirebase();
  await deleteDoc(doc(db, COL, examId));
}

/** Список записей по группе (новые сверху). */
export function subscribeAdminScheduledExamsByGroup(
  groupId: string,
  onNext: (rows: AdminScheduledExam[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const gid = groupId.trim();
  if (!isFirebaseConfigured || !gid) {
    onNext([]);
    return () => {};
  }
  const { db } = getFirebase();
  /** Только `where` по `groupId` — без составного индекса с `orderBy` (сортировка на клиенте). */
  const q = query(collection(db, COL), where("groupId", "==", gid));
  return onSnapshot(
    q,
    (snap) => {
      const rows: AdminScheduledExam[] = [];
      snap.forEach((d) => {
        rows.push(normalizeAdminScheduledExam(d.id, d.data() as Record<string, unknown>));
      });
      rows.sort((a, b) => b.createdAt - a.createdAt);
      onNext(rows);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err)))
  );
}
