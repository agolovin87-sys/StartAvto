import type { DriveSlot } from "@/types";
import { parseDateKeyAndTimeToMs } from "@/lib/driveSlotTime";

/** Длительность практического вождения по таймеру (90 мин). */
export const DRIVE_LIVE_DURATION_MIN = 90;
export const DRIVE_LIVE_DURATION_MS = DRIVE_LIVE_DURATION_MIN * 60 * 1000;

/** За сколько минут до начала слота доступна кнопка «Начать вождение». */
export const DRIVE_START_EARLY_WINDOW_MIN = 15;

/** За сколько минут до планового начала показывается кнопка «Опаздываю» (один раз, пока сдвиг не подтверждён). */
export const DRIVE_RUNNING_LATE_BUTTON_WINDOW_MIN = 20;

/** За сколько до планового начала (пока сессия не запущена) — звук, прокрутка и подсветка карточки в недельном графике. */
export const DRIVE_IMMINENT_ALERT_WINDOW_MS = 60_000;

export function driveSlotScheduledStartMs(slot: DriveSlot): number | null {
  return parseDateKeyAndTimeToMs(slot.dateKey, slot.startTime);
}

/** Кнопка «Начать» с (T − 15 мин) до конца слота, пока сессия не начата. */
export function canShowInstructorStartDriveButton(slot: DriveSlot, nowMs: number): boolean {
  if (slot.status !== "scheduled" || slot.liveStartedAt != null) return false;
  const t0 = driveSlotScheduledStartMs(slot);
  if (t0 == null) return false;
  const windowStart = t0 - DRIVE_START_EARLY_WINDOW_MIN * 60 * 1000;
  return nowMs >= windowStart;
}

/** Кнопки геолокации в графике скрываются, когда запущен таймер — курсант подтвердил начало (`liveStudentAckAt`). */
export function shouldHideWeekScheduleGeoShareButtons(slot: DriveSlot): boolean {
  if (slot.status !== "scheduled") return true;
  return slot.liveStudentAckAt != null;
}

/** За сколько часов до начала у курсанта скрывается отмена подтверждённого вождения. */
export const STUDENT_CANCEL_SCHEDULED_DRIVE_BEFORE_H = 6;

/** Отмена доступна только раньше чем за 6 ч до планового начала. */
export function canStudentCancelScheduledDriveSlot(slot: DriveSlot, nowMs: number): boolean {
  if (slot.status !== "scheduled") return false;
  const t0 = driveSlotScheduledStartMs(slot);
  if (t0 == null) return false;
  const cutoff = STUDENT_CANCEL_SCHEDULED_DRIVE_BEFORE_H * 60 * 60 * 1000;
  return nowMs < t0 - cutoff;
}

/** «Опаздываю»: только в окне [T−20 мин, T), один раз — после сдвига в слоте есть instructorLateShiftMin. */
export function canShowInstructorRunningLateButton(slot: DriveSlot, nowMs: number): boolean {
  if (slot.status !== "scheduled" || slot.liveStartedAt != null) return false;
  if (slot.instructorLateShiftMin != null) return false;
  const t0 = driveSlotScheduledStartMs(slot);
  if (t0 == null) return false;
  const windowStart = t0 - DRIVE_RUNNING_LATE_BUTTON_WINDOW_MIN * 60 * 1000;
  return nowMs >= windowStart && nowMs < t0;
}

/** Недельный график: с (T − 1 мин) до нажатия «Начать» / старта live — подсветка и одноразовые звук/скролл. */
export function isDriveSlotImminentAttention(slot: DriveSlot, nowMs: number): boolean {
  if (slot.status !== "scheduled" || slot.liveStartedAt != null) return false;
  const t0 = driveSlotScheduledStartMs(slot);
  if (t0 == null) return false;
  return nowMs >= t0 - DRIVE_IMMINENT_ALERT_WINDOW_MS;
}

export function isDriveStartBeforeScheduledTime(slot: DriveSlot, nowMs: number): boolean {
  const t0 = driveSlotScheduledStartMs(slot);
  if (t0 == null) return false;
  return nowMs < t0;
}

export function earlyStartMinutesRounded(slot: DriveSlot, nowMs: number): number {
  const t0 = driveSlotScheduledStartMs(slot);
  if (t0 == null) return 1;
  return Math.max(1, Math.ceil((t0 - nowMs) / 60000));
}
