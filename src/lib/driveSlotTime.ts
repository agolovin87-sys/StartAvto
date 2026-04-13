import {
  formatUtcMsAsScheduleHHmm,
  parseDateKeyAndTimeToUtcMs,
  scheduleDateKey,
  scheduleDateKeyFromUtcMs,
} from "@/lib/scheduleTimezone";
import type { FreeDriveWindow } from "@/types";

/** Начало слота в зоне расписания UTC+5 (dateKey + startTime → UTC ms). */
export function parseDateKeyAndTimeToMs(
  dateKey: string,
  startTime: string
): number | null {
  return parseDateKeyAndTimeToUtcMs(dateKey, startTime);
}

export function isDriveSlotStartInPast(dateKey: string, startTime: string): boolean {
  const ms = parseDateKeyAndTimeToMs(dateKey, startTime);
  if (ms == null) return true;
  return ms < Date.now();
}

/** Свободное окно ещё «open», время начала уже наступило — пора убрать с доски. */
export function isOpenFreeWindowUnbookedAndPastStart(
  w: FreeDriveWindow,
  nowMs: number
): boolean {
  if (w.status !== "open") return false;
  const ms = parseDateKeyAndTimeToMs(w.dateKey, w.startTime);
  if (ms == null) return false;
  return nowMs >= ms;
}

/** Минимальное время для input type="time" в день `dateKey` (если сегодня — не раньше текущего момента, UTC+5). */
export function minTimeForDateKey(dateKey: string): string {
  const today = scheduleDateKey();
  if (dateKey !== today) return "00:00";
  return formatUtcMsAsScheduleHHmm(Date.now());
}

/** Сдвиг локального начала слота на `addMin` минут (в т.ч. переход на следующий календарный день). */
export function addMinutesToDateKeyAndTime(
  dateKey: string,
  startTime: string,
  addMin: number
): { dateKey: string; startTime: string } | null {
  const base = parseDateKeyAndTimeToUtcMs(dateKey, startTime);
  if (base == null || !Number.isFinite(addMin)) return null;
  const resultMs = base + addMin * 60 * 1000;
  return {
    dateKey: scheduleDateKeyFromUtcMs(resultMs),
    startTime: formatUtcMsAsScheduleHHmm(resultMs),
  };
}
