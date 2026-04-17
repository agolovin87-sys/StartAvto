/**
 * Начало календарного дня в локальной таймзоне.
 */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Ключ дня для группировки (локальный календарь).
 */
export function localDayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Заголовок дня в ленте чата:
 * — сегодня → «Сегодня»;
 * — вчера → «Вчера»;
 * — позавчера и раньше → полная дата вида «16 мая 2026 г.» (ru-RU).
 */
export function formatMessageDate(date: Date): string {
  const today = startOfLocalDay(new Date());
  const msgDay = startOfLocalDay(date);
  const diffDays = Math.round(
    (today.getTime() - msgDay.getTime()) / 86_400_000
  );

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export type ChatTimelineEntry<T> =
  | { type: "date"; label: string; dayKey: string }
  | { type: "message"; message: T };

/**
 * Группирует сообщения по календарным дням (локально), в порядке возрастания времени.
 * Перед группировкой массив сортируется по `createdAt`.
 */
export function groupChatMessagesByDay<T extends { createdAt: number }>(
  messages: T[]
): ChatTimelineEntry<T>[] {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const out: ChatTimelineEntry<T>[] = [];
  let lastDayKey: string | null = null;

  for (const message of sorted) {
    const dayKey = localDayKeyFromMs(message.createdAt);
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      out.push({
        type: "date",
        dayKey,
        label: formatMessageDate(new Date(message.createdAt)),
      });
    }
    out.push({ type: "message", message });
  }

  return out;
}
