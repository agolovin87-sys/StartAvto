/** Запланированные админом экзамены (теория, ГИБДД) — коллекция `adminScheduledExams`. */
export type AdminScheduledExamType = "internal_theory" | "gibdd_reo";

export interface AdminScheduledExam {
  id: string;
  groupId: string;
  groupName: string;
  examType: AdminScheduledExamType;
  /** YYYY-MM-DD */
  examDate: string;
  /** HH:mm */
  examTime: string;
  createdAt: number;
}

export const ADMIN_SCHEDULED_EXAM_TYPE_LABEL: Record<AdminScheduledExamType, string> = {
  internal_theory: "Внутренний экзамен — Теория",
  gibdd_reo: "Экзамен в РЭО ГИБДД",
};
