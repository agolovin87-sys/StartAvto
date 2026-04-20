/**
 * Данные личного кабинета курсанта (баланс, прогресс, уроки, ошибки, рейтинг).
 */

export interface StudentBalance {
  /** Всего оплачено / начислено талонов (по журналу + текущий остаток) */
  totalTickets: number;
  usedTickets: number;
  remainingTickets: number;
  ticketsHistory: TicketTransaction[];
}

export interface TicketTransaction {
  id: string;
  date: number;
  type: "purchase" | "use" | "refund";
  amount: number;
  price?: number;
  description: string;
}

export interface DrivingLesson {
  id: string;
  date: number;
  instructorName: string;
  carModel: string;
  duration: number;
  distance: number;
  rating: number;
  /** Оценка инструктора (3–5), если уже сохранена в слоте. */
  instructorGradeStudent?: number | null;
  errors: DrivingError[];
  trackUrl?: string;
  examSheetUrl?: string;
  /** ID листа внутреннего экзамена (если урок — экзамен с сохранённым листом) */
  examSheetId?: string;
  type: "regular" | "exam";
  /** Комментарий инструктора / примечание к уроку */
  instructorComment?: string;
}

export interface DrivingError {
  id: string;
  name: string;
  category: "traffic" | "technique" | "attention";
  points: number;
  count: number;
}

export interface StudentProgress {
  programName: string;
  totalHours: number;
  completedHours: number;
  percentage: number;
  theoryProgress: number;
  drivingProgress: number;
  exams: ExamProgress[];
}

export interface ExamProgress {
  type: "internal" | "theory" | "gibdd";
  name: string;
  status: "pending" | "passed" | "failed";
  date?: number;
  score?: number;
  maxScore?: number;
}

export interface StudentRating {
  averageRating: number;
  totalLessons: number;
  bestLesson: DrivingLesson | null;
  worstLesson: DrivingLesson | null;
  commonErrors: DrivingError[];
  /** Динамика средней оценки за последние уроки, % (положительное — улучшение) */
  improvement: number;
  /** Доля курсантов группы с худшей средней оценкой (0–100), если нет данных — null */
  groupPercentileRank: number | null;
}
