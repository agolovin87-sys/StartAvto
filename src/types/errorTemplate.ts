/**
 * Шаблоны ошибок для оценки уроков вождения (системные = пункты экзаменационного листа + пользовательские инструктора).
 */
import { INTERNAL_EXAM_ERRORS } from "@/types/internalExam";

export type ErrorTemplateCategory = "traffic" | "technique" | "attention" | "other";

export type ErrorTemplateSeverity = "low" | "medium" | "high";

/** Допустимые штрафные баллы на уроке (как в экзаменационном листе), порядок выбора в UI. */
export const LESSON_TEMPLATE_ALLOWED_POINTS = [7, 5, 4, 3, 2, 1] as const;

export function clampLessonTemplatePoints(
  p: number
): (typeof LESSON_TEMPLATE_ALLOWED_POINTS)[number] {
  const n = Math.floor(Number(p));
  if ((LESSON_TEMPLATE_ALLOWED_POINTS as readonly number[]).includes(n)) {
    return n as (typeof LESSON_TEMPLATE_ALLOWED_POINTS)[number];
  }
  return 3;
}

export interface ErrorTemplate {
  id: string;
  name: string;
  category: ErrorTemplateCategory;
  severity: ErrorTemplateSeverity;
  description: string;
  points: number;
  isCustom: boolean;
  instructorId?: string;
  usageCount: number;
  createdAt: number;
}

function severityFromExamPoints(p: number): ErrorTemplateSeverity {
  if (p >= 7) return "high";
  if (p >= 5) return "high";
  if (p >= 4) return "medium";
  return "low";
}

/** Системные шаблоны — те же формулировки и баллы, что в `INTERNAL_EXAM_ERRORS` (экзаменационный лист). */
export const DEFAULT_TEMPLATES: ErrorTemplate[] = INTERNAL_EXAM_ERRORS.map((e) => ({
  id: e.id,
  name: e.label,
  category: "traffic" as ErrorTemplateCategory,
  severity: severityFromExamPoints(e.points),
  description: e.label,
  points: e.points,
  isCustom: false,
  usageCount: 0,
  createdAt: 0,
}));

/** Одна зафиксированная ошибка в рамках текущего урока (журнал успеваемости сессии). */
export interface LessonDriveError {
  id: string;
  templateId: string;
  name: string;
  points: number;
  timestamp: number;
}
