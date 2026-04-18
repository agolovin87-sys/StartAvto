/**
 * Обёртки экспорта экзамена для хуков (Word/PDF/ZIP/Excel).
 */
import type { InternalExamSheet } from "@/types/internalExam";
import {
  batchExportToZip,
  exportSummaryExcel,
  exportToPDF,
  exportToWord,
  generateExamWordHTML,
} from "@/utils/examExport";

export { generateExamWordHTML, exportToWord, exportToPDF, batchExportToZip, exportSummaryExcel };

export function exportExamSheetWord(sheet: InternalExamSheet, filename: string): void {
  exportToWord(sheet, filename);
}

export function exportExamSheetPDF(sheet: InternalExamSheet, filename: string): Promise<void> {
  return exportToPDF(sheet, filename);
}

/** Просмотр листа в новой вкладке (HTML, удобно для печати в PDF из браузера). */
export function openExamSheetPreview(sheet: InternalExamSheet): void {
  const html = generateExamWordHTML(sheet);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
