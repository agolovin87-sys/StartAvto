import { localDateKey } from "@/admin/scheduleFormat";
import type { FreeDriveWindow } from "@/types";

/** Локальная метка начала слота (дата + время). */
export function parseDateKeyAndTimeToMs(
  dateKey: string,
  startTime: string
): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(h) ||
    !Number.isFinite(mi)
  ) {
    return null;
  }
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
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

/** Минимальное время для input type="time" в день `dateKey` (если сегодня — не раньше текущего момента). */
export function minTimeForDateKey(dateKey: string): string {
  const today = localDateKey();
  if (dateKey !== today) return "00:00";
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Сдвиг локального начала слота на `addMin` минут (в т.ч. переход на следующий календарный день). */
export function addMinutesToDateKeyAndTime(
  dateKey: string,
  startTime: string,
  addMin: number
): { dateKey: string; startTime: string } | null {
  const base = parseDateKeyAndTimeToMs(dateKey, startTime);
  if (base == null || !Number.isFinite(addMin)) return null;
  const d = new Date(base + addMin * 60 * 1000);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const mi = d.getMinutes();
  return {
    dateKey: `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    startTime: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
  };
}
