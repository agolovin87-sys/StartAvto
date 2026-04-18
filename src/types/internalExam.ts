/**
 * Внутренний экзамен по вождению (до ГИБДД): сессии, листы, представления для курсанта.
 */

/** Упражнения на площадке / маршруте (отметка «выполнено»). */
export const INTERNAL_EXAM_EXERCISES: { id: string; label: string }[] = [
  { id: "parking_90", label: "Постановка на место стоянки задним ходом под углом 90°" },
  { id: "parallel_park", label: "Параллельная парковка задним ходом" },
  { id: "turnaround", label: "Разворот в ограниченном пространстве" },
  { id: "hill_start", label: "Остановка и начало движения на подъёме" },
  { id: "intersection_reg", label: "Проезд регулируемого перекрёстка" },
  { id: "intersection_unreg", label: "Проезд нерегулируемого перекрёстка" },
  { id: "turns_lr", label: "Левые и правые повороты" },
  { id: "crosswalk", label: "Проезд пешеходных переходов" },
  { id: "lane_change", label: "Перестроение и смена полосы" },
  { id: "stop_line", label: "Остановка перед стоп-линией / знаком" },
];

/** Штрафные нарушения: баллы по регламенту (грубые / средние / мелкие). */
export const INTERNAL_EXAM_ERRORS: {
  id: string;
  label: string;
  points: 5 | 3 | 1;
  tier: "coarse" | "medium" | "minor";
}[] = [
  { id: "coarse_oncoming", label: "Выезд на полосу встречного движения", points: 5, tier: "coarse" },
  { id: "coarse_red", label: "Проезд на запрещающий сигнал / знак «Движение запрещено»", points: 5, tier: "coarse" },
  { id: "coarse_yield", label: "Не уступил дорогу ТС / пешеходу (приоритет)", points: 5, tier: "coarse" },
  { id: "medium_signal", label: "Не включил указатель поворота (манёвр)", points: 3, tier: "medium" },
  { id: "medium_marking", label: "Нарушение требований разметки / знаков (не грубое)", points: 3, tier: "medium" },
  { id: "medium_lane", label: "Неправильный выбор полосы на перекрёстке", points: 3, tier: "medium" },
  { id: "minor_stall", label: "Перегруз / остановка двигателя (заглох)", points: 1, tier: "minor" },
  { id: "minor_brake", label: "Резкое торможение без необходимости", points: 1, tier: "minor" },
  { id: "minor_signal_off", label: "Не выключил указатель поворота после манёвра", points: 1, tier: "minor" },
];

/** Порог сдачи: сумма штрафных баллов не более 7 — зачёт. */
export const INTERNAL_EXAM_PASS_MAX_POINTS = 7;

export interface InternalExamStudent {
  studentId: string;
  studentName: string;
  studentGroup: string;
  status: "pending" | "in_progress" | "passed" | "failed";
  examSheetId?: string;
  totalPoints?: number;
  completedAt?: number;
}

export interface InternalExamSession {
  id: string;
  groupId: string;
  groupName: string;
  examDate: string;
  examTime: string;
  instructorId: string;
  instructorName: string;
  students: InternalExamStudent[];
  /** Для запросов array-contains по курсанту */
  studentIds: string[];
  createdAt: number;
  completedAt?: number;
}

export interface InternalExamSheet {
  id: string;
  examSessionId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  examDate: string;
  examTime: string;
  exercises: Record<string, boolean>;
  errors: Record<string, boolean | number>;
  totalPoints: number;
  isPassed: boolean;
  examinerComment: string;
  createdAt: number;
  isDraft?: boolean;
}

export interface StudentExamView {
  id: string;
  examSessionId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  examDate: string;
  examTime: string;
  status: "pending" | "in_progress" | "passed" | "failed";
  totalPoints?: number;
  examSheetId?: string;
  /** Не хранится в БД — только для клиента после генерации */
  examSheetUrl?: string;
  completedAt?: number;
}

export function emptyExerciseState(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const e of INTERNAL_EXAM_EXERCISES) o[e.id] = false;
  return o;
}

export function emptyErrorState(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const e of INTERNAL_EXAM_ERRORS) o[e.id] = false;
  return o;
}

/** Сумма баллов по отмеченным нарушениям. */
export function sumInternalExamPenaltyPoints(errors: Record<string, boolean | number>): number {
  let sum = 0;
  for (const def of INTERNAL_EXAM_ERRORS) {
    const v = errors[def.id];
    if (v === true || v === 1) sum += def.points;
  }
  return sum;
}

/** Зачёт при сумме ≤ 7, незачёт при ≥ 8. */
export function isInternalExamPassed(totalPoints: number): boolean {
  return totalPoints <= INTERNAL_EXAM_PASS_MAX_POINTS;
}
