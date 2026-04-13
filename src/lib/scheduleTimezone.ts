/**
 * Единая зона расписания вождения: UTC+5 (без перехода на летнее время).
 * Совпадает с Cloud Functions (напоминания, слоты).
 */
export const SCHEDULE_TIMEZONE = "Asia/Yekaterinburg";

const WEEKDAY_SHORT_MON0: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Сегодня в зоне расписания → YYYY-MM-DD */
export function scheduleDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: SCHEDULE_TIMEZONE });
}

/** UTC-момент → календарная дата YYYY-MM-DD в зоне расписания */
export function scheduleDateKeyFromUtcMs(ms: number): string {
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: SCHEDULE_TIMEZONE });
}

/**
 * Плановое начало слота: dateKey + startTime как местное время UTC+5 → миллисекунды UTC.
 */
export function parseDateKeyAndTimeToUtcMs(dateKey: string, startTime: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  if (![y, mo, d, h, mi].every((x) => Number.isFinite(x))) return null;
  return Date.UTC(y, mo - 1, d, h - 5, mi, 0, 0);
}

/** ЧЧ:мм в зоне расписания для UTC-момента */
export function formatUtcMsAsScheduleHHmm(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHEDULE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  let h = "";
  let m = "";
  for (const p of parts) {
    if (p.type === "hour") h = p.value;
    if (p.type === "minute") m = p.value;
  }
  if (!h || !m) return "00:00";
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function weekdayMonday0FromUtcMs(ms: number): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIMEZONE,
    weekday: "short",
  }).format(new Date(ms));
  return WEEKDAY_SHORT_MON0[s] ?? 0;
}

/** Понедельник (YYYY-MM-DD) недели, в которую попадает момент nowMs, в зоне расписания */
export function scheduleMondayDateKeyForWeekContaining(nowMs: number = Date.now()): string {
  const todayKey = scheduleDateKey(new Date(nowMs));
  const noon = parseDateKeyAndTimeToUtcMs(todayKey, "12:00");
  if (noon == null) return todayKey;
  const wd = weekdayMonday0FromUtcMs(noon);
  const mondayNoon = noon - wd * 24 * 60 * 60 * 1000;
  return scheduleDateKeyFromUtcMs(mondayNoon);
}

/** Добавить календарные дни к дате (полдень якоря, зона расписания) */
export function addCalendarDaysToDateKey(dateKey: string, days: number): string {
  const ms = parseDateKeyAndTimeToUtcMs(dateKey, "12:00");
  if (ms == null) return dateKey;
  return scheduleDateKeyFromUtcMs(ms + days * 24 * 60 * 60 * 1000);
}

/** 7 дат пн–вс от понедельника mondayDateKey */
export function weekDateKeysFromMondayDateKey(mondayDateKey: string): string[] {
  const keys: string[] = [];
  let dk = mondayDateKey;
  for (let i = 0; i < 7; i++) {
    keys.push(dk);
    dk = addCalendarDaysToDateKey(dk, 1);
  }
  return keys;
}
