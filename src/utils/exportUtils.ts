import { dateKeyToRuDisplay, weekdayRuFromDateKey } from "@/admin/scheduleFormat";
import { addCalendarDaysToDateKey, scheduleMondayDateKeyForWeekContaining } from "@/lib/scheduleTimezone";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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

/** Несколько полных недель подряд: от недели, содержащей `start`, до недели с `end` (включительно). */
export function enumerateWeekRangesInclusive(start: Date, end: Date): ScheduleWeekRange[] {
  const wA = getWeekRange(start);
  const wB = getWeekRange(end);
  let from = wA.mondayDateKey;
  let to = wB.mondayDateKey;
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  const out: ScheduleWeekRange[] = [];
  let dk = from;
  for (;;) {
    out.push(getWeekRange(new Date(`${dk}T12:00:00`)));
    if (dk === to) break;
    dk = addCalendarDaysToDateKey(dk, 7);
  }
  return out;
}

/** Заголовок периода для экспорта (одна или несколько недель). */
export function combineExportPeriodTitle(weeks: ScheduleWeekRange[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return weeks[0]!.titleRu;
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  return `с ${dateKeyToRuDisplay(first.mondayDateKey)} по ${dateKeyToRuDisplay(last.sundayDateKey)}`;
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

function tableHtmlForWeek(lessons: ScheduleLesson[], weekRange: ScheduleWeekRange): string {
  const grid = buildGrid(lessons, weekRange);

  const dayHeaders = weekRange.dateKeys
    .map((dk) => `<th>${escapeHtml(weekdayRuFromDateKey(dk))}<br/>${escapeHtml(dateKeyToRuDisplay(dk))}</th>`)
    .join("");

  const bodyRows =
    grid.times.length === 0
      ? `<tr><td colspan="9">Нет занятий за эту неделю</td></tr>`
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

  return `
  <div class="table-wrap">
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
  </div>`;
}

export function generateScheduleHTML(
  lessons: ScheduleLesson[],
  instructor: ScheduleExportInstructor,
  weekRanges: ScheduleWeekRange[]
): string {
  const weeks = weekRanges.length ? weekRanges : [getWeekRange(new Date())];
  const periodTitle = combineExportPeriodTitle(weeks);
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  const fileTitle = `График занятий - ${instructor.name} - ${first.mondayDateKey}_${last.sundayDateKey}`;

  const weekSections = weeks
    .map((wr) => {
      const caption =
        weeks.length > 1
          ? `<div class="week-caption">${escapeHtml(wr.titleRu)}</div>`
          : "";
      return `<section class="week-block">${caption}${tableHtmlForWeek(lessons, wr)}</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(fileTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 10pt;
      margin: 0.4cm 0.6cm 0.5cm;
      color: #000;
      box-sizing: border-box;
    }
    .header-right {
      text-align: right;
      margin-bottom: 6px;
      line-height: 1.25;
      white-space: pre-line;
      font-size: 10pt;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 12pt;
      margin: 0 0 4px;
    }
    .subtitle {
      text-align: center;
      margin-bottom: 6px;
      font-size: 10pt;
    }
    .info {
      margin-bottom: 8px;
      line-height: 1.3;
      font-size: 10pt;
    }
    .info div { margin: 2px 0; }
    .week-block {
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .week-block:last-child { margin-bottom: 0; }
    .week-caption {
      text-align: center;
      font-weight: bold;
      margin: 4px 0 4px;
      font-size: 10pt;
    }
    .table-wrap {
      width: 100%;
      display: flex;
      justify-content: center;
      max-width: 100%;
    }
    .table-wrap table {
      border-collapse: collapse;
      margin: 0 auto;
      max-width: 100%;
      width: 100%;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #000;
      padding: 3px 4px;
      text-align: center;
      vertical-align: middle;
      font-size: 9pt;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    th { background-color: #f0f0f0; font-weight: bold; }
    td:first-child, td:nth-child(2), th:first-child, th:nth-child(2) { white-space: nowrap; }
  </style>
</head>
<body>
  <div class="header-right">Утверждаю
Директор ООО "Старт-Авто"
_________________ А.М. Головин</div>
  <div class="title">График проведения занятий по вождению ТС</div>
  <div class="subtitle">${escapeHtml(periodTitle)}</div>
  <div class="info">
    <div><strong>Учебное ТС:</strong> ${escapeHtml(instructor.carLabel || EM_DASH)}</div>
    <div><strong>Мастер ПОВ:</strong> ${escapeHtml(instructor.name || EM_DASH)}</div>
  </div>
  ${weekSections}
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

/** A4 альбомная: в некоторых сборках jsPDF нужны разные варианты orientation. */
function createLandscapeA4Pdf(): jsPDF {
  const attempts: Array<() => jsPDF> = [
    () => new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }),
    () => new jsPDF({ unit: "mm", format: "a4", orientation: "l" }),
    () => new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }),
  ];
  for (const make of attempts) {
    const pdf = make();
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    if (w > h) return pdf;
  }
  throw new Error("jsPDF: не удалось создать альбомную страницу");
}

/**
 * Разбивает высокий canvas на страницы A4 альбомной ориентации (как в html2pdf, но без их overlay).
 * Поля marginMm: [верх, лево, низ, право] в мм.
 */
function tallCanvasToLandscapePdfBlob(
  canvas: HTMLCanvasElement,
  marginMm: [number, number, number, number]
): Blob {
  const pdf = createLandscapeA4Pdf();
  const pageFullW = pdf.internal.pageSize.getWidth();
  const pageFullH = pdf.internal.pageSize.getHeight();
  const m = marginMm;
  const innerW = pageFullW - m[1] - m[3];
  const innerH = pageFullH - m[0] - m[2];
  const innerRatio = innerH / innerW;

  const pxFullHeight = canvas.height;
  const pxPageHeight = Math.max(1, Math.floor(canvas.width * innerRatio));
  const nPages = Math.max(1, Math.ceil(pxFullHeight / pxPageHeight));

  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  if (!pageCtx) throw new Error("Canvas 2D недоступен");

  pageCanvas.width = canvas.width;
  pageCanvas.height = pxPageHeight;

  let pageHeightMm = innerH;

  for (let page = 0; page < nPages; page++) {
    pageHeightMm = innerH;
    if (page === nPages - 1 && pxFullHeight % pxPageHeight !== 0) {
      pageCanvas.height = pxFullHeight % pxPageHeight;
      pageHeightMm = (pageCanvas.height * innerW) / canvas.width;
    } else {
      pageCanvas.height = pxPageHeight;
    }

    const w = pageCanvas.width;
    const h = pageCanvas.height;
    pageCtx.fillStyle = "#ffffff";
    pageCtx.fillRect(0, 0, w, h);
    pageCtx.drawImage(canvas, 0, page * pxPageHeight, w, h, 0, 0, w, h);

    const imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
    if (page > 0) pdf.addPage("a4", "landscape");
    pdf.addImage(imgData, "JPEG", m[1], m[0], innerW, pageHeightMm);
  }

  return pdf.output("blob") as Blob;
}

/**
 * PDF: html2canvas + jsPDF напрямую. Пакет html2pdf.js ставит overlay с opacity:0 — из-за этого снимок
 * получался пустым; обходим его. При ошибке — печать из iframe.
 */
export async function exportToPDF(html: string, filename: string): Promise<void> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-export-schedule-pdf", "1");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "-16000px",
    top: "0",
    /* ~ширина печатной области A4 альбом (297 мм при 96dpi) — шире колонка таблицы */
    width: "1200px",
    maxWidth: "1200px",
    padding: "16px",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#000000",
    pointerEvents: "none",
    zIndex: "2147483645",
    overflow: "visible",
  });

  for (const node of parsed.head.querySelectorAll("style")) {
    wrapper.appendChild(node.cloneNode(true));
  }
  while (parsed.body.firstChild) {
    wrapper.appendChild(parsed.body.firstChild);
  }
  document.body.appendChild(wrapper);

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error("Пустой снимок");
    }

    const pdfBlob = tallCanvasToLandscapePdfBlob(canvas, [8, 8, 8, 8]);

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
