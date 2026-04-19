/**
 * Расчёт процентов программы обучения по часам и вождению.
 */

/** Ограничение процента 0–100. */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Процент от части и целого. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

/** Оценка пройденных часов вождения: ~1.5 ч на завершённый урок без точного тайминга. */
export const APPROX_HOURS_PER_COMPLETED_DRIVE = 1.5;
