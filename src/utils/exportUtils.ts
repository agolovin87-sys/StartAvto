import { dateKeyToRuDisplay, weekdayRuFromDateKey } from "@/admin/scheduleFormat";
import { addCalendarDaysToDateKey, scheduleMondayDateKeyForWeekContaining } from "@/lib/scheduleTimezone";
import type {
  ScheduleExportInstructor,
  ScheduleGrid,
  ScheduleLesson,
  ScheduleWeekRange,
} from "@/types/schedule";

const EM_DASH = "—";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Пн-вс для даты в зоне расписания UTC+5. */
export function getWeekRange(date: Date): ScheduleWeekRange {
  const mondayDateKey = scheduleMondayDateKeyForWeekContaining(date.getTime());
  const dateKeys = Array.from({ length: 7 }, (_, i) => addCalendarDaysToDateKey(mondayDateKey, i));
  const sundayDateKey = dateKeys[6] ?? mondayDateKey;
  return {
    mondayDateKey,
    sundayDateKey,
    dateKeys,
    titleRu: `с ${dateKeyToRuDisplay(mondayDateKey)} по ${dateKeyToRuDisplay(sundayDateKey)}`,
  };
}

function buildGrid(lessons: ScheduleLesson[], week: ScheduleWeekRange): ScheduleGrid {
  const times = [...new Set(lessons.map((x) => x.time).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  const byDateAndTime = new Map<string, Map<string, string>>();
  for (const dk of week.dateKeys) byDateAndTime.set(dk, new Map<string, string>());

  for (const lesson of lessons) {
    if (!week.dateKeys.includes(lesson.date)) continue;
    if (lesson.status === "cancelled") continue;
    const row = byDateAndTime.get(lesson.date);
    if (!row) continue;
    row.set(lesson.time, lesson.studentName || EM_DASH);
  }
  return { times, byDateAndTime };
}

export function generateScheduleHTML(
  lessons: ScheduleLesson[],
  instructor: ScheduleExportInstructor,
  weekRange: ScheduleWeekRange
): string {
  const grid = buildGrid(lessons, weekRange);

  const dayHeaders = weekRange.dateKeys
    .map((dk) => `<th>${escapeHtml(weekdayRuFromDateKey(dk))}<br/>${escapeHtml(dateKeyToRuDisplay(dk))}</th>`)
    .join("");

  const bodyRows =
    grid.times.length === 0
      ? `<tr><td colspan="9">Нет занятий за выбранную неделю</td></tr>`
      : grid.times
          .map((time, idx) => {
            const cells = weekRange.dateKeys
              .map((dk) => {
                const map = grid.byDateAndTime.get(dk);
                const fio = map?.get(time) ?? EM_DASH;
                return `<td>${escapeHtml(fio)}</td>`;
              })
              .join("");
            return `<tr><td>${idx + 1}</td><td>${escapeHtml(time)}</td>${cells}</tr>`;
          })
          .join("");

  const fileTitle = `График занятий - ${instructor.name} - ${weekRange.mondayDateKey}`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(fileTitle)}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; margin: 2cm; color: #000; }
    .header-right { text-align: right; margin-bottom: 30px; line-height: 1.35; white-space: pre-line; }
    .title { text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 8px; }
    .subtitle { text-align: center; margin-bottom: 20px; }
    .info { margin-bottom: 20px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #000; padding: 6px 8px; text-align: center; vertical-align: middle; }
    th { background-color: #f0f0f0; font-weight: bold; }
    td:first-child, td:nth-child(2), th:first-child, th:nth-child(2) { white-space: nowrap; }
  </style>
</head>
<body>
  <div class="header-right">Утверждаю
Директор ООО "Старт-Авто"
_________________ А.М. Головин</div>
  <div class="title">График проведения занятий по вождению ТС</div>
  <div class="subtitle">${escapeHtml(weekRange.titleRu)}</div>
  <div class="info">
    <div><strong>Учебное ТС:</strong> ${escapeHtml(instructor.carLabel || EM_DASH)}</div>
    <div><strong>Мастер ПОВ:</strong> ${escapeHtml(instructor.name || EM_DASH)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>№ п/п</th>
        <th>Время</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
</body>
</html>`;
}

export function exportToWord(html: string, filename: string): void {
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * PDF-экспорт через диалог печати браузера (пункт «Сохранить как PDF»).
 * Это самый совместимый путь без серверной генерации документа.
 */
export async function exportToPDF(html: string, filename: string): Promise<void> {
  const w = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
  if (!w) throw new Error("Браузер заблокировал окно печати (разрешите popup).");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = filename;
  await new Promise<void>((resolve) => {
    w.onload = () => resolve();
    window.setTimeout(() => resolve(), 400);
  });
  w.focus();
  w.print();
}

export function formatWeekInputValue(date: Date): string {
  const week = getWeekRange(date);
  const monday = week.mondayDateKey;
  const d = new Date(`${monday}T12:00:00`);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** "2026-W03" -> дата в пределах выбранной недели (понедельник). */
export function parseWeekInputValue(value: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!m) return new Date();
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return new Date(targetMonday.getTime());
}
