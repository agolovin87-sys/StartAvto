/**
 * Экспорт экзаменационного листа: HTML для Word, PDF (через html2canvas), сводка Excel/HTML.
 */
import JSZip from "jszip";
import type { InternalExamSheet } from "@/types/internalExam";
import {
  INTERNAL_EXAM_ERRORS,
  INTERNAL_EXAM_EXERCISES,
  INTERNAL_EXAM_ERROR_POINT_ORDER,
  INTERNAL_EXAM_PASS_MAX_POINTS,
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

/** Полный HTML документа для печати / Word / PDF. */
export function generateExamWordHTML(sheet: InternalExamSheet): string {
  const resultText = sheet.isPassed ? "Сдан" : "Не сдан";
  const exerciseRows = INTERNAL_EXAM_EXERCISES.map(
    (e) =>
      `<tr><td>${escapeHtml(e.label)}</td><td style="text-align:center">${sheet.exercises[e.id] ? "✓" : "—"}</td></tr>`
  ).join("");

  const errorSections = INTERNAL_EXAM_ERROR_POINT_ORDER.map((pts) => {
    const items = INTERNAL_EXAM_ERRORS.filter((x) => x.points === pts);
    if (items.length === 0) return "";
    const rows = items
      .map((e) => {
        const on = sheet.errors[e.id] === true || sheet.errors[e.id] === 1;
        return `<tr><td>${escapeHtml(e.label)}</td><td style="text-align:center">${e.points}</td><td style="text-align:center">${on ? "✓" : "—"}</td></tr>`;
      })
      .join("");
    return `<h3 style="font-size:11pt;margin:10px 0 4px;">${escapeHtml(internalExamErrorSubsectionTitle(pts))}</h3>
<table>
<thead><tr><th>Нарушение</th><th style="width:52px">Баллы</th><th style="width:72px">Отметка</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Экзаменационный лист</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #111; margin: 16px; }
    h1 { font-size: 14pt; text-align: center; margin: 0 0 12px; }
    .meta { margin-bottom: 12px; line-height: 1.45; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    .result { font-size: 13pt; font-weight: bold; margin: 12px 0; padding: 8px 10px; border-radius: 4px; }
    .result.pass { background: #e8f5e9; color: #1b5e20; border: 1px solid #a5d6a7; }
    .result.fail { background: #ffebee; color: #b71c1c; border: 1px solid #ef9a9a; }
    .sign { margin-top: 24px; display: flex; justify-content: space-between; gap: 24px; }
    .hint { font-size: 10pt; color: #444; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>ЭКЗАМЕНАЦИОННЫЙ ЛИСТ ВНУТРЕННЕГО ЭКЗАМЕНА</h1>
  <div class="meta">
    <div><strong>Курсант:</strong> ${escapeHtml(sheet.studentName)}</div>
    <div><strong>Экзаменатор:</strong> ${escapeHtml(sheet.instructorName)}</div>
    <div><strong>Дата:</strong> ${escapeHtml(sheet.examDate)} &nbsp; <strong>Время:</strong> ${escapeHtml(sheet.examTime)}</div>
  </div>
  <h2 style="font-size:12pt;">Упражнения</h2>
  <table>
    <thead><tr><th>Упражнение</th><th style="width:80px">Выполнено</th></tr></thead>
    <tbody>${exerciseRows}</tbody>
  </table>
  <h2 style="font-size:12pt;">Ошибки и нарушения, допущенные в процессе экзамена</h2>
  ${errorSections}
  <div class="result ${sheet.isPassed ? "pass" : "fail"}">
    Итого баллов: ${sheet.totalPoints} (зачёт при сумме не более ${INTERNAL_EXAM_PASS_MAX_POINTS})<br/>
    Статус: ${resultText}
  </div>
  <div><strong>Комментарий экзаменатора:</strong></div>
  <div style="border:1px solid #999; min-height:48px; padding:8px; white-space:pre-wrap;">${escapeHtml(sheet.examinerComment || "—")}</div>
  <div class="sign">
    <div>Экзаменатор: __________________ / ${escapeHtml(sheet.instructorName)}</div>
    <div>Курсант: __________________ / ${escapeHtml(sheet.studentName)}</div>
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

/** PDF через общий конвертер HTML → canvas → PDF. */
export async function exportToPDF(sheet: InternalExamSheet, filename: string): Promise<void> {
  const html = generateExamWordHTML(sheet);
  await exportHtmlToPdf(html, filename);
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
