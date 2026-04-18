import { useMemo, useState } from "react";
import { useScheduleExport } from "@/hooks/useScheduleExport";
import {
  combineExportPeriodTitle,
  enumerateWeekRangesInclusive,
  exportToPDF,
  exportToWord,
  formatWeekInputValue,
  generateScheduleHTML,
  parseWeekInputValue,
} from "@/utils/exportUtils";

function safeFilePart(raw: string): string {
  const t = raw.trim().replaceAll(/\s+/g, "_");
  return t.replaceAll(/[\\/:*?"<>|]/g, "") || "instructor";
}

export function ExportSchedule() {
  const { instructors, instructorById, loading, error, fetchLessonsForWeeks } = useScheduleExport();

  const [selectedInstructorId, setSelectedInstructorId] = useState("");
  const [weekFromDate, setWeekFromDate] = useState(() => new Date());
  const [weekToDate, setWeekToDate] = useState(() => new Date());
  const [busy, setBusy] = useState<"word" | "pdf" | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const weeks = useMemo(
    () => enumerateWeekRangesInclusive(weekFromDate, weekToDate),
    [weekFromDate, weekToDate]
  );
  const periodLabel = useMemo(() => combineExportPeriodTitle(weeks), [weeks]);
  const selectedInstructor = selectedInstructorId
    ? instructorById.get(selectedInstructorId) ?? null
    : null;

  const disabled = !selectedInstructorId || loading || busy != null;

  const buildFilename = () => {
    const who = safeFilePart(selectedInstructor?.name ?? "instructor");
    const w0 = weeks[0];
    const w1 = weeks[weeks.length - 1];
    if (!w0 || !w1) return `График_${who}`;
    return `График_${who}_${w0.mondayDateKey}_${w1.sundayDateKey}`;
  };

  const doExport = async (kind: "word" | "pdf") => {
    if (!selectedInstructor) return;
    setBusy(kind);
    setLocalErr(null);
    try {
      const lessons = await fetchLessonsForWeeks(selectedInstructor.id, weeks);
      const html = generateScheduleHTML(lessons, selectedInstructor, weeks);
      const filename = buildFilename();
      if (kind === "word") exportToWord(html, filename);
      else await exportToPDF(html, filename);
      void import("@/utils/audit").then(({ logAuditAction }) =>
        logAuditAction("EXPORT_REPORT", "schedule", {
          entityId: selectedInstructor.id,
          entityName: `Экспорт графика (${kind === "word" ? "Word" : "PDF"}) · ${selectedInstructor.name} · ${periodLabel}`,
          newValue: {
            format: kind,
            instructorId: selectedInstructor.id,
            weekCount: weeks.length,
          },
          status: "success",
        })
      );
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="admin-schedule-export-card" aria-label="Экспорт графика">
      <h2 className="admin-schedule-export-title">Экспорт графика занятий</h2>
      <p className="admin-schedule-export-desc">
        Выберите инструктора и период (неделя «с» и «по» включительно). В документе — Фамилия И.О.
        курсантов по времени и дням. PDF в альбомной ориентации; если файл не сохранится, откроется
        печать — выберите «Сохранить как PDF».
      </p>

      <div className="admin-schedule-export-grid">
        <label className="admin-schedule-export-field">
          <span>Инструктор</span>
          <select
            value={selectedInstructorId}
            onChange={(e) => setSelectedInstructorId(e.target.value)}
          >
            <option value="">Выберите инструктора</option>
            {instructors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-schedule-export-field">
          <span>Неделя с (пн-вс)</span>
          <input
            type="week"
            value={formatWeekInputValue(weekFromDate)}
            onChange={(e) => setWeekFromDate(parseWeekInputValue(e.target.value))}
          />
        </label>

        <label className="admin-schedule-export-field">
          <span>Неделя по (пн-вс)</span>
          <input
            type="week"
            value={formatWeekInputValue(weekToDate)}
            onChange={(e) => setWeekToDate(parseWeekInputValue(e.target.value))}
          />
        </label>
      </div>

      <p className="admin-schedule-export-week-hint">
        Период: {periodLabel}
        {weeks.length > 1 ? ` · ${weeks.length} нед.` : null}
      </p>

      <div className="admin-schedule-export-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => void doExport("word")}
        >
          {busy === "word" ? "Формирование..." : "Экспорт в Word"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => void doExport("pdf")}
        >
          {busy === "pdf" ? "Подготовка..." : "Экспорт в PDF"}
        </button>
      </div>

      {loading ? <p className="admin-schedule-export-note">Загрузка расписания...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {localErr ? <p className="form-error">{localErr}</p> : null}
    </section>
  );
}
