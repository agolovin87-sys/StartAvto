import { driveSlotScheduledStartMs } from "@/lib/driveSession";
import {
  formatUtcMsAsScheduleHHmm,
  parseDateKeyAndTimeToUtcMs,
  scheduleDateKey,
  scheduleDateKeyFromUtcMs,
  SCHEDULE_TIMEZONE,
} from "@/lib/scheduleTimezone";
import type { DriveCancelledBy, DriveSlot } from "@/types";

/** «Сегодня» и даты графика — зона UTC+5 (`SCHEDULE_TIMEZONE`). */
export function localDateKey(d = new Date()): string {
  return scheduleDateKey(d);
}

/** YYYY-MM-DD → дд.мм.гггг */
export function dateKeyToRuDisplay(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

const WEEKDAY_LABELS_RU = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

/** День недели по дате YYYY-MM-DD в зоне расписания (неделя с понедельника). */
export function weekdayRuFromDateKey(dateKey: string): string {
  const ms = parseDateKeyAndTimeToUtcMs(dateKey, "12:00");
  if (ms == null) return "";
  const long = new Intl.DateTimeFormat("ru-RU", {
    timeZone: SCHEDULE_TIMEZONE,
    weekday: "long",
  }).format(new Date(ms));
  const idx = WEEKDAY_LABELS_RU.findIndex((w) => w.toLowerCase() === long.toLowerCase());
  if (idx >= 0) return WEEKDAY_LABELS_RU[idx];
  return long ? long.charAt(0).toUpperCase() + long.slice(1) : "";
}

const cancelByLabel: Record<DriveCancelledBy, string> = {
  admin: "администратором",
  instructor: "инструктором",
  student: "курсантом",
};

export function formatDriveSlotStatus(slot: DriveSlot): string {
  if (slot.status === "completed") return "Завершено";
  if (slot.status === "pending_confirmation") return "Ожидает подтверждения";
  if (slot.status === "scheduled" && slot.liveStartedAt != null && slot.liveStudentAckAt == null) {
    return "Ожидает подтверждения курсанта";
  }
  if (slot.status === "scheduled" && slot.liveStudentAckAt != null) return "В процессе";
  if (slot.status === "scheduled") return "Запланировано";
  if (slot.status === "cancelled") {
    const by = slot.cancelledByRole
      ? cancelByLabel[slot.cancelledByRole]
      : "";
    const reason = slot.cancelReason.trim();
    if (reason && by) return `Отменено (${by}). Причина: ${reason}`;
    if (reason) return `Отменено. Причина: ${reason}`;
    if (by) return `Отменено (${by})`;
    return "Отменено";
  }
  return "—";
}

export function sortSlotsByTime(a: DriveSlot, b: DriveSlot): number {
  return a.startTime.localeCompare(b.startTime, undefined, { numeric: true });
}

export function formatMsLocalHHmm(ms: number): string {
  return formatUtcMsAsScheduleHHmm(ms);
}

function scheduleDateKeyFromLiveMs(ms: number): string {
  return scheduleDateKeyFromUtcMs(ms);
}

/** Ранний старт: liveStartedAt раньше планового слота по dateKey + startTime. */
export function isDriveStartedBeforeScheduled(slot: DriveSlot): boolean {
  const sched = driveSlotScheduledStartMs(slot);
  if (sched == null || slot.liveStartedAt == null) return false;
  return slot.liveStartedAt < sched;
}

/**
 * Строка «Дата:» в карточке вождения (недельный график): при раннем старте — день и время по факту.
 */
export function driveSlotCardDateTimeLabel(slot: DriveSlot): string {
  if (isDriveStartedBeforeScheduled(slot) && slot.liveStartedAt != null) {
    const dk = scheduleDateKeyFromLiveMs(slot.liveStartedAt);
    return `${weekdayRuFromDateKey(dk)}, ${dateKeyToRuDisplay(dk)} · ${formatMsLocalHHmm(slot.liveStartedAt)}`;
  }
  return `${weekdayRuFromDateKey(slot.dateKey)}, ${dateKeyToRuDisplay(slot.dateKey)} · ${(slot.startTime || "—").trim()}`;
}

/** Одна строка «Время:» (курсант, режим time-only). */
export function driveSlotCardTimeOnly(slot: DriveSlot): string {
  if (isDriveStartedBeforeScheduled(slot) && slot.liveStartedAt != null) {
    return formatMsLocalHHmm(slot.liveStartedAt);
  }
  return (slot.startTime || "—").trim();
}

/** Колонка «Дата» в истории вождения: при раннем старте — дата фактического начала (локально). */
export function driveHistoryTableDateCell(slot: DriveSlot): string {
  if (isDriveStartedBeforeScheduled(slot) && slot.liveStartedAt != null) {
    return dateKeyToRuDisplay(scheduleDateKeyFromLiveMs(slot.liveStartedAt));
  }
  return dateKeyToRuDisplay(slot.dateKey);
}

const FACTUAL_EMPTY = "—";

/**
 * Фактическое начало и конец вождения для экспорта графика (например: «09:00 – 10:30 (90 мин.)»).
 */
export function formatDriveSlotFactualExport(slot: DriveSlot): string {
  if (slot.status !== "completed") return FACTUAL_EMPTY;
  const end = slot.liveEndedAt;
  const start = slot.liveStudentAckAt ?? slot.liveStartedAt;
  if (end == null || start == null) return FACTUAL_EMPTY;
  const paused = slot.liveTotalPausedMs ?? 0;
  const rawMs = end - start - paused;
  const minutes = Math.max(1, Math.round(rawMs / 60_000));
  return `${formatMsLocalHHmm(start)} – ${formatMsLocalHHmm(end)} (${minutes} мин.)`;
}
