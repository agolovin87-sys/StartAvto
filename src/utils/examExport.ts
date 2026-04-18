/**
 * Экспорт экзаменационного листа: HTML для Word, PDF (через html2canvas), сводка Excel/HTML.
 */
import JSZip from "jszip";
import type { InternalExamSheet } from "@/types/internalExam";
import {
  INTERNAL_EXAM_ERRORS,
  INTERNAL_EXAM_EXERCISES,
  INTERNAL_EXAM_ERROR_POINT_ORDER,
  INTERNAL_EXAM_FAIL_MIN_POINTS,
  internalExamErrorSubsectionTitle,
} from "@/types/internalExam";
import { exportToPDF as exportHtmlToPdf } from "@/utils/exportUtils";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** data:image/... для атрибута src (экранирование & "). */
function escapeDataUrlForAttr(dataUrl: string): string {
  return dataUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function signatureBlockHtml(label: string, name: string, dataUrl: string | undefined): string {
  const u = (dataUrl ?? "").trim();
  const has = u.startsWith("data:image/");
  const img = has
    ? `<img class="sign-img" src="${escapeDataUrlForAttr(u)}" alt="" />`
    : `<span class="sign-line" aria-hidden="true"></span>`;
  return `<div class="sign-col">
    <div class="sign-col__label">${escapeHtml(label)}</div>
    <div class="sign-col__mark">${img}</div>
    <div> / ${escapeHtml(name)}</div>
  </div>`;
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

/** Полный HTML документа для печати / Word / PDF (2 стр. A4 альбом, 8 pt, читаемо). */
export function generateExamWordHTML(sheet: InternalExamSheet): string {
  const resultText = sheet.isPassed ? "Сдан" : "Не сдан";
  const exerciseRows = INTERNAL_EXAM_EXERCISES.map(
    (e) =>
      `<tr><td>${escapeHtml(e.label)}</td><td style="text-align:center">${sheet.exercises[e.id] ? "✓" : "—"}</td></tr>`
  ).join("");

  const errorTierBlocks = INTERNAL_EXAM_ERROR_POINT_ORDER.flatMap((pts) => {
    const items = INTERNAL_EXAM_ERRORS.filter((x) => x.points === pts);
    return items.length > 0 ? [{ pts, items }] : [];
  });
  const errorSections = errorTierBlocks
    .map((block, idx) => {
      const rows = block.items
        .map((e) => {
          const on = sheet.errors[e.id] === true || sheet.errors[e.id] === 1;
          return `<tr><td>${escapeHtml(e.label)}</td><td style="text-align:center">${e.points}</td><td style="text-align:center">${on ? "✓" : "—"}</td></tr>`;
        })
        .join("");
      const divider = idx > 0 ? `<hr class="err-rule" />` : "";
      return `${divider}<h3 class="err-h3">${escapeHtml(internalExamErrorSubsectionTitle(block.pts))}</h3>
<table class="err-table">
<thead><tr><th>Нарушение</th><th style="width:40px">Б.</th><th style="width:52px">Отм.</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Экзаменационный лист</title>
  <style>
    @page { size: A4 landscape; margin: 3mm; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 8pt;
      line-height: 1.08;
      color: #111;
      margin: 0;
      padding: 3px 4px;
    }
    h1 { font-size: 8.5pt; text-align: center; margin: 0 0 2px; font-weight: 700; }
    h2 { font-size: 8pt; margin: 3px 0 2px; font-weight: 700; }
    .meta { margin-bottom: 3px; line-height: 1.15; font-size: 7.5pt; }
    table { border-collapse: collapse; width: 100%; margin: 1px 0 2px; }
    th, td { border: 1px solid #333; padding: 1px 3px; vertical-align: top; font-size: 8pt; line-height: 1.07; }
    th { background: #f0f0f0; font-weight: 600; font-size: 7.5pt; }
    .err-h3 { font-size: 8pt; margin: 2px 0 1px; font-weight: 700; }
    .err-rule { border: none; border-top: 1px solid #666; margin: 2px 0 2px; }
    .result { font-size: 8pt; font-weight: bold; margin: 3px 0; padding: 2px 4px; border-radius: 2px; line-height: 1.2; }
    .result.pass { background: #e8f5e9; color: #1b5e20; border: 1px solid #a5d6a7; }
    .result.fail { background: #ffebee; color: #b71c1c; border: 1px solid #ef9a9a; }
    .sign { margin-top: 4px; display: flex; justify-content: space-between; gap: 10px; font-size: 8pt; align-items: flex-end; flex-wrap: wrap; }
    .sign-col { flex: 1; min-width: 120px; max-width: 48%; }
    .sign-col__label { font-weight: 600; margin-bottom: 1px; }
    .sign-col__mark { min-height: 26px; display: flex; align-items: flex-end; flex-wrap: wrap; gap: 4px; }
    .sign-img { max-height: 28px; max-width: 150px; width: auto; height: auto; vertical-align: bottom; object-fit: contain; display: inline-block; }
    .sign-line { display: inline-block; min-width: 7em; border-bottom: 1px solid #333; height: 1em; vertical-align: bottom; }
    .hint { font-size: 6.5pt; color: #444; margin-top: 2px; }
    .comment-box { border: 1px solid #999; min-height: 18px; padding: 2px 3px; white-space: pre-wrap; font-size: 8pt; line-height: 1.08; }
    @media print {
      body { margin: 0; padding: 2mm 3mm; }
    }
  </style>
</head>
<body>
  <h1>ЭКЗАМЕНАЦИОННЫЙ ЛИСТ ВНУТРЕННЕГО ЭКЗАМЕНА</h1>
  <div class="meta">
    <div><strong>Курсант:</strong> ${escapeHtml(sheet.studentName)}</div>
    <div><strong>Экзаменатор:</strong> ${escapeHtml(sheet.instructorName)}</div>
    <div><strong>Учебное ТС:</strong> ${escapeHtml((sheet.trainingVehicleLabel ?? "").trim() || "—")}</div>
    <div><strong>Дата:</strong> ${escapeHtml(sheet.examDate)} &nbsp; <strong>Время:</strong> ${escapeHtml(sheet.examTime)}</div>
  </div>
  <h2>Упражнения</h2>
  <table>
    <thead><tr><th>Упражнение</th><th style="width:56px">Вып.</th></tr></thead>
    <tbody>${exerciseRows}</tbody>
  </table>
  <h2>Ошибки и нарушения, допущенные в процессе экзамена</h2>
  ${errorSections}
  <div class="result ${sheet.isPassed ? "pass" : "fail"}">
    Итого баллов: ${sheet.totalPoints} (не сдан при ${INTERNAL_EXAM_FAIL_MIN_POINTS} и более баллах)<br/>
    Статус: ${resultText}
  </div>
  <div><strong>Комментарий экзаменатора:</strong></div>
  <div class="comment-box">${escapeHtml(sheet.examinerComment || "—")}</div>
  <div class="sign">
    ${signatureBlockHtml("Экзаменатор", sheet.instructorName, sheet.instructorSignatureDataUrl)}
    ${signatureBlockHtml("Курсант", sheet.studentName, sheet.studentSignatureDataUrl)}
  </div>
  <p class="hint">Документ сформирован автоматически в системе StartAvto.</p>
</body>
</html>`;
}

/** Сохранить как .doc (Word открывает HTML). */
export function exportToWord(sheet: InternalExamSheet, filename: string): void {
  const html = generateExamWordHTML(sheet);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  downloadBlob(blob, `${filename}.doc`);
}

/**
 * PDF: та же вёрстка, что в Word, но ширина контейнера ближе к печатной зоне A4 альбом
 * (~1200px), чтобы при масштабировании на страницу текст не казался мелким и «сжатым»
 * (очень широкий canvas давал сильный даунскейл).
 */
export async function exportToPDF(sheet: InternalExamSheet, filename: string): Promise<void> {
  const html = generateExamWordHTML(sheet);
  await exportHtmlToPdf(html, filename, {
    fontSize: "8pt",
    lineHeight: "1.08",
    padding: "4px 8px",
    widthPx: 1200,
    marginMm: [5, 5, 5, 5],
    canvasScale: 2,
  });
}

/** Сводная ведомость (Excel открывает HTML-таблицу). */
export function exportSummaryExcel(
  rows: {
    groupName: string;
    studentName: string;
    examDate: string;
    examTime: string;
    totalPoints: number | string;
    result: string;
  }[],
  filename: string
): void {
  const header =
    "<tr><th>Группа</th><th>Курсант</th><th>Дата</th><th>Время</th><th>Баллы</th><th>Результат</th></tr>";
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(String(r.groupName))}</td><td>${escapeHtml(String(r.studentName))}</td><td>${escapeHtml(String(r.examDate))}</td><td>${escapeHtml(String(r.examTime))}</td><td>${escapeHtml(String(r.totalPoints))}</td><td>${escapeHtml(String(r.result))}</td></tr>`
    )
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${header}${body}</table></body></html>`;
  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  downloadBlob(blob, `${filename}.xls`);
}

/** Упаковать листы экзамена в формате .doc (Word открывает HTML) в один ZIP. */
export async function batchExportToZip(
  items: { sheet: InternalExamSheet; baseName: string }[],
  zipName: string
): Promise<void> {
  const zip = new JSZip();
  for (const { sheet, baseName } of items) {
    const html = generateExamWordHTML(sheet);
    const docBlob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const safe = baseName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
    zip.file(`${safe}.doc`, docBlob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${zipName.replace(/[\\/:*?"<>|]/g, "_")}.zip`);
}
