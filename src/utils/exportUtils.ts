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

/**
 * Единая типографика Word/PDF: как «Обычный» в Word — Times New Roman 12 pt.
 * PDF строится из того же HTML (растр), поэтому стили совпадают.
 */
const SCHEDULE_EXPORT_FONT_FAMILY =
  '"Times New Roman", "Times New Roman PS MT", Times, "Liberation Serif", "Noto Serif", serif';

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
<html lang="ru" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="Microsoft Word" />
  <title>${escapeHtml(fileTitle)}</title>
  <!--[if gte mso 9]><xml>
   <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
   </w:WordDocument>
  </xml><![endif]-->
  <style>
    /* Общая альбомная A4 */
    @page { size: 297mm 210mm; margin: 10mm; }
    /* Секция Word: при открытии .doc в Word страница альбомная */
    @page Section1 {
      size: 297mm 210mm;
      margin: 10mm;
      mso-page-orientation: landscape;
    }
    @media print {
      @page { size: 297mm 210mm; margin: 10mm; }
      @page Section1 { size: 297mm 210mm; margin: 10mm; mso-page-orientation: landscape; }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    html {
      width: 100%;
    }
    .schedule-export-body,
    .schedule-export-body table,
    .schedule-export-body th,
    .schedule-export-body td,
    .schedule-export-body div {
      font-family: ${SCHEDULE_EXPORT_FONT_FAMILY};
    }
    .schedule-export-body {
      font-size: 12pt;
      line-height: 1.15;
      mso-ansi-font-size: 12.0pt;
      mso-line-height-rule: exactly;
      mso-ascii-font-family: "Times New Roman";
      mso-fareast-font-family: "Times New Roman";
      mso-hansi-font-family: "Times New Roman";
      mso-bidi-font-family: "Times New Roman";
      margin: 0;
      padding: 0;
      color: #000;
      box-sizing: border-box;
      max-width: 100%;
      overflow-x: hidden;
    }
    div.WordSection1 {
      page: Section1;
      mso-page-orientation: landscape;
      margin: 0.4cm 0.6cm 0.5cm;
    }
    /* Блок у правого края; все строки по правому краю */
    .header-approve {
      width: 100%;
      margin: 0 0 10px 0;
      font-size: 12pt;
      line-height: 1.35;
      text-align: right;
    }
    .header-approve-inner {
      display: inline-block;
      text-align: right;
      max-width: min(380px, 45%);
    }
    .header-approve-inner > div {
      margin: 0 0 4px 0;
    }
    .header-approve-inner > div:last-child {
      margin-bottom: 0;
    }
    .header-approve-sign {
      white-space: nowrap;
    }
    .title {
      clear: both;
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 0 0 4px;
    }
    .subtitle {
      text-align: center;
      margin-bottom: 6px;
      font-size: 12pt;
    }
    .info {
      margin-bottom: 8px;
      line-height: 1.15;
      font-size: 12pt;
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
      font-size: 12pt;
    }
    .table-wrap {
      width: 100%;
      max-width: 100%;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      box-sizing: border-box;
      padding: 0;
    }
    .table-wrap table {
      border-collapse: collapse;
      margin: 0 auto;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      table-layout: fixed;
      font-family: ${SCHEDULE_EXPORT_FONT_FAMILY};
      font-size: 12pt;
      mso-ansi-font-size: 12.0pt;
    }
    th, td {
      border: 1px solid #000;
      padding: 2px 3px;
      text-align: center;
      vertical-align: middle;
      font-size: 12pt;
      font-family: ${SCHEDULE_EXPORT_FONT_FAMILY};
      word-wrap: break-word;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    th { background-color: #f0f0f0; font-weight: bold; }
    /* Столбцы 1–2: явная ширина (в PDF и Word не сжимать до полоски) */
    .table-wrap th:first-child,
    .table-wrap td:first-child {
      width: 7em;
      min-width: 7em;
      max-width: 9em;
      white-space: normal;
      word-break: normal;
    }
    .table-wrap th:nth-child(2),
    .table-wrap td:nth-child(2) {
      width: 8.5em;
      min-width: 8.5em;
      max-width: 11em;
      white-space: nowrap;
    }
  </style>
</head>
<body class="schedule-export-body" style="mso-page-orientation: landscape;">
  <div class="WordSection1">
  <div class="header-approve">
    <div class="header-approve-inner">
      <div>Утверждаю</div>
      <div>Директор ООО "Старт-Авто"</div>
      <div class="header-approve-sign">____________ А.М. Головин</div>
    </div>
  </div>
  <div class="title">График проведения занятий по вождению ТС</div>
  <div class="subtitle">${escapeHtml(periodTitle)}</div>
  <div class="info">
    <div><strong>Учебное ТС:</strong> ${escapeHtml(instructor.carLabel || EM_DASH)}</div>
    <div><strong>Мастер ПОВ:</strong> ${escapeHtml(instructor.name || EM_DASH)}</div>
  </div>
  ${weekSections}
  </div>
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

/** A4 альбомная в мм (явная подстановка, если движок отдаёт книжные размеры). */
const PDF_A4_LANDSCAPE_MM = { w: 297, h: 210 };

function forcePdfPageLandscapeMm(pdf: jsPDF): void {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  if (w < h) {
    pdf.internal.pageSize.width = PDF_A4_LANDSCAPE_MM.w;
    pdf.internal.pageSize.height = PDF_A4_LANDSCAPE_MM.h;
  }
}

/** Создаёт документ и при необходимости принудительно задаёт A4 альбом (297×210 мм). */
function createLandscapeA4Pdf(): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  forcePdfPageLandscapeMm(pdf);
  return pdf;
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
    if (page > 0) {
      pdf.addPage("a4", "landscape");
      forcePdfPageLandscapeMm(pdf);
    }
    pdf.addImage(imgData, "JPEG", m[1], m[0], innerW, pageHeightMm);
  }

  return pdf.output("blob") as Blob;
}

/**
 * PDF: html2canvas + jsPDF. Контент должен быть в видимой области окна — иначе многие движки дают пустой canvas.
 * Кратко показываем полноэкранный белый слой на время снимка.
 */
export async function exportToPDF(html: string, filename: string): Promise<void> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");

  const shell = document.createElement("div");
  shell.setAttribute("data-export-schedule-pdf-shell", "1");
  shell.setAttribute("aria-hidden", "true");
  Object.assign(shell.style, {
    position: "fixed",
    left: "0",
    top: "0",
    right: "0",
    bottom: "0",
    zIndex: "2147483647",
    backgroundColor: "#ffffff",
    overflow: "auto",
    boxSizing: "border-box",
  });

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-export-schedule-pdf", "1");
  Object.assign(wrapper.style, {
    width: "1200px",
    maxWidth: "100%",
    margin: "0 auto",
    padding: "16px",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#000000",
    position: "relative",
    fontFamily: SCHEDULE_EXPORT_FONT_FAMILY,
    fontSize: "12pt",
    lineHeight: "1.15",
  });

  for (const node of parsed.head.querySelectorAll("style")) {
    wrapper.appendChild(node.cloneNode(true));
  }
  while (parsed.body.firstChild) {
    wrapper.appendChild(parsed.body.firstChild);
  }

  shell.appendChild(wrapper);
  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.appendChild(shell);

  await new Promise<void>((r) => {
    window.setTimeout(() => r(), 100);
  });
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });

  try {
    let canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
    });

    if (canvas.width < 4 || canvas.height < 4) {
      canvas = await html2canvas(shell, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
    }

    if (canvas.width < 4 || canvas.height < 4) {
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
    shell.remove();
    document.body.style.overflow = prevBodyOverflow;
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
    left: "-12000px",
    top: "0",
    width: "1200px",
    height: "900px",
    border: "0",
    opacity: "1",
    pointerEvents: "none",
    zIndex: "2147483646",
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
