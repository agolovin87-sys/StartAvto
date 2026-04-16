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
  downloadBlob(blob, `${filename}.doc`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * PDF: html2pdf → Blob → скачивание как у Word (не jspdf.save(): в Chromium часто блокируют после async).
 * Если не вышло — печать из iframe (без popup), в диалоге выберите «Сохранить как PDF».
 */
export async function exportToPDF(html: string, filename: string): Promise<void> {
  const { default: html2pdf } = await import("html2pdf.js");

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-export-schedule-pdf", "1");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "794px",
    maxWidth: "100vw",
    padding: "24px",
    boxSizing: "border-box",
    background: "#fff",
    color: "#000",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "2147483645",
    overflow: "hidden",
  });

  for (const node of parsed.head.querySelectorAll("style")) {
    wrapper.appendChild(node.cloneNode(true));
  }
  while (parsed.body.firstChild) {
    wrapper.appendChild(parsed.body.firstChild);
  }
  document.body.appendChild(wrapper);

  try {
    const pdfBlob = (await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        image: { type: "jpeg", quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(wrapper)
      .outputPdf("blob")) as Blob;

    if (!pdfBlob || pdfBlob.size < 64) {
      throw new Error("Пустой PDF");
    }
    downloadBlob(pdfBlob, `${filename}.pdf`);
  } catch {
    printScheduleHtmlInHiddenIframe(html);
  } finally {
    wrapper.remove();
  }
}

/**
 * Запасной вариант: печать через скрытый iframe (без popup). Размер не 0×0 — иначе часть движков даёт пустую печать.
 */
export function printScheduleHtmlInHiddenIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Печать расписания";
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "1200px",
    height: "900px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!idoc || !win) {
    iframe.remove();
    return;
  }

  idoc.open();
  idoc.write(html);
  idoc.close();

  const runPrint = (): void => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 4000);
    }
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(runPrint);
  });
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
