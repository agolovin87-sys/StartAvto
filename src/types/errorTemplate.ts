/**
 * Шаблоны ошибок для оценки уроков вождения (системные + пользовательские инструктора).
 */

export type ErrorTemplateCategory = "traffic" | "technique" | "attention" | "other";

export type ErrorTemplateSeverity = "low" | "medium" | "high";

/** Одна зафиксированная ошибка в рамках текущего урока (журнал успеваемости сессии). */
export interface LessonDriveError {
  id: string;
  templateId: string;
  name: string;
  points: number;
  timestamp: number;
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

export const DEFAULT_TEMPLATES: ErrorTemplate[] = [
  {
    id: "1",
    name: "Не включил левый поворотник",
    category: "traffic",
    severity: "medium",
    description: "Перед поворотом налево не включил указатель поворота",
    points: 3,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
  {
    id: "2",
    name: "Не включил правый поворотник",
    category: "traffic",
    severity: "medium",
    description: "Перед поворотом направо не включил указатель поворота",
    points: 3,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
  {
    id: "3",
    name: "Заглох при трогании",
    category: "technique",
    severity: "low",
    description: "Заглох двигатель при начале движения",
    points: 1,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
  {
    id: "4",
    name: "Не посмотрел в зеркало",
    category: "attention",
    severity: "high",
    description: "Перед перестроением не посмотрел в зеркало заднего вида",
    points: 5,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
  {
    id: "5",
    name: "Превышение скорости",
    category: "traffic",
    severity: "high",
    description: "Превысил установленную скорость движения",
    points: 5,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
  {
    id: "6",
    name: "Не уступил дорогу",
    category: "traffic",
    severity: "high",
    description: "Не уступил дорогу транспортному средству, имеющему преимущество",
    points: 5,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
  {
    id: "7",
    name: "Неправильная парковка",
    category: "technique",
    severity: "medium",
    description: "При парковке нарушил правила",
    points: 3,
    isCustom: false,
    usageCount: 0,
    createdAt: 0,
  },
];
