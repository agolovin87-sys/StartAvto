import type { DriveSlot } from "@/types";

export interface ScheduleExportInstructor {
  id: string;
  name: string;
  carLabel: string;
}

/** Нормализованная строка занятия для экспорта. */
export interface ScheduleLesson {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  studentName: string; // Фамилия И.О.
  instructorId: string;
  status: DriveSlot["status"];
  /** Текст для колонки «Фактическое время» (завершённые уроки с таймерами). */
  factualTimeLabel?: string;
}

export interface ScheduleWeekRange {
  mondayDateKey: string;
  sundayDateKey: string;
  dateKeys: string[]; // 7 элементов (пн-вс)
  titleRu: string; // "с 01.01.2026 по 07.01.2026"
}

export type ScheduleGridCell = {
  studentName: string;
  factualTimeLabel: string;
};

export type ScheduleGrid = {
  times: string[];
  byDateAndTime: Map<string, Map<string, ScheduleGridCell>>;
};
