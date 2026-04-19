import { useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useAuth } from "@/context/AuthContext";
import { useStudentDriveLessons } from "@/hooks/useStudentDriveLessons";
import type { LessonDriveError } from "@/types/errorTemplate";
import type { DrivingLesson } from "@/types/studentCabinet";

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg className={`instr-chevron${open ? " is-open" : ""}`} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

/** Ошибки в порядке отметок инструктора во время вождения (как в журнале урока). */
function errorsFromProcess(slotId: string, errorsBySlot: Record<string, LessonDriveError[]>): string {
  const rows = errorsBySlot[slotId] ?? [];
  if (!rows.length) return "—";
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  return sorted
    .map((e) => (e.points > 0 ? `${e.name} (${e.points} б.)` : e.name))
    .join("; ");
}

/**
 * История завершённых вождений (по умолчанию свёрнута): ошибки из процесса урока; оценка — в разработке.
 */
export function StudentCabinetDrivingHistory() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const { lessons, errorsBySlot, loading, err } = useStudentDriveLessons(uid || undefined);
  const [open, setOpen] = useState(false);

  /** Хронология: первое вождение — № 1. */
  const rows = useMemo(() => [...lessons].sort((a, b) => a.date - b.date), [lessons]);

  return (
    <section className="student-cabinet-card student-cab-drive-history-card" aria-labelledby="cabinet-drive-history-title">
      <button
        type="button"
        id="cabinet-drive-history-title"
        className="instructor-home-section-toggle glossy-panel student-cab-collapse-toggle"
        aria-expanded={open}
        aria-controls="cabinet-drive-history-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="instructor-home-section-toggle-label">История вождений</span>
        <span className="instructor-home-section-toggle-meta">{rows.length}</span>
        <IconChevron open={open} />
      </button>
      {loading ? (
        <p className="field-hint student-cab-collapse-loading" role="status">
          Загрузка…
        </p>
      ) : null}
      {err ? (
        <div className="form-error student-cab-collapse-err" role="alert">
          {err}
        </div>
      ) : null}
      <div
        id="cabinet-drive-history-panel"
        className="student-cab-collapse-panel"
        hidden={!open}
      >
        <p className="student-cab-drive-history-hint">
          Ошибки — отметки инструктора во время вождения. Оценка по завершении вождения (3–5 баллов) — в разработке.
        </p>
        <div className="student-cab-drive-history-table-wrap">
          <table className="student-cab-drive-history-table">
            <thead>
              <tr>
                <th className="student-cab-drive-history-th-num">№ п/п</th>
                <th>Дата</th>
                <th>Время</th>
                <th>Инструктор</th>
                <th>Ошибки</th>
                <th>Оценка</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="student-cab-drive-history-empty">
                    Завершённых вождений пока нет.
                  </td>
                </tr>
              ) : (
                rows.map((lesson: DrivingLesson, idx) => {
                  const { date, time } = formatDateTime(lesson.date);
                  const shortIns = lesson.instructorName ? formatShortFio(lesson.instructorName) : "—";
                  return (
                    <tr key={lesson.id}>
                      <td className="student-cab-drive-history-td-num">{idx + 1}</td>
                      <td>{date}</td>
                      <td>{time}</td>
                      <td className="student-cab-drive-history-td-ins">{shortIns}</td>
                      <td className="student-cab-drive-history-td-err">
                        {errorsFromProcess(lesson.id, errorsBySlot)}
                      </td>
                      <td className="student-cab-drive-history-td-rating">
                        <span className="student-cab-drive-history-dev">В разработке</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
