import { driveSlotScheduledStartMs } from "@/lib/driveSession";
import type { DriveCancelledBy, DriveSlot } from "@/types";

/** Сегодня в локальной зоне → YYYY-MM-DD */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

/** День недели по локальной дате YYYY-MM-DD (неделя с понедельника). */
export function weekdayRuFromDateKey(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return "";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = dt.getDay();
  const idx = day === 0 ? 6 : day - 1;
  return WEEKDAY_LABELS_RU[idx] ?? "";
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
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    const dk = localDateKeyFromMs(slot.liveStartedAt);
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
    return dateKeyToRuDisplay(localDateKeyFromMs(slot.liveStartedAt));
  }
  return dateKeyToRuDisplay(slot.dateKey);
}
