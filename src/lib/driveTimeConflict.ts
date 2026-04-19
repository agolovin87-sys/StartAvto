import type { DriveSlot, FreeDriveWindow } from "@/types";
import { parseDateKeyAndTimeToMs } from "@/lib/driveSlotTime";

/** Длительность одного занятия вождения для проверки пересечений (90 мин). */
export const DRIVE_SESSION_BLOCK_MS = 90 * 60 * 1000;

export const DRIVE_TIME_OCCUPIED_MSG = "Время занято, выберите другое!";

/**
 * Есть ли пересечение с уже занятым интервалом (слот или свободное окно в этот день).
 * Учитываются все слоты кроме отменённых; каждый слот резервирует весь 90-минутный блок по расписанию.
 * По умолчанию учитываются все окна, кроме `excludeWindowId` (текущее окно при брони).
 *
 * `ignoreOpenFreeWindows`: для прямой записи курсанта инструктором — окна со статусом `open`
 * не считаются занятостью (это та же доступность); по-прежнему мешает только `reserved`.
 */
export function hasDriveTimeOverlapOnInstructorDay(
  instructorId: string,
  dateKey: string,
  startTime: string,
  slots: DriveSlot[],
  freeWindows: FreeDriveWindow[],
  excludeWindowId?: string,
  excludeSlotId?: string,
  ignoreOpenFreeWindows = false
): boolean {
  const candMs = parseDateKeyAndTimeToMs(dateKey, startTime);
  if (candMs == null) return true;
  const candEnd = candMs + DRIVE_SESSION_BLOCK_MS;

  const overlaps = (blockStartMs: number) =>
    candMs < blockStartMs + DRIVE_SESSION_BLOCK_MS && blockStartMs < candEnd;

  for (const s of slots) {
    if (s.instructorId !== instructorId || s.dateKey !== dateKey) continue;
    if (excludeSlotId && s.id === excludeSlotId) continue;
    if (s.status === "cancelled") continue;
    const t = parseDateKeyAndTimeToMs(s.dateKey, s.startTime);
    if (t == null) continue;
    const slotEndMs = t + DRIVE_SESSION_BLOCK_MS;
    if (candMs < slotEndMs && t < candEnd) return true;
  }
  for (const w of freeWindows) {
    if (w.instructorId !== instructorId || w.dateKey !== dateKey) continue;
    if (excludeWindowId && w.id === excludeWindowId) continue;
    if (ignoreOpenFreeWindows && w.status === "open") continue;
    const t = parseDateKeyAndTimeToMs(w.dateKey, w.startTime);
    if (t != null && overlaps(t)) return true;
  }
  return false;
}

/** Id окон `open`, пересекающихся с 90-мин блоком начала `startTime` — снять дубль при записи на курсанта. */
export function listOverlappingOpenFreeWindowIds(
  instructorId: string,
  dateKey: string,
  startTime: string,
  freeWindows: FreeDriveWindow[]
): string[] {
  const candMs = parseDateKeyAndTimeToMs(dateKey, startTime);
  if (candMs == null) return [];
  const candEnd = candMs + DRIVE_SESSION_BLOCK_MS;
  const overlaps = (blockStartMs: number) =>
    candMs < blockStartMs + DRIVE_SESSION_BLOCK_MS && blockStartMs < candEnd;
  const ids: string[] = [];
  for (const w of freeWindows) {
    if (w.instructorId !== instructorId || w.dateKey !== dateKey) continue;
    if (w.status !== "open") continue;
    const t = parseDateKeyAndTimeToMs(w.dateKey, w.startTime);
    if (t != null && overlaps(t)) ids.push(w.id);
  }
  return ids;
}
