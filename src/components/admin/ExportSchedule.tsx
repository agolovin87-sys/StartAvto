import { useMemo, useState } from "react";
import { useScheduleExport } from "@/hooks/useScheduleExport";
import {
  exportToPDF,
  exportToWord,
  formatWeekInputValue,
  generateScheduleHTML,
  getWeekRange,
  parseWeekInputValue,
} from "@/utils/exportUtils";

function safeFilePart(raw: string): string {
  const t = raw.trim().replaceAll(/\s+/g, "_");
  return t.replaceAll(/[\\/:*?"<>|]/g, "") || "instructor";
}

export function ExportSchedule() {
  const { instructors, instructorById, loading, error, fetchLessonsForWeek } = useScheduleExport();
  const [selectedInstructorId, setSelectedInstructorId] = useState("");
  const [selectedWeekDate, setSelectedWeekDate] = useState(() => new Date());
  const [busy, setBusy] = useState<"word" | "pdf" | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const week = useMemo(() => getWeekRange(selectedWeekDate), [selectedWeekDate]);
  const selectedInstructor = selectedInstructorId
    ? instructorById.get(selectedInstructorId) ?? null
    : null;

  const disabled = !selectedInstructorId || loading || busy != null;

  const buildFilename = () => {
    const who = safeFilePart(selectedInstructor?.name ?? "instructor");
    return `График_${who}_${week.mondayDateKey}_${week.sundayDateKey}`;
  };

  const doExport = async (kind: "word" | "pdf") => {
    if (!selectedInstructor) return;
    setBusy(kind);
    setLocalErr(null);
    try {
      const lessons = await fetchLessonsForWeek(selectedInstructor.id, week);
      const html = generateScheduleHTML(lessons, selectedInstructor, week);
      const filename = buildFilename();
      if (kind === "word") exportToWord(html, filename);
      else await exportToPDF(html, filename);
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
        Выберите инструктора и неделю. В документе выводятся только Фамилия И.О. курсантов по
        времени и дням недели.
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
          <span>Неделя (пн-вс)</span>
          <input
            type="week"
            value={formatWeekInputValue(selectedWeekDate)}
            onChange={(e) => setSelectedWeekDate(parseWeekInputValue(e.target.value))}
          />
        </label>
      </div>

      <p className="admin-schedule-export-week-hint">Период: {week.titleRu}</p>

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
